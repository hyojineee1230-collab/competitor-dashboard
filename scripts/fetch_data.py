"""
경쟁사 주가·재무 데이터 수집
- 국내 종가 / 시가총액       : KRX OPEN API (KRX_API_KEY 있을 때, 공식 시가총액)
- 주가 / 시가총액 / PER / PBR : Yahoo Finance (yfinance, KRX 키가 없거나 해외 종목일 때)
- 상장사 연간·분기 실적       : OpenDART 정기보고서 API (DART_API_KEY 있을 때), 없으면 yfinance
- 비상장 외감법인 연간 실적    : OpenDART 감사보고서 원문 파싱 (DART_API_KEY 필요)
결과: data/<group_id>.json, data/meta.json
"""
import io
import json
import math
import os
import re
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dart_audit import decode, extract_income, extract_ad, extract_rnd, report_period, fiscal_year  # noqa: E402
import krx  # noqa: E402
import activity  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "companies.json"
DATA_DIR = ROOT / "data"
DART_KEY = os.environ.get("DART_API_KEY", "").strip()
DART = "https://opendart.fss.or.kr/api"
DART_VIEW = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo="
NOW = datetime.now()
errors = []


_KEY_RE = re.compile(r"(crtfc_key|AUTH_KEY|auth_key)=([^&\s'\")]+)", re.I)


def scrub(text):
    """인증키가 오류 메시지·데이터 파일에 남지 않도록 가린다"""
    text = _KEY_RE.sub(r"\1=***", str(text))
    for k in (DART_KEY, os.environ.get("KRX_API_KEY", "").strip()):
        if k:
            text = text.replace(k, "***")
    return text


def log_err(msg):
    msg = scrub(msg)
    print("  !", msg, flush=True)
    errors.append(msg)


def clean(v):
    try:
        if v is None:
            return None
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def pct(a, b):
    a, b = clean(a), clean(b)
    if a is None or b in (None, 0):
        return None
    return round((a / b - 1) * 100, 2)


# ================================================================ 주가
def fetch_market(ticker):
    t = yf.Ticker(ticker)
    hist = t.history(period="2y", interval="1d", auto_adjust=False)
    if hist.empty:
        raise RuntimeError("가격 데이터 없음")
    hist = hist.dropna(subset=["Close"])
    dates = [d.strftime("%Y-%m-%d") for d in hist.index]
    close = [round(float(c), 4) for c in hist["Close"]]
    last = close[-1]

    def back(n):
        return close[-n - 1] if len(close) > n else close[0]

    try:
        info = t.info or {}
    except Exception:
        info = {}
    mcap = clean(info.get("marketCap"))
    shares = clean(info.get("sharesOutstanding")) or (mcap / last if mcap and last else None)

    price = {"dates": dates, "close": close}
    if shares:
        # 현재 상장주식수 × 종가로 근사한 시가총액 추이 (증자·감자 이전 구간은 오차 있음)
        price["mcap"] = [round(c * shares) for c in close]

    quote = {
        "price": last,
        "currency": info.get("currency"),
        "change1d": pct(last, back(1)),
        "change1w": pct(last, back(5)),
        "change1m": pct(last, back(21)),
        "change3m": pct(last, back(63)),
        "change1y": pct(last, back(252)),
        "high52w": round(max(close[-252:]), 4),
        "low52w": round(min(close[-252:]), 4),
        "marketCap": mcap or (last * shares if shares else None),
        "shares": shares,
        "per": clean(info.get("trailingPE")),
        "pbr": clean(info.get("priceToBook")),
    }
    return price, quote, t


def yf_statement(df, cols):
    def row(*names):
        for n in names:
            if n in df.index:
                return df.loc[n]
        return None
    rev = row("Total Revenue", "Operating Revenue")
    op = row("Operating Income", "EBIT")
    ni = row("Net Income", "Net Income Common Stockholders")
    pick = lambda s: [clean(s[c]) if s is not None else None for c in cols]
    return pick(rev), pick(op), pick(ni)


def annual_from_yf(t):
    try:
        inc = t.income_stmt
        cur = (t.info or {}).get("financialCurrency")
    except Exception:
        return None
    if inc is None or inc.empty:
        return None
    cols = sorted(inc.columns)[-4:]
    rev, op, ni = yf_statement(inc, cols)
    return {"years": [str(c.year) for c in cols], "revenue": rev, "operatingIncome": op,
            "netIncome": ni, "currency": cur, "source": "Yahoo Finance"}


