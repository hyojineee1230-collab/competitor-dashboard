"""월간 호: 그날 데이터를 data/reports/<YYYY-MM>/ 에 고정하고 섹션별 갱신 상태·공시·보도 집계를 만든다.

사용: python tools/monthly.py 2026-10 --as-of 2026-10-14 [--title "2026년 10월호"] [--pilot]
- 같은 호를 다시 만들면 데이터·집계는 새로 쓰고, 직접 작성한 insights 는 그대로 둔다.
- 기간(window) = 직전 호 기준일 다음 날 ~ 이번 기준일. 직전 호가 없으면 기준일 한 달 전부터.
- 숫자는 수집 데이터(DART·KRX·해외 시세) 그대로 — 여기서 새 재무 숫자를 만들지 않는다.
"""
import argparse, datetime as dt, json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
REP = os.path.join(DATA, "reports")
COPY = ["meta.json", "biz.json", "hff.json", "microbiome.json", "market.json", "index.json", "newsfx.json", "summaries.json"]
GROUPS = ["biz", "hff", "microbiome"]
# 시장 자료가 새로 나오는 때 (변동 없음일 때 함께 표시)
MKT_NEXT = {"hff": "국내 실태조사 11월 · 생산실적 5~6월 · 미국 NBJ 봄~초여름", "microbiome": "허가·임상·기술이전 소식이 있을 때"}


