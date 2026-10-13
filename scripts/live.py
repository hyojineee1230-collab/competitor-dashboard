"""
매시 갱신(평일 08~20시 KST) — 하루 2회 전체 수집 사이의 살아있는 정보만 가볍게 갱신

1) 뉴스 원본 아카이브: 이번 달 새 기사 + 2년 백필 이어서 (newsraw)
2) 보도 반응 분석 다시 계산 → data/newsfx.json (newsfx)
3) 장중 지연 시세(Yahoo, 약 15~20분 지연) → data/live.json
   - 공식 종가·시가총액은 하루 2회 수집의 KRX 값이 기준. 여기 값은 '오늘 시장' 띠의 장중 등락 표시용
재무 숫자는 다루지 않는다(재무는 OpenDART만, 전체 수집에서).
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import newsfx  # noqa: E402
import newsraw  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
KST = timezone(timedelta(hours=9))


def load(p, default=None):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return default


def companies():
    """전체 수집 결과(data/<그룹>.json)에서 회사별 시세·공시를 모음. 국내 회사만"""
    cfg = load(ROOT / "config" / "companies.json", {})
    reg = cfg.get("companies", {})
    seen = {}
    for g in cfg.get("groups", []):
        d = load(DATA / f"{g['id']}.json", {}) or {}
        for e in d.get("companies", []):
            cid = e["id"]
            if cid in seen or cid not in reg or reg[cid].get("country", "KR") != "KR":
                continue
            seen[cid] = (reg[cid], e)
    return seen


def quotes(cos, log=print):
    """국내 상장사 장중 지연 시세. 오늘(KST) 체결분이 있는 종목만"""
    import yfinance as yf
    today = datetime.now(KST).strftime("%Y-%m-%d")
    out = {}
    tickers = {c["ticker"]: cid for cid, (c, e) in cos.items() if (c.get("ticker") or "").endswith((".KQ", ".KS"))}
    if not tickers:
        return out
    try:
        df = yf.download(list(tickers), period="1d", interval="5m", progress=False, group_by="ticker", threads=True, auto_adjust=False)
    except Exception as ex:
        log(f"장중 시세 실패: {type(ex).__name__}")
        return out
    for tk, cid in tickers.items():
        try:
            s = (df[tk] if len(tickers) > 1 else df)["Close"].dropna()
        except Exception:
            continue
        if s.empty:
            continue
        ts = s.index[-1].tz_convert(KST) if s.index[-1].tzinfo else s.index[-1].replace(tzinfo=KST)
        if ts.strftime("%Y-%m-%d") != today:
            continue
        e = cos[cid][1]
        q = e.get("quote") or {}
        prev = q.get("price") if (q.get("asOf") or "") < today else None
        if not prev:
            continue
        last = float(s.iloc[-1])
        out[cid] = {"price": round(last, 2), "prev": prev, "chg": round((last / prev - 1) * 100, 2),
                    "mcap": round(last * q["shares"]) if q.get("shares") else None, "ts": ts.strftime("%Y-%m-%dT%H:%M")}
    return out


def main():
    errors = []
    log = lambda m: (errors.append(m), print(m))
    cos = companies()
    # 1) 뉴스 (매시 실행이라 검색 수를 줄임)
    newsraw.MAX_QUERIES = 60
    try:
        newsraw.update([{"id": cid, "names": c.get("news_names") or [c["name"]]} for cid, (c, e) in cos.items()], log=log)
    except Exception as ex:
        log(f"뉴스 아카이브 실패: {type(ex).__name__}")
    # 2) 보도 반응
    try:
        fx_cos = []
        for cid, (c, e) in cos.items():
            disc = [x.get("date") for x in (e.get("disclosures") or []) if x.get("date")]
            disc += [x["date"] for x in (e.get("activity") or []) if x.get("src") == "공시"]
            p = e.get("price") or {}
            fx_cos.append({"id": cid, "name": c["name"], "names": c.get("news_names") or [c["name"]],
                           "must": c.get("news_must"), "exclude": c.get("news_exclude"),
                           "listed": bool(c.get("ticker")), "market": (c.get("ticker") or "")[-2:],
                           "price": p if p.get("mcapSource") == "KRX" else {}, "disc": disc})
        fx = newsfx.build(fx_cos, newsraw.load(), load(DATA / "index.json", {}) or {})
        (DATA / "newsfx.json").write_text(json.dumps(fx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"보도 반응: 보도 {fx['coverage']['events']}건, 집계 {fx['coverage']['clean']}건")
    except Exception as ex:
        log(f"보도 반응 분석 실패: {type(ex).__name__}: {ex}")
    # 3) 장중 지연 시세
    q = quotes(cos, log)
    (DATA / "live.json").write_text(json.dumps({"updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                                "source": "Yahoo Finance 지연 시세", "quotes": q, "errors": errors},
                                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"장중 시세 {len(q)}종목")


if __name__ == "__main__":
    main()
