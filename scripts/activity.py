"""
사업현황 '주요 활동' 수집
- DART: 최근 6개월 전체 공시(정기·주요사항·거래소·발행 등)를 제목으로 분류
- 뉴스: Google News RSS (키 불필요). 결과는 이전 수집분과 합쳐 누적 보관(최대 9개월)
제목 기반 분류라 완벽하지 않으므로, 화면에서는 원문 링크로 확인하는 것을 전제로 한다.
"""
import email.utils
import html
import re
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import requests

# 분류: (키, 표시명, 제목 패턴) — 위에서부터 먼저 맞는 것
CATEGORIES = [
    ("result",  "실적",       r"사업보고서|반기보고서|분기보고서|감사보고서|잠정\s*실적|영업\s*실적|매출액\s*또는\s*손익|손익구조|실적|매출"),
    ("deal",    "계약·수주",  r"공급\s*계약|판매\s*계약|단일판매|수주|기술\s*이전|라이선스|라이센스|업무\s*협약|MOU|협약|파트너|제휴|계약\s*체결|독점"),
    ("rnd",     "R&D·임상",   r"임상|특허|신약|품목\s*허가|허가|식약처|FDA|기술성|개발\s*성공|연구|논문|학회|인증|기능성\s*원료|개별\s*인정"),
    ("invest",  "투자·M&A",   r"타법인|출자|주식\s*취득|양수|양도|합병|분할|인수|매각|유형자산|공장|설비|시설\s*투자|증설|신설"),
    ("finance", "자금조달",   r"유상\s*증자|무상\s*증자|전환\s*사채|신주인수권|교환\s*사채|사채|투자\s*유치|시리즈|자금\s*조달|증권신고서|투자설명서|상장|IPO"),
    ("product", "제품·마케팅", r"출시|신제품|런칭|론칭|브랜드|광고|모델|캠페인|홈쇼핑|판매\s*개시|입점|수출|해외\s*진출|글로벌"),
    ("gov",     "지배구조",   r"최대주주|대표이사|임원|주주총회|자기주식|이사회|감사|정관|배당|소송|제재|조사"),
    ("ir",      "IR",         r"기업설명회|IR\b|컨퍼런스|간담회"),
]
NOISE = re.compile(r"특정증권등\s*소유상황보고서|소유상황보고서|대량보유상황보고서|주식등의\s*대량보유|공정공시\s*기타|증권발행실적보고서")
_CAT_RE = [(k, n, re.compile(p, re.I)) for k, n, p in CATEGORIES]
CAT_NAME = {k: n for k, n, _ in CATEGORIES} | {"etc": "기타"}


def classify(title):
    for k, _, rx in _CAT_RE:
        if rx.search(title):
            return k
    return "etc"


def _norm(t):
    return re.sub(r"[\s\W_]+", "", t).lower()


# ---------------------------------------------------------------- DART 전체 공시
def dart_activity(list_fn, corp, days=183):
    """list_fn(corp, ty, pages, days) → DART list 행. ty=None 이면 전체 유형"""
    out = []
    for x in list_fn(corp, None, 3, days):
        title = " ".join(x.get("report_nm", "").split())
        if NOISE.search(title):
            continue
        d = x["rcept_dt"]
        out.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "title": title, "src": "공시",
                    "by": x.get("flr_nm", ""), "cat": classify(title),
                    "url": "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=" + x["rcept_no"]})
    return out


# ---------------------------------------------------------------- 뉴스 (Google News RSS)
RSS = "https://news.google.com/rss/search"


def news(names, days=183, must=None, exclude=None, timeout=30):
    """
    names: 검색어 목록(회사명, 영문·약칭). 제목에 이름 중 하나가 들어간 기사만 남김.
    must/exclude: 추가 필터(정규식 문자열) — 동명이인·무관 기사 제거용
    """
    q = " OR ".join(f'"{n}"' for n in names) + f" when:{days}d"
    url = RSS + "?" + urllib.parse.urlencode({"q": q, "hl": "ko", "gl": "KR", "ceid": "KR:ko"})
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0 (dashboard news fetch)"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    must_re = re.compile(must) if must else None
    excl_re = re.compile(exclude) if exclude else None
    keys = [_norm(n) for n in names]
    out, seen = [], set()
    for it in root.iter("item"):
        raw = html.unescape(it.findtext("title") or "").strip()
        src = (it.findtext("source") or "").strip()
        title = raw[: -len(src) - 3].strip() if src and raw.endswith(" - " + src) else raw
        nt = _norm(title)
        if not any(k in nt for k in keys):
            continue
        if (must_re and not must_re.search(title)) or (excl_re and excl_re.search(title)):
            continue
        try:
            dt = email.utils.parsedate_to_datetime(it.findtext("pubDate"))
        except Exception:
            continue
        if dt < since:
            continue
        key = nt[:40]
        if key in seen:                      # 같은 보도자료를 여러 매체가 받은 경우 하나만
            continue
        seen.add(key)
        out.append({"date": dt.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d"),
                    "title": title, "src": "뉴스", "by": src, "cat": classify(title),
                    "url": (it.findtext("link") or "").strip()})
    return out


def merge(new_items, old_items, keep_days=270, cap=200):
    """이번 수집 + 이전 누적분 → 중복 제거, 최근 keep_days일, 최신순"""
    since = (datetime.now() - timedelta(days=keep_days)).strftime("%Y-%m-%d")
    out, seen = [], set()
    for it in sorted(new_items + (old_items or []), key=lambda x: x["date"], reverse=True):
        if it["date"] < since:
            continue
        k = (it["src"], it.get("url") if it["src"] == "공시" else _norm(it["title"])[:40])
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out[:cap]
