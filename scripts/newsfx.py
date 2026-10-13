"""
보도 반응 분석(이벤트 스터디) — 기사 유형·매체 등급·발행 시점별 주가·거래량 반응 집계

입력: data/news_raw.jsonl(기사 × 매체), 회사별 KRX 시세(종가·거래량), data/index.json(코스닥·코스피), 공시일
출력: data/newsfx.json

방법
- 보도(이벤트): 같은 회사, 하루 안팎, 비슷한 제목의 기사 묶음. 실린 매체와 등급을 함께 기록
- D0: 첫 기사 시각 기준 거래일 (15:30 이후·휴장일 발행은 다음 거래일)
- 초과수익률 AR = 종목 수익률 − 시장지수 수익률 (지수가 아직 없으면 종목 수익률, 화면에 표시)
- CAR(0,2) = D0~D+2 AR 합 · 거래량 배수 = D0~D+2 평균 ÷ D-21~D-2 평균
- 집계에서 빼는 보도: 시세·증권 기사(주가가 기사를 만든 경우), D-1~D+2에 공시가 있는 보도, 같은 회사 앞 보도와 3거래일 안에 겹치는 보도
"""
import bisect
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from activity import _norm, _similar

ROOT = Path(__file__).resolve().parent.parent
MEDIA_CFG = ROOT / "config" / "media.json"
KST = timezone(timedelta(hours=9))

# 기사 유형 — 위에서부터 먼저 맞는 것 (시세 기사를 가장 먼저 걸러냄)
NEWS_CATS = [
    ("market", "시세·증권", r"특징주|주가|급등|급락|상한가|하한가|강세|약세|목표가|목표주가|리포트|증권가|투자의견|시가총액|52주|신고가|신저가|테마주|관련주|수혜주|코스닥|코스피|주식\s*시장"),
    ("result", "실적", r"실적|매출|영업이익|영업손실|순이익|흑자|적자|역대\s*최대|분기|반기|어닝"),
    ("equity", "지분·자본", r"최대주주|지분|자사주|자기주식|소각|유상\s*증자|무상\s*증자|전환\s*사채|CB|BW|신주인수권|블록딜|보호예수|공개\s*매수|오버행|투자\s*유치|시리즈\s*[A-Z]|상장|IPO|액면"),
    ("launch", "신제품 출시", r"출시|신제품|론칭|런칭|선보|첫\s*선|리뉴얼|라인업|새\s*단장"),
    ("promo", "광고·판촉", r"광고|모델|앰버서더|앰배서더|캠페인|프로모션|할인|이벤트|기획전|홈쇼핑|라이브\s*커머스|팝업|체험|증정|협찬|스폰서|후원|완판|매진"),
    ("channel", "유통·해외", r"입점|올리브영|올영|쿠팡|편의점|다이소|약국|수출|진출|해외|글로벌|미국|일본|중국|대만|베트남|판매처|매장|유통"),
    ("deal", "계약·제휴", r"계약|수주|공급|MOU|협약|제휴|파트너|맞손|손잡|공동\s*개발|기술\s*이전|라이선스|라이센스"),
    ("rnd", "R&D·인증", r"임상|특허|허가|인정|인증|논문|학회|연구|균주|FDA|식약처|기능성|원료|치료제|파이프라인|후보\s*물질|IND"),
    ("invest", "투자·M&A", r"인수|합병|M&A|매각|공장|증설|설비|신설|착공|준공"),
    ("gov", "인사·지배구조", r"대표|사장|임원|선임|사임|취임|주주총회|주총|이사회|소송|제재|조사|배당"),
    ("csr", "사회공헌", r"기부|기탁|봉사|사회공헌|ESG|상생|나눔"),
]
# 규칙 원본은 config/news_cats.json (화면과 공유). 파일이 없으면 위 기본값
try:
    NEWS_CATS = [(c["key"], c["name"], c["pattern"]) for c in json.loads((Path(__file__).resolve().parent.parent / "config" / "news_cats.json").read_text(encoding="utf-8"))["cats"]]
except Exception:
    pass
_CATS = [(k, re.compile(p, re.I)) for k, _, p in NEWS_CATS]
CAT_NAME = {k: n for k, n, _ in NEWS_CATS} | {"etc": "기타"}
TIMING = [("pre", "장 시작 전"), ("open", "장중"), ("post", "장 마감 후"), ("off", "휴장일"), ("unk", "시각 미상")]
REACH = [("1", "매체 1곳"), ("2-4", "매체 2~4곳"), ("5+", "매체 5곳 이상")]
WEEK = "월화수목금토일"
KW_STOP = set("출시 진행 기업 대표 관련 올해 지난해 국내 위해 통해 이번 오늘 최대 확대 강화 나선다 선보여 선봬 기념 개최 참가 제공 공개 추진 돌입 성공 기록 전년 대비 억원 만원 조원 이상 업계 시장 제품 브랜드 건강 건강기능식품 건기식 주식 종목 뉴스 단독 종합 인터뷰 신제품 론칭 지원 현장 최초 연속 성장 전략 가속 돌파 달성 눈길 주목 발표 체결 협약 업무 the and for".split())
MIN_N, P_SIG, P_REF = 10, 0.10, 0.20


