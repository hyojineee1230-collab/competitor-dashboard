"""SEC 접속 조건 확인(임시): User-Agent·헤더 조합별 응답 코드"""
import json, os, time, urllib.request, gzip
URL = "https://data.sec.gov/api/xbrl/companyconcept/CIK0000896264/us-gaap/Revenues.json"
UAS = ["competitor-dashboard-monitor noreply@users.noreply.github.com",
       "CompetitorDashboard admin@example.com",
       "Mozilla/5.0 (compatible; CompetitorDashboard/1.0; +https://github.com)",
       "Sample Company Name AdminContact@samplecompanydomain.com"]
res = []
for ua in UAS:
    for enc in ("gzip, deflate", None):
        h = {"User-Agent": ua}
        if enc: h["Accept-Encoding"] = enc
        try:
            with urllib.request.urlopen(urllib.request.Request(URL, headers=h), timeout=30) as r:
                b = r.read(); b = gzip.decompress(b) if r.headers.get("Content-Encoding") == "gzip" else b
                res.append([ua, enc, r.status, len(b)])
        except Exception as e:
            res.append([ua, enc, repr(e)[:80], 0])
        time.sleep(1)
try:
    ip = urllib.request.urlopen("https://api.ipify.org", timeout=10).read().decode()
except Exception as e:
    ip = repr(e)
os.makedirs("probe-out", exist_ok=True)
json.dump({"res": res, "ip": ip}, open("probe-out/sec_ua.json", "w"), indent=0)
