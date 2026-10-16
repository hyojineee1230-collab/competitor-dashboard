"""미국 상장사 재무: SEC EDGAR XBRL(회사가 제출한 10-K·10-Q 원문 숫자).

DART가 없는 미국 종목(config companies.cik)만 사용한다. 실패하면 호출한 쪽이 Yahoo로 대신한다.
- companyfacts: 계정별 사실(fact) — 기간(start~end)·제출 문서(accn)·제출일
- submissions: 제출 문서 목록 — 원문 링크(10-K·10-Q 본문)
SEC 이용 조건: User-Agent에 '이름 연락처' 형식 필수(아니면 403). 환경변수 SEC_USER_AGENT로 바꿀 수 있음.
"""
import os
import time
from datetime import date, timedelta

import requests

UA = os.environ.get("SEC_USER_AGENT") or "CompetitorDashboard admin@example.com"
FORMS = ("10-K", "10-Q", "10-K/A", "10-Q/A")
# 계정 후보: 앞쪽 태그 우선(회사·연도마다 쓰는 태그가 다름, 예: Seres는 2023년부터 Revenues)
TAGS = {
    "revenue": ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
                "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"),
    "costOfSales": ("CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"),
    "gross": ("GrossProfit",),
    "operatingIncome": ("OperatingIncomeLoss",),
    "netIncome": ("NetIncomeLoss", "ProfitLoss"),
    "rnd": ("ResearchAndDevelopmentExpense",),
    "sga": ("SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"),
}


def _get(url):
    r = requests.get(url, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    time.sleep(0.2)   # SEC 권장: 초당 10회 이하
    return r.json()


def _d(s):
    return date.fromisoformat(s)


def _label(end):
    """기간 끝 날짜 → (회계연도, 분기). 52/53주 회계연도(USANA: 1월 초 마감)도 직전 달로 맞춤"""
    x = _d(end) - timedelta(days=7)
    return x.year, (x.month - 1) // 3 + 1


def _series(us, tags):
    """(start, end) → 값. 앞쪽 태그 우선, 같은 태그 안에서는 늦게 제출된 값(정정 반영)"""
    out = {}
    for rank, tag in enumerate(tags):
        for x in us.get(tag, {}).get("units", {}).get("USD", []):
            if x.get("form") not in FORMS or not x.get("start"):
                continue
            k = (x["start"], x["end"])
            cur = out.get(k)
            if cur is None or (cur[2] == rank and x["filed"] > cur[1]):
                out[k] = (x["val"], x["filed"], rank)
    return {k: v[0] for k, v in out.items()}


def sec_fin(cik):
    """→ (annual 최근 4개 회계연도, quarterly 최근 8개 분기, rnd 최근 3개 회계연도). 금액 USD 원 단위"""
    cik = str(cik).zfill(10)
    us = _get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")["facts"].get("us-gaap", {})
    rec = _get(f"https://data.sec.gov/submissions/CIK{cik}.json")["filings"]["recent"]
    doc = {}   # (양식, 보고 기준일) → 원문 링크
    for i, f in enumerate(rec["form"]):
        if f in ("10-K", "10-Q"):
            acc = rec["accessionNumber"][i].replace("-", "")
            doc.setdefault((f, rec["reportDate"][i]),
                           f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{rec['primaryDocument'][i]}")
    S = {k: _series(us, t) for k, t in TAGS.items()}
    days = lambda k: (_d(k[1]) - _d(k[0])).days
    years = sorted((k for k in S["revenue"] if 340 <= days(k) <= 380), key=lambda k: k[1])
    quarters = {k for s in ("revenue", "operatingIncome") for k in S[s] if 80 <= days(k) <= 100}

    def val(key, k):
        v = S[key].get(k)
        if v is None and key == "costOfSales" and S["revenue"].get(k) is not None and S["gross"].get(k) is not None:
            v = S["revenue"][k] - S["gross"][k]
        return v

    # 4분기는 10-K에 분기 숫자가 없으므로 연간 − (1~3분기)
    qrows = {}
    for k in quarters:
        qrows[k] = {f: val(f, k) for f in ("revenue", "costOfSales", "operatingIncome", "netIncome")}
    for ya in years:
        inside = [k for k in qrows if k[0] >= ya[0] and k[1] <= ya[1]]
        if len(inside) == 3 and not any(k[1] == ya[1] for k in qrows):
            q4 = {}
            for f in ("revenue", "costOfSales", "operatingIncome", "netIncome"):
                a, parts = val(f, ya), [qrows[k][f] for k in inside]
                q4[f] = a - sum(parts) if a is not None and None not in parts else None
            qrows[(max(k[1] for k in inside), ya[1])] = q4

    ys = years[-4:]
    annual = {"years": [str(_label(k[1])[0]) for k in ys], "currency": "USD", "source": "SEC EDGAR 10-K",
              "links": {str(_label(k[1])[0]): doc[("10-K", k[1])] for k in ys if ("10-K", k[1]) in doc}}
    for f in ("revenue", "costOfSales", "operatingIncome", "netIncome"):
        annual[f] = [val(f, k) for k in ys]

    qs = sorted(qrows, key=lambda k: k[1])[-8:]
    lab = lambda k: "{}Q{}".format(*_label(k[1]))
    quarterly = {"periods": [lab(k) for k in qs], "currency": "USD", "source": "SEC EDGAR 10-Q·10-K",
                 "links": {lab(k): doc.get(("10-Q", k[1])) or doc.get(("10-K", k[1])) for k in qs}}
    for f in ("revenue", "costOfSales", "operatingIncome", "netIncome"):
        quarterly[f] = [qrows[k][f] for k in qs]

    ry = years[-3:]
    rnd = None
    if any(S["rnd"].get(k) for k in ry):
        rnd = {"years": [str(_label(k[1])[0]) for k in ry], "amount": [S["rnd"].get(k) for k in ry],
               "sga": [S["sga"].get(k) for k in ry], "currency": "USD", "source": "SEC EDGAR 10-K"}
    return (annual if ys else None), (quarterly if qs else None), rnd


if __name__ == "__main__":   # 점검: python scripts/sec.py 0001180262
    import json
    import sys
    print(json.dumps(sec_fin(sys.argv[1]), indent=1, ensure_ascii=False))