def rnd_from_yf(t):
    try:
        inc = t.income_stmt
    except Exception:
        return None
    if inc is None or inc.empty or "Research And Development" not in inc.index:
        return None
    cols = sorted(inc.columns)[-3:]
    amt = [clean(inc.loc["Research And Development"][c]) for c in cols]
    if not any(amt):
        return None
    sga_row = next((n for n in ("Selling General And Administration", "Selling And Marketing Expense") if n in inc.index), None)
    sga = [clean(inc.loc[sga_row][c]) for c in cols] if sga_row else [None] * len(cols)
    try:
        cur = (t.info or {}).get("financialCurrency")
    except Exception:
        cur = None
    return {"years": [str(c.year) for c in cols], "amount": amt, "sga": sga, "currency": cur, "source": "Yahoo Finance"}


def quarterly_from_yf(t):
    try:
        inc = t.quarterly_income_stmt
        cur = (t.info or {}).get("financialCurrency")
    except Exception:
        return None
    if inc is None or inc.empty:
        return None
    cols = sorted(inc.columns)[-8:]
    rev, op, ni = yf_statement(inc, cols)
    periods = [f"{c.year}Q{(c.month - 1) // 3 + 1}" for c in cols]
    return {"periods": periods, "revenue": rev, "operatingIncome": op,
            "netIncome": ni, "currency": cur, "source": "Yahoo Finance"}


# ================================================================ DART 공통
_corps = None


class DartError(RuntimeError):
    pass


def dart_get(path, **params):
    last = None
    for attempt in range(3):
        try:
            r = requests.get(f"{DART}/{path}", params={"crtfc_key": DART_KEY, **params}, timeout=60)
            r.raise_for_status()
            time.sleep(0.15)  # 호출 간격
            return r
        except requests.RequestException as ex:
            last = ex
            time.sleep(3 * (attempt + 1))
    # 예외 문자열에 요청 URL(키 포함)이 들어 있으므로 원문 대신 요약만 남김
    raise DartError(f"DART 접속 실패({type(last).__name__}) — {path}")


def _dart_status(content):
    """zip 대신 온 DART 오류 응답에서 status·message 추출"""
    try:
        j = json.loads(content.decode("utf-8"))
        return f"{j.get('status')} {j.get('message')}"
    except Exception:
        txt = content[:300].decode("utf-8", "ignore")
        m = re.search(r"<status>(.*?)</status>.*?<message>(.*?)</message>", txt, re.S)
        return f"{m.group(1)} {m.group(2)}" if m else txt[:120]


CODE_CACHE = DATA_DIR / "dart_codes.json"
try:
    _code_cache = json.loads(CODE_CACHE.read_text(encoding="utf-8"))
except Exception:
    _code_cache = {"stock": {}, "name": {}}
_corps_failed = False


def corps():
    """DART 전체 법인 목록 (상장 + 비상장) — 실패하면 이번 실행에서는 다시 시도하지 않음"""
    global _corps, _corps_failed
    if _corps_failed:
        raise DartError("DART 회사 목록을 받지 못함 (이번 실행)")
    if _corps is None:
        try:
            content = dart_get("corpCode.xml").content
            z = zipfile.ZipFile(io.BytesIO(content))
        except zipfile.BadZipFile:
            _corps_failed = True
            raise DartError(f"DART 회사 목록 응답 오류: {_dart_status(content)}")
        except DartError:
            _corps_failed = True
            raise
        root = ET.fromstring(z.read(z.namelist()[0]))
        _corps = [{"code": e.findtext("corp_code", "").strip(),
                   "name": e.findtext("corp_name", "").strip(),
                   "stock": e.findtext("stock_code", "").strip(),
                   "modified": e.findtext("modify_date", "").strip()} for e in root.iter("list")]
    return _corps


def norm_name(s):
    for x in ("주식회사", "(주)", "㈜", " "):
        s = s.replace(x, "")
    return s.lower()


def corp_code_by_stock(stock):
    if stock in _code_cache["stock"]:
        return _code_cache["stock"][stock]
    code = next((c["code"] for c in corps() if c["stock"] == stock), None)
    if code:
        _code_cache["stock"][stock] = code
    return code


