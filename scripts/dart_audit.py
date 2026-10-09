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


def fiscal_year(report_nm: str):
    """'감사보고서 (2025.12)' → 2025"""
    m = re.search(r"\((\d{4})\.(\d{2})\)", report_nm)
    return int(m.group(1)) if m else None
