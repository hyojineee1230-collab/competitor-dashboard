"""1회용 검증: 서흥·비피도·고바이오랩 판관비 표 원형 확인"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe_accounts as P
from dart_audit import tables, norm_label, extract_sga

T = {"서흥": "20260319001055", "비피도": None, "고바이오랩": None}
out = {}
for g in ("hff", "microbiome"):
    for c in json.loads((P.ROOT / "data" / f"{g}.json").read_text(encoding="utf-8"))["companies"]:
        if c["name"] in T and c["name"] not in out:
            reps = [x for x in (c.get("disclosures") or []) if x.get("cat") == "report" and "사업보고서" in x["title"]]
            rcp = T[c["name"]] or P.rcp_of(reps[0]["url"])
            d = P.pick_docs(P.nodes(rcp))
            n = (d["consNotes"] or d["sepNotes"])
            r = {"rcp": rcp, "toc": [x.get("text") for x in P.nodes(rcp)][:12]}
            if n:
                doc = P.viewer(rcp, n[0])
                hits = []
                for pos, rows in tables(doc):
                    ctx = re.sub(r"<[^>]+>|\s+", "", doc[max(0, pos - 800):pos])[-120:]
                    if "판매비" in ctx or "판관비" in ctx or "성격별" in ctx:
                        hits.append({"ctx": ctx, "rows": rows[:40]})
                r["tables"] = hits[:4]
                r["sga"] = extract_sga(doc)
            out[c["name"]] = r
Path("probe_out.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
