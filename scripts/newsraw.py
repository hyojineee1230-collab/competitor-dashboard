"""
뉴스 원본 아카이브 — 보도 반응(주가·거래량) 분석용. 같은 보도자료라도 매체마다 한 줄씩 남긴다(묶지 않음).

- Google News RSS 검색. 최근 3일(발행 시각 포함)과 이번 달은 매 실행 다시 검색하고, 지난 2년은 달 단위로 실행마다 조금씩 채운다(백필).
- 기간 지정 검색은 날짜만 온다(한국 16:00·17:00로 보임) — 분석 단계(newsfx)에서 날짜를 보정하고 시각 미상으로 처리
- 한 기간 검색 결과가 상한(100건)에 닿으면 기간을 반으로 나눠 다시 검색한다.
- 저장: data/news_raw.jsonl (한 줄 = 기사 1건, 회사·날짜순이라 git diff가 작음), 진행 상태: data/news_state.json
- 동명이인·무관 기사 거르기(config news_must·news_exclude)는 분석 단계에서 다시 적용하므로 여기서는 넓게 모은다.
"""
import email.utils
import html
import json
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

from activity import NEWS_NOISE, _norm, classify

DATA = Path(__file__).resolve().parent.parent / "data"
RAW = DATA / "news_raw.jsonl"
STATE = DATA / "news_state.json"
RSS = "https://news.google.com/rss/search"
KST = timezone(timedelta(hours=9))
KEEP_DAYS = 365 * 2 + 31   # 2년 + 여유
MAX_QUERIES = 120          # 한 번 실행에서 최대 검색 수 (백필은 여러 실행에 나눠 채움)
CAP = 100                  # RSS 한 번에 오는 최대 기사 수
UA = {"User-Agent": "Mozilla/5.0 (dashboard news archive)"}


class Throttled(Exception):
    pass


def _search(names, after=None, before=None, when=None):
    """기간 지정(after/before)은 시각 없이 날짜만 오고, when:Nd는 발행 시각까지 온다"""
    q = " OR ".join(f'"{n}"' for n in names) + (f" when:{when}d" if when else f" after:{after} before:{before}")
    url = RSS + "?" + urllib.parse.urlencode({"q": q, "hl": "ko", "gl": "KR", "ceid": "KR:ko"})
    r = requests.get(url, timeout=30, headers=UA)
    if r.status_code in (429, 503):
        raise Throttled(f"Google 뉴스 응답 {r.status_code}")
    r.raise_for_status()
    return list(ET.fromstring(r.content).iter("item"))


def _items(raw_items, cid, names):
    keys = [_norm(n) for n in names]
    for it in raw_items:
        raw = html.unescape(it.findtext("title") or "").strip()
        src = (it.findtext("source") or "").strip()
        title = raw[: -len(src) - 3].strip() if src and raw.endswith(" - " + src) else raw
        if not any(k in _norm(title) for k in keys) or NEWS_NOISE.search(title):
            continue
        try:
            dt = email.utils.parsedate_to_datetime(it.findtext("pubDate")).astimezone(KST)
        except Exception:
            continue
        yield {"c": cid, "d": dt.strftime("%Y-%m-%d"), "t": dt.strftime("%H:%M"), "by": src,
               "title": title, "cat": classify(title), "url": (it.findtext("link") or "").strip()}


def _window(names, a, b, budget):
    """[a, b) 기간 검색. 상한에 닿으면 반으로 나눔. 반환: (기사 목록, 쓴 검색 수, 완료 여부)"""
    if budget <= 0:
        return [], 0, False
    got = _search(names, a.isoformat(), b.isoformat())
    used = 1
    if len(got) >= CAP and (b - a).days > 2:
        mid = a + (b - a) / 2
        mid = date(mid.year, mid.month, mid.day)
        l, u1, ok1 = _window(names, a, mid, budget - used)
        r, u2, ok2 = _window(names, mid, b, budget - used - u1)
        return l + r, used + u1 + u2, ok1 and ok2
    return got, used, True


def _months(start, end):
    """start가 속한 달부터 end가 속한 달까지 (달 첫날, 다음 달 첫날)"""
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        yield date(y, m, 1), date(ny, nm, 1)
        y, m = ny, nm


def load():
    out = []
    try:
        for line in RAW.read_text(encoding="utf-8").splitlines():
            if line.strip():
                out.append(json.loads(line))
    except FileNotFoundError:
        pass
    return out


def update(targets, log=print):
    """
    targets: [{"id", "names": [...]}] — 국내 회사 전부
    이번 달(매 실행) + 지난 2년 달 단위 백필(검색 수 한도 안에서). 결과를 news_raw.jsonl에 합쳐 저장.
    """
    today = datetime.now(KST).date()
    start = today - timedelta(days=KEEP_DAYS - 31)
    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        state = {"version": 1, "done": {}}
    done = state.setdefault("done", {})
    rows = {(x["c"], x["by"], _norm(x["title"])[:60]): x for x in load()}
    budget, added, throttled = MAX_QUERIES, 0, False

    def put(items):
        nonlocal added
        for x in items:
            k = (x["c"], x["by"], _norm(x["title"])[:60])
            if k not in rows:
                added += 1
            rows[k] = x

    months = list(_months(start, today))
    cur_month = months[-1]
    try:
        # 0) 최근 3일: 발행 시각까지 받기(같은 기사의 날짜만 있는 행을 덮어씀)
        for t in targets:
            if budget <= 0:
                break
            got = _search(t["names"], when=3)
            budget -= 1
            put(_items(got, t["id"], t["names"]))
            time.sleep(0.6)
        # 1) 이번 달: 매 실행 (새 기사)
        for t in targets:
            if budget <= 0:
                break
            got, used, _ = _window(t["names"], cur_month[0], today + timedelta(days=1), budget)
            budget -= used
            put(_items(got, t["id"], t["names"]))
            time.sleep(0.6)
        # 2) 지난달까지 백필: 최근 달부터, 회사를 번갈아 가며
        queue = [(t, a, b) for a, b in reversed(months[:-1]) for t in targets if f"{a:%Y-%m}" not in done.get(t["id"], [])]
        for t, a, b in queue:
            if budget <= 0:
                break
            got, used, ok = _window(t["names"], a, b, budget)
            budget -= used
            put(_items(got, t["id"], t["names"]))
            if ok:
                done.setdefault(t["id"], []).append(f"{a:%Y-%m}")
            time.sleep(0.6)
    except Throttled as ex:
        throttled = True
        log(f"뉴스 아카이브: {ex} — 나머지는 다음 실행에서 이어서")
    except Exception as ex:
        log(f"뉴스 아카이브 실패: {type(ex).__name__}")

    since = start.isoformat()
    keep = sorted((x for x in rows.values() if x["d"] >= since), key=lambda x: (x["c"], x["d"], x["t"], x["by"], x["title"]))
    RAW.write_text("".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) + "\n" for x in keep), encoding="utf-8")
    ids = {t["id"] for t in targets}
    state["done"] = {k: sorted(set(v)) for k, v in done.items() if k in ids}
    total = len(months) - 1
    state["progress"] = {t["id"]: f"{len(state['done'].get(t['id'], []))}/{total}" for t in targets}
    state["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    left = sum(total - len(state["done"].get(t["id"], [])) for t in targets)
    print(f"뉴스 아카이브: 새 기사 {added}건, 검색 {MAX_QUERIES - budget}회, 남은 백필 {left}개 기간" + (" (속도 제한)" if throttled else ""))
    return left