def load(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def dump(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def md(d):
    return d[5:10].replace("-", ".") if d else ""


def is_report(t):
    return any(k in t for k in ("사업보고서", "반기보고서", "분기보고서", "감사보고서"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("issue")
    ap.add_argument("--as-of", required=True)
    ap.add_argument("--title")
    ap.add_argument("--pilot", action="store_true")
    a = ap.parse_args()
    y, m = a.issue.split("-")
    title = a.title or f"{y}년 {int(m)}월호"

    idx = load(os.path.join(REP, "index.json"), {"issues": []})
    prev = sorted([x for x in idx["issues"] if x["id"] < a.issue], key=lambda x: x["id"])
    as_of = dt.date.fromisoformat(a.as_of)
    start = (dt.date.fromisoformat(prev[-1]["asOf"]) + dt.timedelta(days=1)) if prev else (as_of - dt.timedelta(days=30))
    w0, w1 = start.isoformat(), as_of.isoformat()
    inw = lambda d: bool(d) and w0 <= d[:10] <= w1

    out = os.path.join(REP, a.issue)
    os.makedirs(out, exist_ok=True)
    for f in COPY:
        shutil.copy(os.path.join(DATA, f), os.path.join(out, f))
    dump(os.path.join(out, "live.json"), {"quotes": {}, "index": {}})   # 호는 장중 시세 없이 종가 기준

    market = load(os.path.join(DATA, "market.json"), {})
    summ = load(os.path.join(DATA, "summaries.json"), {})
    groups = {g: load(os.path.join(DATA, f"{g}.json"), {"companies": []}) for g in GROUPS}
    raw = []
    with open(os.path.join(DATA, "news_raw.jsonl"), encoding="utf-8") as f:
        for line in f:
            try:
                raw.append(json.loads(line))
            except ValueError:
                pass
    close = max((c.get("quote") or {}).get("asOf") or "" for g in groups.values() for c in g["companies"])

    sections, digest = {}, {}
    for g, data in groups.items():
        cos = data["companies"]
        # 재무: 기간 안에 정기보고서가 들어왔는지
        regs = sorted([d for c in cos for d in (c.get("disclosures") or []) if is_report(d.get("title", ""))], key=lambda d: d["date"])
        new_regs = [d for d in regs if inw(d["date"])]
        last = regs[-1] if regs else None
        per = lambda d: (d["title"].split("(")[-1].rstrip(")") + " " + d["title"].split(" (")[0]) if "(" in d["title"] else d["title"]
        fin = ({"st": "new", "t": f"이번 달 갱신 · {', '.join(sorted({per(d) for d in new_regs}))} 반영"} if new_regs else
               {"st": "same", "t": f"변동 없음 · {per(last)}까지 반영(마지막 접수 {md(last['date'])})" if last else "변동 없음"})
        price = {"st": "new", "t": f"{md(close)} 종가 기준"}
        sec = {"secAnnual": fin, "secGrow": fin, "secVal": price, "secPrice": price, "secQuote": price}
        if g in market.get("groups", {}):
            mu = market.get("updatedAt", "")
            sec["secMkt"] = ({"st": "new", "t": f"이번 달 갱신 · {md(mu)} 정리"} if inw(mu) else
                             {"st": "same", "t": f"변동 없음 · {md(mu)} 정리 · 새 자료: {MKT_NEXT.get(g, '')}"})
        if g == "biz":
            su = summ.get("updatedAt", "")
            ai = {"st": "new" if inw(su) else "same", "t": f"{'이번 달 갱신' if inw(su) else '변동 없음'} · AI 정리 {md(su)} · {summ.get('window', '')}"}
            sec.update({"secHead": ai, "secCore": ai, "secBench": ai})
        sections[g] = sec
        # 공시: 정기·IR 공시 + 최근 60일 공시 + 회사 활동의 공시 (같은 링크는 1건)
        seen, disc = set(), []
        for c in cos:
            for d in (c.get("disclosures") or []) + (c.get("filings") or []) + [x for x in (c.get("activity") or []) if x.get("src") == "공시"]:
                k = d.get("url") or (c["id"], d.get("date"), d.get("title"))
                if k in seen or not inw(d.get("date")):
                    continue
                seen.add(k)
                disc.append({"d": d["date"], "c": c["id"], "t": d["title"], "url": d.get("url"), "cat": d.get("cat")})
        disc.sort(key=lambda x: x["d"], reverse=True)
        # 보도: 뉴스 아카이브(시세 기사 제외), 같은 회사·같은 날 비슷한 제목은 1건
        ids = {c["id"] for c in cos}
        news, top, seen = {}, {}, set()
        for r in sorted(raw, key=lambda r: r["d"], reverse=True):
            if r["c"] not in ids or r.get("cat") == "market" or not inw(r["d"]):
                continue
            k = (r["c"], r["d"], "".join(ch for ch in r["title"] if ch.isalnum())[:14])
            if k in seen:
                continue
            seen.add(k)
            news[r["c"]] = news.get(r["c"], 0) + 1
            top.setdefault(r["c"], [])
            if len(top[r["c"]]) < 3:
                top[r["c"]].append({"d": r["d"], "t": r["title"], "url": r["url"], "by": r.get("by"), "cat": r.get("cat")})
        moves = sorted([{"c": c["id"], "m1": (c.get("quote") or {}).get("change1m")} for c in cos if c.get("listed", bool(c.get("ticker"))) and (c.get("quote") or {}).get("change1m") is not None],
                       key=lambda x: -x["m1"])
        digest[g] = {"disc": disc, "news": news, "top": top, "moves": moves}

    rp = os.path.join(out, "report.json")
    old = load(rp, {})
    rep = {"id": a.issue, "title": title, "asOf": w1, "close": close, "pilot": a.pilot or old.get("pilot", False), "window": [w0, w1],
           "insights": old.get("insights", {}), "sections": sections, "digest": digest}
    dump(rp, rep)

    issues = [x for x in idx["issues"] if x["id"] != a.issue] + [{"id": a.issue, "title": title, "asOf": w1, "pilot": rep["pilot"]}]
    idx["issues"] = sorted(issues, key=lambda x: x["id"], reverse=True)
    dump(os.path.join(REP, "index.json"), idx)
    print(f"{a.issue}: {w0} ~ {w1}, 종가 {close}, 공시 {sum(len(v['disc']) for v in digest.values())}건")


if __name__ == "__main__":
    main()