def classify(title):
    return next((k for k, r in _CATS if r.search(title)), "etc")


def _media(cfg):
    alias = cfg.get("aliases") or {}
    tier = {}
    for t in cfg.get("tiers") or []:
        for m in t["members"]:
            tier[_norm(m)] = t["key"]
    names = {t["key"]: t["name"] for t in cfg.get("tiers") or []} | {"etc": "기타(미분류)"}
    def norm_media(by):
        by = alias.get(by, by)
        return by, tier.get(_norm(by), "etc")
    return norm_media, names


def _stats(vals, vols):
    n = len(vals)
    if not n:
        return None
    mean = sum(vals) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / (n - 1)) if n > 1 else 0.0
    t = mean / (sd / math.sqrt(n)) if sd > 0 else 0.0
    p = math.erfc(abs(t) / math.sqrt(2)) if n > 1 else 1.0
    s = sorted(vals)
    vv = [v for v in vols if v is not None]
    return {"n": n, "car": round(mean, 2), "med": round(s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2, 2),
            "hit": round(sum(v > 0 for v in vals) / n * 100), "p": round(p, 3),
            "vol": round(sum(vv) / len(vv), 2) if vv else None,
            "level": "sig" if n >= MIN_N and p < P_SIG else "ref" if n >= 5 and p < P_REF else "none"}


def _pearson(xs, ys):
    n = len(xs)
    if n < 20:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs)); sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not sx or not sy:
        return None
    r = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)
    t = r * math.sqrt((n - 2) / max(1e-9, 1 - r * r))
    return {"r": round(r, 3), "n": n, "p": round(math.erfc(abs(t) / math.sqrt(2)), 3)}


