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
         "description": g.get("description", ""), "sections": g.get("sections"), "companies": comps},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

(DATA / "meta.json").write_text(json.dumps({
    "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "sample": True, "dart": False,
    "groups": [{"id": g["id"], "name": g["name"], "mode": g.get("mode", "full")} for g in cfg["groups"]],
    "errors": [],
}, ensure_ascii=False, indent=2), encoding="utf-8")
print("샘플 데이터 생성 완료")