def corp_code_by_name(name):
    if name in _code_cache["name"]:
        return _code_cache["name"][name], [name]
    n = norm_name(name)
    hits = [c for c in corps() if norm_name(c["name"]) == n]
    if not hits:
        return None, []
    hits.sort(key=lambda c: (c["stock"] == "", c["modified"]), reverse=True)
    _code_cache["name"][name] = hits[0]["code"]
    return hits[0]["code"], [h["name"] for h in hits]


# ---------------------------------------------------------------- 정기보고서 (상장사)
def _acc_rows(year, code, corp):
    r = dart_get("fnlttSinglAcnt.json", corp_code=corp, bsns_year=str(year), reprt_code=code).json()
    if r.get("status") != "000" or not r.get("list"):
        return None
    rows = r["list"]
    fs = "CFS" if any(x.get("fs_div") == "CFS" for x in rows) else "OFS"
    return fs, [x for x in rows if x.get("fs_div") == fs]


def _num(s):
    if not s or str(s).strip() in ("", "-"):
        return None
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None


def _find(rows, key):
    prefixes = {
        "revenue": ("매출액", "수익(매출액)", "영업수익", "매출"),
        "operatingIncome": ("영업이익", "영업손실", "영업손익"),
        "netIncome": ("당기순이익", "당기순손실", "당기순손익"),
    }[key]
    for p in prefixes:
        for x in rows:
            nm = x.get("account_nm", "").replace(" ", "")
            if nm.startswith(p) and not nm.startswith(("매출원가", "매출총", "매출채권")):
                return x
    return None


KEYS = ("revenue", "operatingIncome", "netIncome")


def dart_listed(stock, quarterly=True):
    """상장사 연간(최근 3년) + 분기(최근 8개 분기, quarterly=True일 때만) 실적"""
    corp = corp_code_by_stock(stock)
    if not corp:
        raise RuntimeError(f"DART 고유번호 없음({stock})")

    annual = None
    start = NOW.year - 1 if NOW.month >= 4 else NOW.year - 2
    for year in (start, start - 1):
        got = _acc_rows(year, "11011", corp)
        if not got:
            continue
        fs, rows = got
        annual = {"years": [str(year - 2), str(year - 1), str(year)], "currency": "KRW",
                  "source": f"OpenDART 사업보고서({'연결' if fs == 'CFS' else '별도'})"}
        for k in KEYS:
            x = _find(rows, k)
            annual[k] = ([_num(x.get("bfefrmtrm_amount")), _num(x.get("frmtrm_amount")),
                          _num(x.get("thstrm_amount"))] if x else [None] * 3)
        break

    # 분기: 보고서별 누적 금액을 받아 차감으로 분기 금액 계산
    # 11013=1분기, 11012=반기, 11014=3분기, 11011=사업보고서
    cum = {}
    for year in (range(NOW.year - 2, NOW.year + 1) if quarterly else ()):
        for q, code in ((1, "11013"), (2, "11012"), (3, "11014"), (4, "11011")):
            if year == NOW.year and q * 3 + 1 > NOW.month:   # 아직 제출 시기 아님
                continue
            got = _acc_rows(year, code, corp)
            if not got:
                continue
            _, rows = got
            vals = {}
            for k in KEYS:
                x = _find(rows, k)
                if x:
                    vals[k] = _num(x.get("thstrm_add_amount")) if q in (2, 3) and _num(x.get("thstrm_add_amount")) is not None \
                        else _num(x.get("thstrm_amount"))
            cum[(year, q)] = vals

    periods, out = [], {k: [] for k in KEYS}
    for (year, q) in sorted(cum):
        prev = cum.get((year, q - 1)) if q > 1 else {}
        if q > 1 and prev is None:
            continue  # 직전 분기 누적이 없으면 분기 금액 계산 불가
        periods.append(f"{year}Q{q}")
        for k in KEYS:
            c, p = cum[(year, q)].get(k), (prev or {}).get(k)
            out[k].append(c if q == 1 else (c - p if c is not None and p is not None else None))
    quarterly = None
    if periods:
        quarterly = {"periods": periods[-8:], **{k: v[-8:] for k, v in out.items()},
                     "currency": "KRW", "source": "OpenDART 분기·반기·사업보고서"}
    return annual, quarterly


# ---------------------------------------------------------------- 최근 공시 (정기보고서 · IR)
RECENT_DAYS = 365 * 3 + 30   # 최근 3년 (정기보고서·IR은 연 4건 안팎이라 회사당 30건 내외)
IR_RE = re.compile(r"IR|기업설명회")


_list_cache = {}