def _date_only(x):
    """기간 지정 검색(백필)은 시각 없이 날짜만 옴: 미국 서부 자정 = 한국 16:00/17:00.
    이런 기사는 한국 시간 그날 16시~다음 날 16시 사이에 나온 것이라 날짜를 하루 뒤로 보고 시각은 미상으로 둔다"""
    if x.get("t") in ("16:00", "17:00"):
        d = (datetime.strptime(x["d"], "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        return {**x, "d": d, "t": ""}
    return x


def _tokens(title, strip):
    title = re.sub(r"\s[-|]\s[^-|]{1,20}$", "", title)        # 제목 끝 ' - 매체명' 꼬리
    t = re.sub(r"\[[^\]]*\]|['\"‘’“”…·,.!?()<>\-/|:~+&%]", " ", title)
    for s in strip:
        t = t.replace(s, " ")
    out = set()
    for w in t.split():
        w = re.sub(r"(으로|에서|에게|까지|부터|와의|과의|이며|은|는|이|가|을|를|에|의|로|와|과|도|만)$", "", w)
        if len(w) >= 2 and not re.match(r"^\d", w) and w not in KW_STOP:
            out.add(w)
    return out


def build(companies, raw, index, today=None):
    """
    companies: [{"id","name","names","must","exclude","listed","market":"KQ|KS","price":{dates,close,vol},"disc":[YYYY-MM-DD]}]
    raw: news_raw.jsonl 행 목록 · index: krx.index_series() 결과({} 가능)
    """
    cfg = json.loads(MEDIA_CFG.read_text(encoding="utf-8")) if MEDIA_CFG.exists() else {}
    norm_media, tier_names = _media(cfg)
    today = today or datetime.now(KST).strftime("%Y-%m-%d")
    byc = {c["id"]: c for c in companies}
    unknown = Counter()

    # 1) 회사별 기사 필터(동명이인·무관 기사) → 보도 묶기
    arts = defaultdict(list)
    for x in raw:
        x = _date_only(x)
        c = byc.get(x["c"])
        if not c:
            continue
        if c.get("must") and not re.search(c["must"], x["title"]):
            continue
        if c.get("exclude") and re.search(c["exclude"], x["title"]):
            continue
        by, tier = norm_media(x["by"])
        if tier == "etc":
            unknown[by] += 1
        arts[x["c"]].append({**x, "by": by, "tier": tier, "cat": classify(x["title"])})
    events = []
    for cid, lst in arts.items():
        lst.sort(key=lambda a: (a["d"], a["t"]))
        evs = []
        for a in lst:
            d = datetime.strptime(a["d"], "%Y-%m-%d")
            hit = next((e for e in reversed(evs[-30:]) if abs((d - datetime.strptime(e["d"], "%Y-%m-%d")).days) <= 1
                        and _similar(e, a, byc[cid]["names"], same_cat=e["cat"] == a["cat"] != "etc")), None)
            if hit:
                hit["arts"].append(a)
            else:
                evs.append({"c": cid, "d": a["d"], "t": a["t"], "title": a["title"], "cat": a["cat"], "url": a["url"], "arts": [a]})
        events += evs

    # 2) 주가 반응
    idx = {m: dict(zip(v["dates"], v["close"])) for m, v in (index or {}).items()}
    for e in events:
        media = list(dict.fromkeys(a["by"] for a in e["arts"]))
        e["media"], e["tiers"] = media, sorted({a["tier"] for a in e["arts"]})
        e["n"] = len(media)
        e["reach"] = "1" if e["n"] == 1 else "2-4" if e["n"] <= 4 else "5+"
        wd = datetime.strptime(e["d"], "%Y-%m-%d").weekday()
        e["wd"] = WEEK[wd]
        e["timing"] = "unk" if not e["t"] else "off" if wd >= 5 else "pre" if e["t"] < "09:00" else "open" if e["t"] <= "15:30" else "post"
        c = byc[e["c"]]
        p = c.get("price") or {}
        ds = p.get("dates") or []
        if not c.get("listed") or len(ds) < 30:
            continue
        i0 = bisect.bisect_left(ds, e["d"])
        if i0 < len(ds) and ds[i0] == e["d"] and e["timing"] == "post":
            i0 += 1
        if i0 < 22 or i0 >= len(ds):
            continue
        cl, vol, mk = p["close"], p.get("vol") or [], idx.get(c.get("market"), {})
        adj = bool(mk)
        def ar(i):
            if not cl[i - 1] or cl[i] is None:
                return None
            r = cl[i] / cl[i - 1] - 1
            if adj:
                a, b = mk.get(ds[i]), mk.get(ds[i - 1])
                if not a or not b:
                    return None
                r -= a / b - 1
            return r * 100
        e["d0"] = ds[i0]
        e["ar"] = [None if i0 + k >= len(ds) else (lambda v: None if v is None else round(v, 2))(ar(i0 + k)) for k in range(0, 6)]
        if all(v is not None for v in e["ar"][:3]):
            e["car"] = round(sum(e["ar"][:3]), 2)
        base = [v for v in vol[i0 - 21:i0 - 1] if v]
        post = [v for v in vol[i0:i0 + 3] if v is not None]
        if base and len(post) == 3:
            e["vr"] = round(sum(post) / 3 / (sum(base) / len(base)), 2)
        e["adj"] = adj
        disc = set(c.get("disc") or [])
        win = ds[max(0, i0 - 1): i0 + 3]
        e["flags"] = (["시세 기사"] if e["cat"] == "market" else []) + (["공시 겹침"] if disc & set(win) else [])
        e["_i0"] = i0

    # 같은 회사 앞 보도와 3거래일 안에 겹치면 제외(첫 보도만 반응을 봄)
    last = {}
    for e in sorted((e for e in events if "_i0" in e), key=lambda e: (e["c"], e["_i0"])):
        if e["c"] in last and e["_i0"] - last[e["c"]] <= 3:
            e["flags"].append("앞 보도와 겹침")
        else:
            last[e["c"]] = e["_i0"]
    clean = [e for e in events if e.get("car") is not None and not e.get("flags")]

    # 3) 축별 집계
    def agg(key_fn, names):
        g = defaultdict(list)
        for e in clean:
            for k in key_fn(e):
                g[k].append(e)
        out = []
        for k, lst in g.items():
            s = _stats([e["car"] for e in lst], [e.get("vr") for e in lst])
            if s:
                out.append({"key": k, "name": names.get(k, k), **s})
        return sorted(out, key=lambda r: (-r["n"], r["key"]))
    names_c = {c["id"]: c["name"] for c in companies}
    strip_all = {c["id"]: [n for n in c["names"]] + [c["name"]] for c in companies}
    kw_events = defaultdict(list)
    for e in clean:
        for w in _tokens(e["title"], strip_all[e["c"]]):
            kw_events[w].append(e)
    kw = []
    for w, lst in kw_events.items():
        if len({e["c"] for e in lst}) >= 2 and len(lst) >= 8:
            s = _stats([e["car"] for e in lst], [e.get("vr") for e in lst])
            kw.append({"key": w, "name": w, **s})
    kw.sort(key=lambda r: (r["p"], -r["n"]))
    axes = {
        "cat": agg(lambda e: [e["cat"]], CAT_NAME),
        "tier": agg(lambda e: e["tiers"], tier_names),
        "timing": agg(lambda e: [e["timing"]] if e["timing"] != "unk" else [], dict(TIMING)),
        "weekday": agg(lambda e: [e["wd"]] if e["timing"] != "unk" else [], {w: w + "요일" for w in WEEK}),
        "reach": agg(lambda e: [e["reach"]], dict(REACH)),
        "company": agg(lambda e: [e["c"]], names_c),
        "keyword": kw[:30],
    }

    # 4) 상관: 회사별 일별 기사 수 vs 같은 날 |AR|·거래량 배수 (상장사, 시세 기사 제외)
    xs, ya, yv = [], [], []
    for c in companies:
        p = c.get("price") or {}
        ds = p.get("dates") or []
        if not c.get("listed") or len(ds) < 60:
            continue
        cnt = Counter()
        for a in arts.get(c["id"], []):
            if a["cat"] == "market":
                continue
            i = bisect.bisect_left(ds, a["d"])
            if i < len(ds) and ds[i] == a["d"] and a["t"] > "15:30":
                i += 1
            if i < len(ds):
                cnt[i] += 1
        cl, vol, mk = p["close"], p.get("vol") or [], idx.get(c.get("market"), {})
        first = bisect.bisect_left(ds, min((a["d"] for a in arts.get(c["id"], [])), default=ds[-1]))
        for i in range(max(21, first), len(ds)):
            if not cl[i - 1] or cl[i] is None:
                continue
            r = cl[i] / cl[i - 1] - 1
            if mk:
                a, b = mk.get(ds[i]), mk.get(ds[i - 1])
                if not a or not b:
                    continue
                r -= a / b - 1
            base = [v for v in vol[i - 20:i] if v]
            if not base or i >= len(vol) or vol[i] is None:
                continue
            xs.append(cnt.get(i, 0)); ya.append(abs(r) * 100); yv.append(vol[i] / (sum(base) / len(base)))
    corr = {"absAr": _pearson(xs, ya), "vol": _pearson(xs, yv)}

    # 5) 최근 14일 보도(상장·비상장 모두)와 큰 움직임
    since = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=14)).strftime("%Y-%m-%d")
    recent = []
    for e in sorted(events, key=lambda e: (e["d"], e["t"]), reverse=True):
        if e["d"] < since:
            break
        recent.append({k: e.get(k) for k in ("c", "d", "t", "title", "cat", "url", "tiers", "n", "d0", "ar", "car", "vr", "flags", "adj")}
                      | {"media": e["media"][:6]})
    movers = []
    for c in companies:
        p = c.get("price") or {}
        ds = p.get("dates") or []
        if not c.get("listed") or len(ds) < 30:
            continue
        cl, vol, mk = p["close"], p.get("vol") or [], idx.get(c.get("market"), {})
        for i in range(max(21, len(ds) - 10), len(ds)):
            if not cl[i - 1] or cl[i] is None:
                continue
            r = cl[i] / cl[i - 1] - 1
            if mk and mk.get(ds[i]) and mk.get(ds[i - 1]):
                r -= mk[ds[i]] / mk[ds[i - 1]] - 1
            base = [v for v in vol[i - 20:i] if v]
            vr = vol[i] / (sum(base) / len(base)) if base and i < len(vol) and vol[i] else None
            if abs(r) >= 0.05 or (vr and vr >= 3):
                near = [e for e in events if e["c"] == c["id"] and ds[max(0, i - 1)] <= e["d"] <= ds[i]]
                movers.append({"c": c["id"], "d": ds[i], "ar": round(r * 100, 2), "vr": round(vr, 2) if vr else None,
                               "news": [{"title": e["title"], "url": e["url"], "cat": e["cat"]} for e in near[:3]]})
    movers.sort(key=lambda m: m["d"], reverse=True)

    ds_all = sorted(x["d"] for x in raw) if raw else []
    return {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage": {"from": ds_all[0] if ds_all else None, "to": ds_all[-1] if ds_all else None,
                     "articles": sum(len(v) for v in arts.values()), "events": len(events), "clean": len(clean),
                     "listed": sum(1 for c in companies if c.get("listed")), "companies": len(companies)},
        "index": sorted(idx), "method": "CAR(0,2) 시장조정 초과수익률 · 거래량 배수 = D0~D+2 ÷ D-21~D-2",
        "cats": CAT_NAME, "tiers": tier_names, "axes": axes, "corr": corr,
        "recent": recent, "movers": movers[:30],
        "unknownMedia": [[k, v] for k, v in unknown.most_common(60)],
        "names": names_c,
    }
