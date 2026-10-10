"""1회용 검증: 새 판관비 묶음 파서(extract_sga)를 회사별 최신 연간 보고서에 적용 (DART 웹 뷰어 사용)"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe_accounts as P
from dart_audit import extract_sga

out = {}
for g in ("biz", "hff", "microbiome"):
    for c in json.loads((P.ROOT / "data" / f"{g}.json").read_text(encoding="utf-8"))["companies"]:
        if c.get("country") != "KR" or c["name"] in out:
            continue
        reps = [x for x in (c.get("disclosures") or []) if x.get("cat") == "report"]
        fy = [x for x in reps if "사업보고서" in x["title"]]
        if not fy:
            links = (c.get("annual") or {}).get("links") or {}
            fy = [{"title": "감사보고서", "url": links[max(links)]}] if links else []
        r = {}
        for x in fy[:3]:          # 정정 보고서에 주석이 없으면 이전 제출본
            try:
                rcp = P.rcp_of(x["url"]); d = P.pick_docs(P.nodes(rcp))
                order = d["consNotes"] + d["sepNotes"] + d["consBody"] + d["sepBody"]
                got = None
                for n in order:
                    got = extract_sga(P.viewer(rcp, n))
                    if got:
                        break
                r = {"title": x["title"], "rcp": rcp, "sga": got}
                if got:
                    break
            except Exception as ex:
                r = {"title": x["title"], "error": f"{type(ex).__name__}: {ex}"}
        out[c["name"]] = r
        print(c["name"], json.dumps(r, ensure_ascii=False)[:600], flush=True)
Path("probe_out.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