def _dart_list(corp, ty, pages=1, days=None):
    key = (corp, ty, pages, days)
    if key in _list_cache:
        return _list_cache[key]
    rows = []
    for page in range(1, pages + 1):
        q = dict(corp_code=corp, bgn_de=(NOW - timedelta(days=days or RECENT_DAYS)).strftime("%Y%m%d"),
                 end_de=NOW.strftime("%Y%m%d"), last_reprt_at="Y", page_no=page, page_count=100)
        if ty:
            q["pblntf_ty"] = ty
        r = dart_get("list.json", **q).json()
        if r.get("status") == "013":          # 조회 결과 없음
            break
        if r.get("status") != "000":
            raise RuntimeError(r.get("message", r.get("status")))
        rows += r.get("list", [])
        if page >= int(r.get("total_page", 1)):
            break
    _list_cache[key] = rows
    return rows


def dart_recent(corp, listed):
    """정기보고서(상장: 사업·반기·분기 / 비상장: 감사보고서)와 IR 공시"""
    def item(x, cat):
        d = x["rcept_dt"]
        return {"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "title": " ".join(x.get("report_nm", "").split()),
                "filer": x.get("flr_nm", ""), "url": DART_VIEW + x["rcept_no"], "cat": cat}
    out = [item(x, "report") for x in _dart_list(corp, "A" if listed else "F")
           if listed or "감사보고서" in x.get("report_nm", "")]
    if listed:   # IR은 거래소 공시(I) 중 기업설명회
        out += [item(x, "ir") for x in _dart_list(corp, "I", pages=8) if IR_RE.search(x.get("report_nm", ""))]
    out.sort(key=lambda d: d["date"], reverse=True)
    return out[:60]


# ---------------------------------------------------------------- 공시 원문 (접수번호별 파싱 결과 캐시)
DOC_CACHE = DATA_DIR / "dart_docs.json"
PARSER_V = 2          # 파서를 고치면 올려서 다시 읽게 함
try:
    _doc_cache = json.loads(DOC_CACHE.read_text(encoding="utf-8"))
except Exception:
    _doc_cache = {}


def _pack(t):
    return list(t) if t else None


def parse_doc(rcept_no):
    """공시 원문 → {"income", "ad", "rnd"} (한 번 읽은 원문은 다시 받지 않음)"""
    hit = _doc_cache.get(rcept_no)
    if hit and hit.get("v") == PARSER_V:
        return hit
    raw = dart_get("document.xml", rcept_no=rcept_no).content
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise DartError(f"원문 응답 오류: {_dart_status(raw)}")
    texts = [decode(z.read(fn)) for fn in sorted(z.namelist(), key=lambda n: -z.getinfo(n).file_size)]
    first = lambda f: next((r for r in (f(t) for t in texts) if r), None)
    inc, ad, rnd = first(extract_income), first(extract_ad), first(extract_rnd)
    out = {"v": PARSER_V,
           "income": {k: _pack(inc.get(k)) for k in KEYS} if inc else None,
           "ad": {k: _pack(ad.get(k)) for k in ("ad", "promo", "adPromo", "sga", "rndExp")} if ad else None,
           "rnd": rnd}
    _doc_cache[rcept_no] = out
    return out


def _periodic(corp):
    """정기보고서 목록 → [{period:'2025.12', kind:'A'|'H'|'Q', rcept_no}] 최신순 (정정은 최종본)"""
    out = {}
    for x in _dart_list(corp, "A"):
        per, kind = report_period(x.get("report_nm", ""))
        if per and kind and (per not in out or x["rcept_dt"] > out[per]["dt"]):
            out[per] = {"period": per, "kind": kind, "rcept_no": x["rcept_no"], "dt": x["rcept_dt"]}
    return sorted(out.values(), key=lambda r: r["period"], reverse=True)


def _notes_by_year(docs):
    """[(연도, 판관비주석 dict)] 오래된 것부터 → {연도: {ad, sga, rndExp}} (나중 보고서 값이 덮어씀 = 재작성 반영)"""
    out = {}
    for y, d in docs:
        if not d:
            continue
        for k in ("ad", "sga", "rndExp"):
            if d.get(k):
                cur, prev = (list(d[k]) + [None, None])[:2]
                if cur is not None:
                    out.setdefault(y, {})[k] = cur
                if prev is not None:
                    out.setdefault(y - 1, {})[k] = prev     # 최신 보고서의 전기(재작성) 금액 우선
    return out


