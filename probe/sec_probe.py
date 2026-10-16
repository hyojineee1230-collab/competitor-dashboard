"""SEC EDGAR companyfacts 원문 구조 확인용(임시). 결과는 probe-out/sec.json"""
import json, os, time, urllib.request
UA = {"User-Agent": "competitor-dashboard-monitor noreply@users.noreply.github.com", "Accept-Encoding": "identity"}
def get(u):
    time.sleep(0.3)
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
        return json.load(r)
TAGS = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet",
        "CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold",
        "OperatingIncomeLoss", "NetIncomeLoss", "GrossProfit", "ResearchAndDevelopmentExpense", "SellingGeneralAndAdministrativeExpense"]
out = {}
cik = {"HLF": "0001180262", "USNA": "0000896264", "MCRB": "0001609809"}
try:
    tick = get("https://www.sec.gov/files/company_tickers.json")
    cik.update({v["ticker"]: str(v["cik_str"]).zfill(10) for v in tick.values() if v["ticker"] in cik})
    out["_tickers"] = "ok"
except Exception as e:
    out["_tickers"] = repr(e)
for t in ["HLF", "USNA", "MCRB"]:
    c = cik.get(t); res = {"cik": c}
    try:
        f = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c}.json")
        g = f["facts"].get("us-gaap", {})
        res["allTags"] = [k for k in g if any(w in k for w in ("Revenue", "Cost", "Operating", "NetIncome", "Gross"))][:80]
        for k in TAGS:
            if k not in g: continue
            rows = [x for x in g[k]["units"].get("USD", []) if x.get("end", "") >= "2021-01-01" and x.get("form") in ("10-K", "10-Q")]
            res[k] = [[x.get("start"), x["end"], x["form"], x.get("fp"), x.get("fy"), x.get("frame"), x["accn"], x["val"], x.get("filed")] for x in rows]
        s = get(f"https://data.sec.gov/submissions/CIK{c}.json")["filings"]["recent"]
        res["filings"] = [[s["accessionNumber"][i], s["form"][i], s["reportDate"][i], s["filingDate"][i], s["primaryDocument"][i]] for i in range(len(s["form"])) if s["form"][i] in ("10-K", "10-Q")][:14]
    except Exception as e:
        res["error"] = repr(e)
    out[t] = res
os.makedirs("probe-out", exist_ok=True)
json.dump(out, open("probe-out/sec.json", "w"), indent=0)
print({k: (v.get("error") or len(v)) for k, v in out.items()})
