"""
1회용 점검: 회사별 '세부계정'을 같은 기준으로 모을 수 있는지 확인한다.
- 국내: 최신 사업보고서/감사보고서(FY) + 최신 반기보고서의 주석에서
        판관비 세부, 비용의 성격별 분류, 매출원가 구성, 매출(수익) 구분 표를 찾아 계정명과 당기 금액을 뽑는다.
        (OpenDART 점검 중에도 되도록 DART 웹 뷰어를 사용, 요청 간 1초 대기)
- 해외: yfinance 손익계산서에 값이 있는 행 이름
결과는 probe_out.json (Actions 첨부 파일)로만 남기고 data/에는 쓰지 않는다.
"""
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from dart_audit import tables, norm_label, row_values, unit_before, decode  # noqa: E402

S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (compatible; dashboard-probe/1.0)"
WEB = "https://dart.fss.or.kr"

KINDS = {
    "sga":    {"ctx": ("판매비와관리비", "판매비와 관리비", "판매관리비", "판매비및관리비"),
               "hint": ("급여", "복리후생비", "감가상각비", "지급수수료", "광고선전비", "운반비", "판매수수료", "세금과공과")},
    "nature": {"ctx": ("성격별",),
               "hint": ("원재료", "종업원급여", "감가상각", "재고자산의변동", "제품과재공품", "상품의매입", "급여")},
    "cogs":   {"ctx": ("매출원가",),
               "hint": ("기초제품", "당기제품제조원가", "기말제품", "제품매출원가", "상품매출원가", "기초상품", "당기상품매입")},
    "rev":    {"ctx": ("수익", "매출액", "고객과의 계약", "영업부문"),
               "hint": ("제품매출", "상품매출", "용역매출", "기타매출", "임대수익", "로열티", "기술이전")},
}


def get(url, **params):
    time.sleep(1.0)
    r = S.get(url, params=params, timeout=40)
    r.raise_for_status()
    return decode(r.content)


def nodes(rcp):
    """보고서 목차 노드 [{text, dcmNo, eleId, offset, length, dtd}]"""
    page = get(f"{WEB}/dsaf001/main.do", rcpNo=rcp)
    found = {}
    for var, k, v in re.findall(r"(node\d+)\['(\w+)'\]\s*=\s*\"([^\"]*)\"", page):
        found.setdefault(var, {})[k] = v
    out = [n for n in found.values() if n.get("dcmNo")]
    if not out:   # 목차 없는 단일 문서
        m = re.search(r"viewDoc\('(\d+)',\s*'(\d+)',\s*'(\d*)',\s*'(\d*)',\s*'(\d*)',\s*'([^']+)'", page)
        if m:
            out = [{"text": "(전체)", "rcpNo": m.group(1), "dcmNo": m.group(2), "eleId": m.group(3),
                    "offset": m.group(4), "length": m.group(5), "dtd": m.group(6)}]
    return out


def viewer(rcp, n):
    return get(f"{WEB}/report/viewer.do", rcpNo=rcp, dcmNo=n["dcmNo"], eleId=n.get("eleId", ""),
               offset=n.get("offset", ""), length=n.get("length", ""), dtd=n.get("dtd", "dart3.xsd"))


def pick_docs(nl):
    """연결 주석 / 별도 주석 / 손익계산서 본문 노드"""
    t = lambda n: re.sub(r"\s", "", n.get("text", ""))
    cons = [n for n in nl if "연결재무제표주석" in t(n) or t(n).endswith("연결재무제표에대한주석")]
    sep = [n for n in nl if ("재무제표주석" in t(n) or "재무제표에대한주석" in t(n)) and "연결" not in t(n)]
    body_c = [n for n in nl if t(n).endswith("연결재무제표") and "주석" not in t(n)]
    body_s = [n for n in nl if t(n).endswith("재무제표") and "연결" not in t(n) and "주석" not in t(n) and "요약" not in t(n)]
    whole = [n for n in nl if "감사보고서" in t(n) or "(첨부)" in t(n) or t(n) == "(전체)"]
    return {"consNotes": cons[:1], "sepNotes": sep[:1], "consBody": body_c[:1], "sepBody": body_s[:1], "whole": whole}