def build_extras(notes, links, want_ad, want_rnd, rnd_table=None, src_note="판관비 주석"):
    """
    광고: 광고선전비 금액 (비율 = 광고선전비 ÷ 매출, 매출은 연간 실적에서)
    R&D : 연구개발비(간접비 포함 '연구개발비용' 표 합계, 없으면 판관비 주석 경상연구개발비) ÷ 판관비 합계
    """
    res = {}
    if want_ad:
        ys = [y for y in sorted(notes) if notes[y].get("ad") is not None][-3:]
        if ys:
            res["ad"] = {"years": [str(y) for y in ys], "ad": [notes[y]["ad"] for y in ys],
                         "source": src_note, "links": links}
    if want_rnd:
        amt = dict(rnd_table or {})
        src = "사업보고서 연구개발비용" if amt else f"{src_note}(경상연구개발비)"
        if not amt:
            amt = {y: v["rndExp"] for y, v in notes.items() if v.get("rndExp") is not None}
        ys = sorted(amt)[-3:]
        if ys:
            res["rnd"] = {"years": [str(y) for y in ys], "amount": [amt[y] for y in ys],
                          "sga": [notes.get(y, {}).get("sga") for y in ys], "source": src, "links": links}
    return res


def listed_extras(corp, want_ad, want_rnd):
    """상장사: 최근 사업보고서 2건의 판관비 주석(3개년) + 최신 사업보고서 연구개발비용 표 + 그 뒤 분기·반기 누적"""
    reps = _periodic(corp)
    annual = [r for r in reps if r["kind"] == "A"][:2]
    if not annual:
        return {}
    docs = [(int(r["period"][:4]), parse_doc(r["rcept_no"])) for r in reversed(annual)]
    notes = _notes_by_year([(y, d["ad"]) for y, d in docs])
    links = {str(y): DART_VIEW + r["rcept_no"] for (y, _), r in zip(docs, reversed(annual))}
    rnd_table = None
    top = annual[0]
    if want_rnd:
        t = parse_doc(top["rcept_no"])["rnd"]
        if t and t["amount"]:
            y = int(top["period"][:4])
            rnd_table = {y - i: v for i, v in enumerate(t["amount"])}
    res = build_extras(notes, links, want_ad, want_rnd, rnd_table, "사업보고서 판관비 주석")
    if res.get("rnd"):
        newer = next((r for r in reps if r["kind"] in ("H", "Q") and r["period"] > top["period"]), None)
        if newer:
            q = parse_doc(newer["rcept_no"])
            qa = (q["rnd"] or {}).get("amount") or []
            qn = q["ad"] or {}
            amount = qa[0] if qa else (qn.get("rndExp") or [None])[0]
            if amount is not None:
                res["rnd"]["ytd"] = {"period": newer["period"], "amount": amount,
                                     "sga": (qn.get("sga") or [None])[0], "url": DART_VIEW + newer["rcept_no"]}
    return res


