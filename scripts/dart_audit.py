"""
DART 감사보고서 원문에서 손익계산서 주요 계정(매출액·영업이익·당기순이익)을 추출한다.
외감 비상장사처럼 구조화된 재무 API가 없는 회사를 위한 파서.

원문 양식이 회사마다 조금씩 달라 휴리스틱으로 읽으므로,
결과에는 항상 원문 링크(rcept_no)를 함께 남겨 검증할 수 있게 한다.
"""
import html
import re

TITLE_RE = re.compile(r"(포\s*괄\s*)?손\s*익\s*계\s*산\s*서")
ROW_RE = re.compile(r"<TR\b[^>]*>(.*?)</TR>", re.S | re.I)
CELL_RE = re.compile(r"<T[DEHU]\b[^>]*>(.*?)</T[DEHU]>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
UNIT_RE = re.compile(r"단\s*위\s*[:：]?\s*(백\s*만\s*원|천\s*원|원)")
NOTE_RE = re.compile(r"^\d{1,2}(\s*[,.]\s*\d{1,2})*$")       # 주석 번호: "22", "4,22", "3.5"
LEAD_RE = re.compile(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫIVX0-9\.\(\)\s·\-]+")

UNIT_MULT = {"원": 1, "천원": 1_000, "백만원": 1_000_000}


def decode(raw: bytes) -> str:
    for enc in ("utf-8", "cp949", "euc-kr"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def cell_text(c: str) -> str:
    return html.unescape(TAG_RE.sub("", c)).replace("\xa0", " ").strip()


def parse_num(s: str):
    s = s.replace(" ", "")
    if not s or s in ("-", "–", "—"):
        return None
    neg = s.startswith("(") and s.endswith(")") or s.startswith("△") or s.startswith("▽") or s.startswith("-")
    digits = re.sub(r"[^\d]", "", s)
    if not digits:
        return None
    v = float(digits)
    return -v if neg else v


def norm_label(s: str) -> str:
    s = re.sub(r"\s+", "", s)
    s = LEAD_RE.sub("", s)
    return s


def classify(label: str):
    if label.startswith(("매출원가", "매출총", "매출채권", "매출할인")):
        return None
    if label.startswith(("매출액", "수익(매출액)", "영업수익")) or label in ("매출", "수익"):
        return "revenue"
    if label.startswith(("영업이익", "영업손실", "영업손익")):
        return "operatingIncome"
    if label.startswith(("당기순이익", "당기순손실", "당기순손익")):
        return "netIncome"
    return None


def row_values(cells):
    """라벨 다음 셀들에서 주석번호를 빼고 숫자만 순서대로"""
    vals = []
    for i, c in enumerate(cells[1:]):
        t = c.replace(" ", "")
        if i == 0 and NOTE_RE.match(t):   # 라벨 바로 옆 칸은 주석 번호 칸
            continue
        v = parse_num(t)
        if v is not None:
            vals.append(v)
    return vals


def _scan(doc, start):
    """start 위치부터 표 행을 읽어 매출액·영업이익·당기순이익을 찾는다"""
    window = doc[start: start + 150000]
    found, first_pos = {}, None
    for rm in ROW_RE.finditer(window):
        cells = [cell_text(c) for c in CELL_RE.findall(rm.group(1))]
        if len(cells) < 2:
            continue
        key = classify(norm_label(cells[0]))
        if not key or key in found:
            continue
        vals = row_values(cells)
        if vals:
            found[key] = (vals[0], vals[1] if len(vals) > 1 else None)
            if first_pos is None:
                first_pos = rm.start()
        if len(found) == 3:
            break
    return found, window, first_pos


def extract_income(doc: str):
    """
    반환: {"unit": "원", "revenue": (당기, 전기), "operatingIncome": (...), "netIncome": (...)}
    찾지 못하면 None.
    '손익계산서' 제목은 목차·본문·주석 등 여러 번 나오므로 모든 위치에서 읽어 보고
    가장 많은 계정을 찾은 위치(같으면 앞쪽)를 쓴다.
    """
    best = None
    for m in TITLE_RE.finditer(doc):
        found, window, first_pos = _scan(doc, m.start())
        if not found or ("revenue" not in found and "operatingIncome" not in found):
            continue
        if best is None or len(found) > len(best[0]):
            best = (found, window, first_pos)
        if len(found) == 3:
            break
    if best is None:
        return None
    found, window, first_pos = best
    # 단위 표기는 표 바로 위에 있으므로, 처음 찾은 행에서 가장 가까운 '단위' 를 쓴다
    units = UNIT_RE.findall(window[max(0, first_pos - 4000): first_pos])
    unit = re.sub(r"\s", "", units[-1]) if units else "원"
    mult = UNIT_MULT.get(unit, 1)
    out = {"unit": unit}
    for k, (cur, prev) in found.items():
        out[k] = (cur * mult if cur is not None else None,
                  prev * mult if prev is not None else None)
    return out


# ---------------------------------------------------------------- 표 단위 유틸
TABLE_RE = re.compile(r"<TABLE\b[^>]*>(.*?)</TABLE>", re.S | re.I)
PCT_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def tables(doc):
    """(시작 위치, [[셀 텍스트, ...], ...]) 목록"""
    out = []
    for tm in TABLE_RE.finditer(doc):
        rows = [[cell_text(c) for c in CELL_RE.findall(rm.group(1))] for rm in ROW_RE.finditer(tm.group(1))]
        out.append((tm.start(), [r for r in rows if r]))
    return out


def unit_before(doc, pos, span=3000):
    units = UNIT_RE.findall(doc[max(0, pos - span): pos])
    return re.sub(r"\s", "", units[-1]) if units else "원"


def parse_pct(s):
    s = s.replace(" ", "")
    if not s or s in ("-", "–", "—") or "%" not in s and not PCT_RE.fullmatch(s):
        return None
    m = PCT_RE.search(s)
    if not m:
        return None
    v = float(m.group(0).replace(",", ""))
    return -v if (s.startswith("(") and s.endswith(")")) or s.startswith("△") else v


# ---------------------------------------------------------------- 광고선전비 · 판매촉진비 (판관비 주석)
AD_KEYS = ("광고선전비", "광고비")
PROMO_KEYS = ("판매촉진비", "판촉비", "판매촉진수수료")
ADPROMO_KEYS = ("광고판촉비", "광고선전및판매촉진비", "광고선전비및판매촉진비", "광고및판촉비")
EXPENSE_HINT = ("급여", "감가상각비", "지급수수료", "복리후생비")


def extract_ad(doc):
    """
    판매비와관리비(또는 비용의 성격별 분류) 주석 표에서 광고선전비·판매촉진비 (당기, 전기).
    사업보고서는 연결 주석이 먼저 나오므로 첫 번째로 맞는 표를 쓴다.
    반환: {"unit", "ad": (당기, 전기)|None, "promo": (..)|None, "adPromo": (..)|None} 또는 None
    """
    for pos, rows in tables(doc):
        labels = [norm_label(r[0]) for r in rows]
        if not any(l.startswith(EXPENSE_HINT) for l in labels):
            continue
        found = {}
        for r, l in zip(rows, labels):
            key = ("adPromo" if l.startswith(ADPROMO_KEYS) else
                   "ad" if l.startswith(AD_KEYS) else
                   "promo" if l.startswith(PROMO_KEYS) else None)
            if key and key not in found:
                vals = row_values(r)
                if vals:
                    found[key] = (vals[0], vals[1] if len(vals) > 1 else None)
        if not found:
            continue
        mult = UNIT_MULT.get(unit_before(doc, pos), 1)
        out = {"unit": unit_before(doc, pos)}
        for k in ("ad", "promo", "adPromo"):
            v = found.get(k)
            out[k] = tuple(x * mult if x is not None else None for x in v) if v else None
        return out
    return None


# ---------------------------------------------------------------- 연구개발비용 표 (사업·반기·분기보고서)
def extract_rnd(doc):
    """
    '연구개발비용' 표: 연구개발비 합계와 매출액 대비 비율 (최근 순으로 최대 3개 기간).
    반환: {"unit", "amount": [당기, 전기, 전전기], "ratio": [%...]} 또는 None
    """
    for pos, rows in tables(doc):
        labels = [norm_label(r[0]) for r in rows]
        joined = ["".join(norm_label(c) for c in r if not PCT_RE.fullmatch(c.replace(" ", "").replace("%", ""))) for r in rows]
        ratio_i = next((i for i, j in enumerate(joined) if "매출액" in j and "비율" in j), None)
        if ratio_i is None or not any("연구개발" in j for j in joined):
            continue
        # 합계 행: 정부보조금 차감 전 총계를 우선
        amt_i = None
        for want in ("연구개발비용계", "연구개발비용합계", "연구개발비용총계", "연구개발비계", "연구개발비합계", "합계", "계"):
            amt_i = next((i for i, j in enumerate(joined[:ratio_i])
                          if want in j and "차감후" not in j and not j.lstrip("(").startswith("정부보조금")), None)
            if amt_i is not None:
                break
        ratio = [v for v in (parse_pct(c) for c in rows[ratio_i][1:]) if v is not None][:3]
        amount = []
        if amt_i is not None:
            amount = [v for v in (parse_num(c.replace(" ", "")) for c in rows[amt_i][1:] if "%" not in c) if v is not None][:3]
        if not ratio and not amount:
            continue
        unit = unit_before(doc, pos)
        mult = UNIT_MULT.get(unit, 1)
        return {"unit": unit, "amount": [a * mult for a in amount], "ratio": ratio}
    return None


def report_period(report_nm: str):
    """'반기보고서 (2026.06)' → ('2026.06', 'H') / 사업보고서 → 'A' / 분기 → 'Q'"""
    m = re.search(r"\((\d{4})\.(\d{2})\)", report_nm)
    if not m:
        return None, None
    kind = "A" if "사업보고서" in report_nm else "H" if "반기" in report_nm else "Q" if "분기" in report_nm else None
    return f"{m.group(1)}.{m.group(2)}", kind


def fiscal_year(report_nm: str):
    """'감사보고서 (2025.12)' → 2025"""
    m = re.search(r"\((\d{4})\.(\d{2})\)", report_nm)
    return int(m.group(1)) if m else None
