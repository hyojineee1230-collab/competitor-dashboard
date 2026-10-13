"""
KRX 정보데이터시스템 OPEN API — 일별 매매정보(종가·시가총액·거래량)와 코스닥·코스피 지수

- 코스닥: ksq_bydd_trd / 유가증권: stk_bydd_trd (종가·시가총액·상장주식수·거래량)
- 지수: idx/kosdaq_dd_trd · idx/kospi_dd_trd (서비스별 이용신청 필요, 승인 전에는 건너뜀)
- 한 번 호출하면 해당 일자의 시장 전체 종목이 오므로, 관심 종목만 골라 data/krx_cache.json 에 쌓는다.
- 매 실행마다 빠진 날짜만 조회하고, 처음 실행 시에는 최근 2년을 거꾸로 채운다(1회 최대 MAX_CALLS).
- 인증키는 환경변수 KRX_API_KEY (GitHub Secrets) 로만 받는다. 코드에 키를 적지 말 것.
"""
import json
import os
import time
from datetime import date, timedelta
from pathlib import Path

import requests

KEY = os.environ.get("KRX_API_KEY", "").strip()
BASE = "https://data-dbg.krx.co.kr/svc/apis/sto"
ENDPOINT = {"KQ": "ksq_bydd_trd", "KS": "stk_bydd_trd"}
IDX_BASE = "https://data-dbg.krx.co.kr/svc/apis/idx"
IDX_ENDPOINT = {"KQ": ("kosdaq_dd_trd", "코스닥"), "KS": ("kospi_dd_trd", "코스피")}
CACHE = Path(__file__).resolve().parent.parent / "data" / "krx_cache.json"
WINDOW_DAYS = 365 * 2 + 10
MAX_CALLS = 400          # 한 번 실행에서 최대 호출 수 (워크플로 제한 시간 안에 끝나도록, 백필은 여러 번에 나눠 채움)
EMPTY_CONFIRM_DAYS = 4   # 이보다 오래된 날짜가 비어 있으면 휴장일로 확정


def _int(v):
    try:
        s = str(v).replace(",", "").strip()
        return int(float(s)) if s and s != "-" else None
    except ValueError:
        return None


def _load():
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception:
        return {"version": 1, "markets": {}}


def _save(cache):
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _fetch_day(market, ymd, base=BASE, endpoint=None):
    ep = endpoint or ENDPOINT[market]
    r = requests.get(f"{base}/{ep}", headers={"AUTH_KEY": KEY}, params={"basDd": ymd}, timeout=60)
    if r.status_code in (401, 403):
        raise PermissionError(f"KRX 인증 거부({r.status_code}) — {ep} 서비스 이용신청 여부 확인")
    r.raise_for_status()
    j = r.json()
    if not j.get("OutBlock_1") and str(j.get("respCode", "")).startswith("4"):
        raise PermissionError(f"KRX {ep}: {j.get('respMsg', '이용 권한 없음')} — 서비스 이용신청 여부 확인")
    return j.get("OutBlock_1") or []