# ---------------------------------------------------------------- 감사보고서 (비상장)
def dart_audit(name, corp_code=None):
    corp = corp_code
    if not corp:
        corp, hits = corp_code_by_name(name)
        if not corp:
            raise RuntimeError(f"DART 법인명 '{name}' 없음 — config의 dart_name 확인")
        if len(hits) > 1:
            log_err(f"{name}: 동명 법인 {len(hits)}개 — 최근 갱신 법인 사용 (corp_code 지정 권장)")

    bgn = (NOW - timedelta(days=365 * 4)).strftime("%Y%m%d")
    r = dart_get("list.json", corp_code=corp, bgn_de=bgn, end_de=NOW.strftime("%Y%m%d"),
                 pblntf_ty="F", page_count=100).json()
    reports = [x for x in r.get("list", []) if "감사보고서" in x.get("report_nm", "")]
    if not reports:
        raise RuntimeError("최근 4년 감사보고서 없음")

    # 연도별 최신 보고서 하나씩 (정정 포함, 별도 감사보고서 우선)
    by_year = {}
    for x in sorted(reports, key=lambda x: x["rcept_dt"]):
        fy = fiscal_year(x["report_nm"])
        if not fy:
            continue
        consolidated = "연결" in x["report_nm"]
        cur = by_year.get(fy)
        if cur is None or (cur["_c"] and not consolidated) or (cur["_c"] == consolidated):
            by_year[fy] = {**x, "_c": consolidated}

    data, links, ad_docs = {}, {}, []
    for fy in sorted(by_year)[-3:]:
        rep = by_year[fy]
        try:
            doc = parse_doc(rep["rcept_no"])
        except DartError as ex:
            log_err(f"{name} {fy}: {ex}")
            continue
        parsed = {k: tuple(v) for k, v in (doc["income"] or {}).items() if v}
        ad_docs.append((fy, doc["ad"]))
        if not parsed:
            log_err(f"{name} {fy}: 감사보고서에서 손익계산서를 찾지 못함 ({DART_VIEW}{rep['rcept_no']})")
            continue
        links[str(fy)] = DART_VIEW + rep["rcept_no"]
        missing = [n for k, n in (("revenue", "매출액"), ("operatingIncome", "영업이익"), ("netIncome", "당기순이익")) if k not in parsed]
        if missing:
            log_err(f"{name} {fy}: 감사보고서에서 {', '.join(missing)} 못 찾음 ({DART_VIEW}{rep['rcept_no']})")
        for k in KEYS:
            cur, prev = parsed.get(k, (None, None))
            data.setdefault(fy, {})[k] = cur
            if prev is not None and k not in data.setdefault(fy - 1, {}):
                data[fy - 1][k] = prev   # 전기 금액으로 이전 연도 보완

    years = sorted(y for y in data if any(data[y].get(k) is not None for k in KEYS))[-3:]
    if not years:
        raise RuntimeError("감사보고서 파싱 결과 없음")
    out = {"years": [str(y) for y in years], "currency": "KRW",
           **{k: [data[y].get(k) for y in years] for k in KEYS},
           "source": "DART 감사보고서", "links": links}
    out["_notes"] = (_notes_by_year(ad_docs), links)
    return out


# ================================================================ KRX 반영
def apply_krx(e, s):
    """KRX 공식 종가·시가총액으로 주가 시계열과 시세를 덮어쓴다"""
    old = e["quote"] or {}
    close, mcap = s["close"], s["mcap"]
    if len(close) >= 200 or not e["price"]:
        e["price"] = {"dates": s["dates"], "close": close, "mcap": mcap, "mcapSource": "KRX"}
    else:
        # KRX 이력이 아직 짧으면(첫 백필 중) 차트는 Yahoo 근사치 그대로, 최신 시세만 KRX로
        e["price"]["mcapSource"] = "approx"
    last = close[-1]

    def back(n):
        return close[-n - 1] if len(close) > n else None

    e["quote"] = {
        **old,
        "price": last, "currency": "KRW", "marketCap": mcap[-1], "shares": s["shares"] or old.get("shares"),
        "asOf": s["dates"][-1], "source": "KRX",
        "change1d": pct(last, back(1)), "change1w": pct(last, back(5)), "change1m": pct(last, back(21)),
        "change3m": pct(last, back(63)), "change1y": pct(last, back(252)) if len(close) > 252 else old.get("change1y"),
        "high52w": max(close[-252:]), "low52w": min(close[-252:]),
    }
    if len(close) < 200:
        e["quote"]["high52w"], e["quote"]["low52w"] = old.get("high52w"), old.get("low52w")


# ================================================================ main
def load_previous():
    """직전 수집 결과 (회사 id → 항목)"""
    prev = {}
    for f in DATA_DIR.glob("*.json"):
        if f.name in ("meta.json", "krx_cache.json", "dart_codes.json", "dart_docs.json"):
            continue
        try:
            for c in json.loads(f.read_text(encoding="utf-8")).get("companies", []):
                prev.setdefault(c.get("id"), c)
        except Exception:
            pass
    return prev


def is_dart(fin):
    return bool(fin) and "DART" in str(fin.get("source", ""))