def classify_tables(doc):
    res = {}
    for pos, rows in tables(doc):
        if len(rows) < 3:
            continue
        labels = [norm_label(r[0]) for r in rows if r]
        ctx = re.sub(r"<[^>]+>", " ", doc[max(0, pos - 1500):pos])
        ctx = re.sub(r"\s+", " ", ctx)[-400:]
        for kind, spec in KINDS.items():
            if kind in res:
                continue
            hits = sum(any(l.startswith(h) for l in labels) for h in spec["hint"])
            if hits >= 2 and any(c in ctx for c in spec["ctx"]):
                unit = unit_before(doc, pos)
                items = []
                for r in rows:
                    lab = norm_label(r[0]) if r else ""
                    if not lab or lab in ("구분", "과목", "계정과목", "내역"):
                        continue
                    vals = row_values(r)
                    items.append([lab, vals[0] if vals else None])
                res[kind] = {"unit": unit, "items": items, "ctx": ctx[-120:]}
    return res


def body_is_rows(doc):
    """손익계산서 본문 계정 목록 (판관비가 본문에 세부로 나오는지 확인용)"""
    for pos, rows in tables(doc):
        labels = [norm_label(r[0]) for r in rows if r]
        if any(l.startswith("매출") for l in labels) and any(l.startswith(("영업이익", "영업손실", "영업손익")) for l in labels):
            return [l for l in labels if l][:60]
    return None


def probe_report(rcp):
    nl = nodes(rcp)
    d = pick_docs(nl)
    out = {"rcpNo": rcp, "toc": [n.get("text") for n in nl][:80]}
    for key in ("consNotes", "sepNotes"):
        if d[key]:
            out[key] = classify_tables(viewer(rcp, d[key][0]))
    for key in ("consBody", "sepBody"):
        if d[key]:
            out[key] = body_is_rows(viewer(rcp, d[key][0]))
    if not d["consNotes"] and not d["sepNotes"]:      # 감사보고서처럼 주석이 한 문서에 섞인 경우
        for n in d["whole"][:3] or nl[:3]:
            doc = viewer(rcp, n)
            got = classify_tables(doc)
            if got:
                out["wholeNotes"] = got
                out["wholeBody"] = body_is_rows(doc)
                break
    return out


def rcp_of(url):
    m = re.search(r"rcpNo=(\d+)", url or "")
    return m.group(1) if m else None


def main():
    cos = {}
    for g in ("biz", "hff", "microbiome"):
        for c in json.loads((ROOT / "data" / f"{g}.json").read_text(encoding="utf-8"))["companies"]:
            cos.setdefault(c["name"], c)
    cfg = json.loads((ROOT / "config" / "companies.json").read_text(encoding="utf-8"))["companies"]
    tickers = {v["name"]: v.get("ticker") for v in cfg.values()}
    result = {}
    for name, c in cos.items():
        print("::group::" + name, flush=True)
        r = {"country": c.get("country"), "listed": c.get("listed")}
        try:
            if c.get("country") != "KR":
                import yfinance as yf
                t = yf.Ticker(tickers[name])
                for k, df in (("annual", t.income_stmt), ("quarterly", t.quarterly_income_stmt)):
                    if df is not None and not df.empty:
                        col = df.columns[0]
                        r[k] = {"period": str(col)[:10],
                                "rows": [[str(i), None if df.loc[i, col] != df.loc[i, col] else float(df.loc[i, col])] for i in df.index]}
            else:
                reps = [x for x in (c.get("disclosures") or []) if x.get("cat") == "report"]
                fy = next((x for x in reps if "사업보고서" in x["title"]), None)
                if not fy:
                    links = (c.get("annual") or {}).get("links") or {}
                    fy = {"title": "감사보고서(대시보드 사용분)", "url": links[max(links)]} if links else \
                         next((x for x in reps if "감사보고서" in x["title"]), None)
                hy = next((x for x in reps if "반기보고서" in x["title"]), None)
                if fy:
                    r["fy"] = {"title": fy["title"], **probe_report(rcp_of(fy["url"]))}
                if hy:
                    r["half"] = {"title": hy["title"], **probe_report(rcp_of(hy["url"]))}
        except Exception as ex:  # 한 회사 실패가 전체를 멈추지 않도록
            r["error"] = f"{type(ex).__name__}: {ex}"
        result[name] = r
        print(json.dumps(r, ensure_ascii=False)[:3000], flush=True)
        print("::endgroup::", flush=True)
    Path("probe_out.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
