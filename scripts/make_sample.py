"""
화면 확인용 샘플 데이터 생성 (실제 수치 아님).
GitHub Actions에서 fetch_data.py가 실행되면 실제 데이터로 덮어써집니다.
"""
import json
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "config" / "companies.json").read_text(encoding="utf-8"))
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
random.seed(7)

days, d = [], date.today() - timedelta(days=730)
while d <= date.today():
    if d.weekday() < 5:
        days.append(d.strftime("%Y-%m-%d"))
    d += timedelta(days=1)

BIO = {"cjbs", "genome", "kobiolabs", "hem", "bioneer", "cellbiotech", "bifido", "seres", "maat"}
y = date.today().year
cache = {}


def make(cid, c):
    kr = c.get("country") == "KR"
    cur = "KRW" if kr else ("EUR" if c.get("country") == "FR" else "USD")
    listed = bool(c.get("ticker"))
    bio = cid in BIO
    e = {"id": cid, **c, "listed": listed, "price": None, "quote": None,
         "annual": None, "quarterly": None, "error": None}
    rev = random.uniform(3e10, 4e11) if not bio else random.uniform(5e9, 8e10)
    if cid == "ckdhealth":
        rev = 6e11
    if not kr:
        rev /= 1350
    margin = random.uniform(0.02, 0.12) if not bio else random.uniform(-0.9, 0.05)

    if listed:
        p = random.uniform(4000, 40000) if kr else random.uniform(5, 40)
        drift, vol = random.uniform(-0.0006, 0.0008), (0.025 if bio else 0.016)
        close = []
        for _ in days:
            p *= 1 + random.gauss(drift, vol)
            close.append(round(p, 0 if kr else 2))
        shares = random.uniform(1e7, 6e7)
        last = close[-1]
        chg = lambda n: round((last / close[-n - 1] - 1) * 100, 2)
        e["price"] = {"dates": days, "close": close, "mcap": [round(x * shares) for x in close],
                      "mcapSource": "KRX" if kr else None}
        e["quote"] = {"price": last, "currency": cur, "change1d": chg(1), "change1w": chg(5),
                      "change1m": chg(21), "change3m": chg(63), "change1y": chg(252),
                      "high52w": max(close[-252:]), "low52w": min(close[-252:]),
                      "marketCap": last * shares, "shares": shares,
                      "per": round(random.uniform(8, 30), 1) if margin > 0 else None,
                      "pbr": round(random.uniform(0.6, 4), 2)}
        # 분기 (최근 8개)
        qs, qr = [], []
        for i in range(8):
            qy, qq = divmod((y - 2) * 4 + 1 + i, 4)
            qs.append(f"{qy}Q{qq + 1}")
            qr.append(rev / 4 * (1 + random.uniform(-0.15, 0.2)) * (1 + 0.02 * i))
        qo = [r * (margin + random.uniform(-0.04, 0.04)) for r in qr]
        e["quarterly"] = {"periods": qs, "revenue": qr, "operatingIncome": qo,
                          "netIncome": [o * random.uniform(0.6, 0.9) for o in qo],
                          "currency": cur, "source": "샘플"}
    revs = [rev * (1 + random.uniform(-0.1, 0.2)) ** i for i in range(3)]
    ops = [r * (margin + random.uniform(-0.03, 0.03)) for r in revs]
    e["annual"] = {"years": [str(y - 3), str(y - 2), str(y - 1)], "revenue": revs,
                   "operatingIncome": ops, "netIncome": [o * random.uniform(0.6, 0.9) for o in ops],
                   "currency": cur, "source": "샘플" if listed else "샘플(감사보고서)"}
    if not listed:
        e["annual"]["links"] = {}
    yrs, rv = e["annual"]["years"], e["annual"]["revenue"]
    sga = [r * random.uniform(.2, .45) if not bio else max(r, 3e9) * random.uniform(.6, 1.2) for r in rv]
    if kr and not bio:   # 광고선전비 (샘플)
        adr = random.uniform(0.02, 0.15)
        e["ad"] = {"years": yrs, "ad": [r * adr * random.uniform(.85, 1.15) for r in rv], "revenue": rv, "source": "샘플", "links": {}}
    if bio or cid in ("hpo", "ckdhealth", "acebiome", "esther"):   # 연구개발비 (샘플)
        amt = [g * random.uniform(.05, .9) for g in sga]
        e["rnd"] = {"years": yrs, "amount": amt if kr else [a / 1350 for a in amt], "sga": sga if kr else [g / 1350 for g in sga],
                    "currency": None if kr else ("EUR" if c.get("country") == "FR" else "USD"), "source": "샘플", "links": {},
                    "ytd": {"period": f"{y}.06", "amount": amt[-1] * .55, "sga": sga[-1] * .5, "url": "#"} if listed else None}
    if cid in ("ckdhealth", "hpo", "acebiome", "esther", "hem"):   # 주요 활동 (샘플)
        pool = [("deal", "공시", "단일판매ㆍ공급계약체결"), ("product", "뉴스", f"{c['name']}, 신제품 출시로 MZ 공략"),
                ("rnd", "뉴스", f"{c['name']}, 기능성 원료 개별인정 획득"), ("invest", "공시", "타법인 주식 및 출자증권 취득결정"),
                ("finance", "공시", "주요사항보고서(유상증자결정)"), ("result", "뉴스", f"[특징주] {c['name']}, 3분기 매출 성장 기대"),
                ("ir", "공시", "기업설명회(IR)개최(안내공시)"), ("product", "뉴스", f"{c['name']}, 홈쇼핑 완판 행진"),
                ("gov", "공시", "대표이사변경"), ("deal", "뉴스", f"{c['name']}, 해외 유통사와 독점 계약")]
        acts = []
        for _ in range(random.randint(6, 12)):
            cat, src, t = random.choice(pool)
            if not listed and src == "공시":
                continue
            acts.append({"date": (date.today() - timedelta(days=random.randint(0, 175))).strftime("%Y-%m-%d"), "title": t,
                         "src": src, "by": c["name"] if src == "공시" else random.choice(["머니투데이", "뉴시스", "한국경제"]),
                         "cat": cat, "url": "#"})
        e["activity"] = sorted(acts, key=lambda x: x["date"], reverse=True)
        e["activityOk"] = {"공시": True, "뉴스": True}
    if kr:
        items = []
        for yy in range(y - 3, y + 1):
            if listed:
                for mm, nm, due in (("03", "분기보고서", (5, 14)), ("06", "반기보고서", (8, 13)), ("09", "분기보고서", (11, 13)), ("12", "사업보고서", (3, 20))):
                    fy = yy + 1 if mm == "12" else yy
                    dd = date(fy, *due)
                    if dd <= date.today():
                        items.append({"date": dd.strftime("%Y-%m-%d"), "title": f"{nm} ({yy}.{mm})", "filer": c["name"], "url": "#", "cat": "report"})
                if random.random() < .6:
                    items.append({"date": date(yy, random.randint(1, 9), random.randint(1, 28)).strftime("%Y-%m-%d"),
                                  "title": "기업설명회(IR)개최(안내공시)", "filer": c["name"], "url": "#", "cat": "ir"})
            elif date(yy + 1, 4, 5) <= date.today():
                items.append({"date": f"{yy + 1}-04-05", "title": f"감사보고서 ({yy}.12)", "filer": c["name"], "url": "#", "cat": "report"})
        e["disclosures"] = [d for d in items if d["date"] <= date.today().strftime("%Y-%m-%d")]
        e["disclosures"].sort(key=lambda d: d["date"], reverse=True)
    return e


for g in cfg["groups"]:
    comps = []
    for m in g["members"]:
        if m not in cache:
            cache[m] = make(m, cfg["companies"][m])
        comps.append(cache[m])
    (DATA / f"{g['id']}.json").write_text(json.dumps(
        {"id": g["id"], "name": g["name"], "mode": g.get("mode", "full"),
         "description": g.get("description", ""), "sections": g.get("sections"), "extras": g.get("extras", []), "companies": comps},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

(DATA / "meta.json").write_text(json.dumps({
    "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "sample": True, "dart": False,
    "groups": [{"id": g["id"], "name": g["name"], "mode": g.get("mode", "full")} for g in cfg["groups"]],
    "errors": [],
}, ensure_ascii=False, indent=2), encoding="utf-8")
print("샘플 데이터 생성 완료")