def carry_over(e, p):
    """DART 값이 이번에 비었거나 Yahoo로 대체됐는데 직전에는 DART 값이 있었으면 직전 값 유지"""
    kept = []
    if not p:
        return kept
    for k in ("annual", "quarterly"):
        if is_dart(p.get(k)) and not is_dart(e.get(k)):
            e[k] = p[k]
            kept.append(k)
    for k in ("disclosures", "ad", "rnd"):
        if not e.get(k) and p.get(k):
            e[k] = p[k]
            kept.append(k)
    if kept and not e["listed"]:
        e["error"] = None
    return kept


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    previous = load_previous()
    stale = []
    registry = cfg["companies"]
    groups = cfg["groups"]
    DATA_DIR.mkdir(exist_ok=True)

    needs_fin = {m for g in groups if g.get("mode", "full") != "market" for m in g["members"]}
    # 분기 실적은 사업현황(business) 탭에서만 보여주므로 그 회사들만 조회 (회사당 DART 12회 호출 절약)
    needs_q = {m for g in groups if g.get("mode") == "business" for m in g["members"]}
    needs_ad = {m for g in groups if "ad" in g.get("extras", []) for m in g["members"]}
    needs_rnd = {m for g in groups if "rnd" in g.get("extras", []) for m in g["members"]}
    needs_act = {m for g in groups if g.get("mode") == "business" for m in g["members"]}
    used = []
    for g in groups:
        for m in g["members"]:
            if m not in registry:
                log_err(f"그룹 {g['id']}: 등록되지 않은 회사 id '{m}'")
            elif m not in used:
                used.append(m)

    # KRX: 국내 상장 종목의 공식 종가·시가총액 (시장 전체를 날짜별로 받아 캐시)
    krx_codes = {"KQ": set(), "KS": set()}
    for cid in used:
        tk = registry[cid].get("ticker") or ""
        if tk.endswith((".KQ", ".KS")):
            krx_codes[tk[-2:]].add(tk[:6])
    krx_data = {}
    if krx.KEY:
        try:
            krx_data = krx.update(krx_codes, log=log_err)
        except Exception as ex:
            log_err(f"KRX 수집 실패: {ex}")

    results, price_fail, listed_total = {}, 0, 0
    for cid in used:
        c = registry[cid]
        e = {"id": cid, **c, "listed": bool(c.get("ticker")), "price": None, "quote": None,
             "annual": None, "quarterly": None, "error": None}
        print(f"- {c['name']} ({c.get('ticker') or '비상장'})", flush=True)
        yf_t = None

        if e["listed"]:
            listed_total += 1
            try:
                e["price"], e["quote"], yf_t = fetch_market(c["ticker"])
            except Exception as ex:
                e["error"] = f"주가 수집 실패: {ex}"
            kr = krx_data.get(c["ticker"][:6]) if c["ticker"].endswith((".KQ", ".KS")) else None
            if kr and kr["close"]:
                apply_krx(e, kr)
                e["error"] = None
            elif e["price"] is None:
                price_fail += 1
                log_err(f"{c['name']} 주가 실패: {e['error']}")

        if cid in needs_fin:
            if not e["listed"]:
                if not DART_KEY:
                    e["error"] = "비상장사 재무는 DART_API_KEY 등록 필요"
                else:
                    try:
                        e["annual"] = dart_audit(c.get("dart_name", c["name"]), c.get("corp_code"))
                    except Exception as ex:
                        e["error"] = f"감사보고서: {ex}"
                        log_err(f"{c['name']} 감사보고서 실패: {ex}")
            else:
                if DART_KEY and c.get("dart"):
                    try:
                        e["annual"], e["quarterly"] = dart_listed(c["dart"], quarterly=cid in needs_q)
                    except Exception as ex:
                        log_err(f"{c['name']} DART 실패: {ex}")
                if yf_t is not None:
                    e["annual"] = e["annual"] or annual_from_yf(yf_t)
                    if cid in needs_q:
                        e["quarterly"] = e["quarterly"] or quarterly_from_yf(yf_t)

        # 국내 종목은 Yahoo가 PER을 주지 않는 경우가 많아 시가총액 ÷ 최근 연간 순이익으로 보완
        if e["quote"] and e["quote"].get("per") is None:
            fin = e["annual"]
            if fin is None and yf_t is not None:
                fin = annual_from_yf(yf_t)
            ni = next((v for v in reversed((fin or {}).get("netIncome") or []) if v is not None), None)
            mc = e["quote"].get("marketCap")
            if ni and ni > 0 and mc and (fin or {}).get("currency") == e["quote"].get("currency"):
                e["quote"]["per"] = round(mc / ni, 2)
                e["quote"]["perNote"] = "최근 연간 순이익 기준"
        # 최근 공시 (DART 키 있을 때, 상장·비상장 모두)
        if DART_KEY:
            try:
                corp = c.get("corp_code") or (corp_code_by_stock(c["dart"]) if c.get("dart")
                                              else corp_code_by_name(c.get("dart_name", c["name"]))[0])
                if corp:
                    e["disclosures"] = dart_recent(corp, e["listed"])
            except Exception as ex:
                log_err(f"{c['name']} 최근 공시 실패: {ex}")
        # 광고선전비 · 연구개발비 (사업보고서·감사보고서 원문)
        want_ad, want_rnd = cid in needs_ad, cid in needs_rnd
        if e.get("annual") and "_notes" in e["annual"]:
            notes, links = e["annual"].pop("_notes")
            e.update(build_extras(notes, links, want_ad, want_rnd, None, "감사보고서 판관비 주석"))
        if (want_ad or want_rnd) and DART_KEY and c.get("dart") and not _corps_failed:
            try:
                corp = c.get("corp_code") or corp_code_by_stock(c["dart"])
                if corp:
                    e.update(listed_extras(corp, want_ad, want_rnd))
            except Exception as ex:
                log_err(f"{c['name']} 광고·R&D 실패: {ex}")
        if want_rnd and not e.get("rnd") and yf_t is not None and not c.get("dart"):
            e["rnd"] = rnd_from_yf(yf_t)
        # 광고선전비/매출 계산용 매출액(같은 연도)
        rev = dict(zip((e.get("annual") or {}).get("years", []), (e.get("annual") or {}).get("revenue", [])))
        if e.get("ad"):
            e["ad"]["revenue"] = [rev.get(y) for y in e["ad"]["years"]]

        # 주요 활동 (사업현황 탭 회사): 전체 공시 + 뉴스, 이전 수집분과 누적
        if cid in needs_act:
            prev_act = (previous.get(cid) or {}).get("activity") or []
            new_act, ok = [], {"공시": False, "뉴스": False}
            if DART_KEY and not _corps_failed:
                try:
                    corp = c.get("corp_code") or (corp_code_by_stock(c["dart"]) if c.get("dart")
                                                  else corp_code_by_name(c.get("dart_name", c["name"]))[0])
                    if corp:
                        new_act += activity.dart_activity(_dart_list, corp)
                        ok["공시"] = True
                except Exception as ex:
                    log_err(f"{c['name']} 활동(공시) 실패: {ex}")
            try:
                new_act += activity.news(c.get("news_names") or [c["name"]],
                                         must=c.get("news_must"), exclude=c.get("news_exclude"))
                ok["뉴스"] = True
            except Exception as ex:
                log_err(f"{c['name']} 활동(뉴스) 실패: {type(ex).__name__}")
            e["activity"] = activity.merge(new_act, prev_act, names=c.get("news_names") or [c["name"]])
            e["activityOk"] = ok

        if DART_KEY:
            kept = carry_over(e, previous.get(cid))
            if kept:
                stale.append(c["name"])
        if e.get("error"):
            e["error"] = scrub(e["error"])
        results[cid] = e

    if listed_total and price_fail >= listed_total:
        print("모든 종목 주가 수집 실패 — 기존 데이터 유지")
        sys.exit(1)

    for g in groups:
        out = {"id": g["id"], "name": g["name"], "mode": g.get("mode", "full"),
               "description": g.get("description", ""), "sections": g.get("sections"), "extras": g.get("extras", []),
               "companies": [results[m] for m in g["members"] if m in results]}
        (DATA_DIR / f"{g['id']}.json").write_text(
            scrub(json.dumps(out, ensure_ascii=False, separators=(",", ":"))), encoding="utf-8")

    # 같은 원인의 DART 오류가 회사마다 반복되면 한 줄로 묶음
    if _corps_failed:
        same = [e for e in errors if "DART 회사 목록을 받지 못함" in e]
        errors[:] = [e for e in errors if e not in same] + ([f"위 DART 장애로 {len(same)}건 추가 실패"] if same else [])
    meta = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sample": False,
        "dart": bool(DART_KEY),
        "krx": bool(krx_data),
        "groups": [{"id": g["id"], "name": g["name"], "mode": g.get("mode", "full")} for g in groups],
        "errors": errors,
        "dartStale": stale,   # 이번에 DART를 못 받아 직전 수집값을 유지한 회사
    }
    (DATA_DIR / "meta.json").write_text(scrub(json.dumps(meta, ensure_ascii=False, indent=2)), encoding="utf-8")
    CODE_CACHE.write_text(json.dumps(_code_cache, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    DOC_CACHE.write_text(json.dumps(_doc_cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"완료 · 오류 {len(errors)}건")


if __name__ == "__main__":
    main()