def update(codes_by_market, log=print):
    """
    codes_by_market: {"KQ": {"357230", ...}, "KS": {...}}
    반환: {code: {"dates": [...YYYY-MM-DD], "close": [...], "mcap": [...], "shares": int|None}}
    """
    if not KEY:
        return {}
    cache = _load()
    today = date.today()
    start = today - timedelta(days=WINDOW_DAYS)
    weekdays = [start + timedelta(days=i) for i in range((today - start).days + 1)]
    weekdays = [d.strftime("%Y%m%d") for d in weekdays if d.weekday() < 5]
    calls = 0

    for market, codes in codes_by_market.items():
        if not codes:
            continue
        m = cache["markets"].setdefault(market, {"codes": [], "days": {}, "closed": []})
        if not set(codes) <= set(m["codes"]):
            # 새 종목이 추가되면 기존 날짜도 다시 받아야 하므로 캐시를 비우고 다시 채움
            m.update({"codes": sorted(set(codes) | set(m["codes"])), "days": {}, "closed": []})
        closed = set(m["closed"])
        todo = [d for d in reversed(weekdays) if d not in m["days"] and d not in closed]  # 최신 날짜부터
        # 거래량 저장 이전에 받은 날짜(값 3개)는 거래량을 채우려고 다시 받음 (빠진 날짜 다음 순서)
        todo += [d for d in reversed(weekdays) if d in m["days"] and any(len(v) < 4 for v in m["days"][d].values())]
        denied = False
        for ymd in todo:
            if calls >= MAX_CALLS:
                log(f"KRX {market}: 호출 한도 도달 — 나머지 {len(todo) - todo.index(ymd)}일은 다음 실행에서 채움")
                break
            try:
                rows = _fetch_day(market, ymd)
                calls += 1
            except PermissionError as e:
                log(str(e))
                denied = True
                break
            except Exception as e:
                log(f"KRX {market} {ymd} 조회 실패: {e}")
                calls += 1
                continue
            if not rows:
                age = (today - date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:]))).days
                if age >= EMPTY_CONFIRM_DAYS:
                    closed.add(ymd)        # 휴장일
                continue                   # 최근 날짜는 아직 미반영일 수 있어 다음에 재시도
            day = {}
            for r in rows:
                code = str(r.get("ISU_CD", "")).strip().zfill(6)
                if code in m["codes"]:
                    day[code] = [_int(r.get("TDD_CLSPRC")), _int(r.get("MKTCAP")), _int(r.get("LIST_SHRS")), _int(r.get("ACC_TRDVOL"))]
            m["days"][ymd] = day
            time.sleep(0.1)
        m["closed"] = sorted(closed)
        # 기간 밖 날짜 정리
        m["days"] = {d: v for d, v in m["days"].items() if d >= weekdays[0]}
        m["closed"] = [d for d in m["closed"] if d >= weekdays[0]]
        if denied:
            continue

    # 지수(코스닥·코스피 종가): 종목과 같은 거래일. 이용신청 전이면 한 번만 안내하고 건너뜀
    idx = cache.setdefault("index", {})
    for market in codes_by_market:
        if not codes_by_market[market] or calls >= MAX_CALLS:
            continue
        ep, name = IDX_ENDPOINT[market]
        days = cache["markets"].get(market, {}).get("days", {})
        ix = idx.setdefault(market, {})
        for ymd in [d for d in sorted(days, reverse=True) if d not in ix]:
            if calls >= MAX_CALLS:
                log(f"KRX 지수 {market}: 호출 한도 도달 — 다음 실행에서 이어서")
                break
            try:
                rows = _fetch_day(market, ymd, IDX_BASE, ep)
                calls += 1
            except PermissionError as e:
                log(str(e))
                break
            except Exception as e:
                log(f"KRX 지수 {market} {ymd} 조회 실패: {e}")
                calls += 1
                continue
            row = next((r for r in rows if str(r.get("IDX_NM", "")).strip() == name), None)
            if row:
                ix[ymd] = float(str(row.get("CLSPRC_IDX", "")).replace(",", "") or "nan")
            time.sleep(0.1)
        idx[market] = {d: v for d, v in ix.items() if d >= weekdays[0]}

    _save(cache)
    if calls:
        log(f"KRX: {calls}회 호출")

    out = {}
    for market, m in cache["markets"].items():
        for ymd in sorted(m["days"]):
            for code, v in m["days"][ymd].items():
                close, mcap, shares = v[:3]
                vol = v[3] if len(v) > 3 else None
                if close is None or mcap is None:
                    continue
                s = out.setdefault(code, {"dates": [], "close": [], "mcap": [], "vol": [], "shares": None})
                s["dates"].append(f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}")
                s["close"].append(close)
                s["mcap"].append(mcap)
                s["vol"].append(vol)
                s["shares"] = shares or s["shares"]
    return out


def index_series():
    """캐시의 코스닥·코스피 지수 → {"KQ": {"dates": [...], "close": [...]}, "KS": {...}}"""
    cache = _load()
    out = {}
    for market, ix in (cache.get("index") or {}).items():
        ds = sorted(d for d, v in ix.items() if v == v)
        if ds:
            out[market] = {"name": IDX_ENDPOINT[market][1], "dates": [f"{d[:4]}-{d[4:6]}-{d[6:]}" for d in ds], "close": [ix[d] for d in ds]}
    return out
