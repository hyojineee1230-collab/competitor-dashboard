"""v1 화면(v1/index.html)으로 월간 호 화면(report/issue.html)을 만든다.

사용: python tools/report_page.py
- 숫자·그래프·계산은 v1과 같고, 데이터만 data/reports/<호>/ 에서 읽는다(주소 ?m=YYYY-MM).
- 더하는 것: 호 머리(인사이트·이번 달 공시·보도·1개월 주가), 섹션별 갱신 표시, 인쇄 서식.
- v1을 고친 뒤에는 이 스크립트를 다시 돌려 report/issue.html 을 새로 만든다.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(ROOT, "v1", "index.html"), encoding="utf-8").read()


def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b)


rep("<title>경쟁사 모니터 v1</title>", "<title>경쟁사 리포트</title>")
# 데이터: 호 폴더
rep('const P = p => p.startsWith("data/") ? "../data/" + p.slice(5) : p.startsWith("config/") ? "../config/" + p.slice(7) : p;',
    '''const ISSUE = new URLSearchParams(location.search).get("m");
if (!/^\\d{4}-\\d{2}$/.test(ISSUE || "")) location.replace("./");
const P = p => p.startsWith("data/") ? `../data/reports/${ISSUE}/` + p.slice(5) : p.startsWith("config/") ? "../config/" + p.slice(7) : p;''')
# 머리: 안내·설정 숨김, 대시보드로·인쇄
rep('<h1>경쟁사 모니터 <button class="info-btn set-btn" id="introBtn" aria-haspopup="dialog">ⓘ 안내</button></h1>',
    '<h1>경쟁사 리포트 <span class="is-badge" id="issueBadge"></span><button class="info-btn set-btn" id="introBtn" hidden>ⓘ</button></h1>')
rep('<p class="sub">핵심 경쟁사 요약과 산업별 시장·경쟁사 비교</p>', '<p class="sub" id="issueSub">월간 경쟁사 리포트 · 숫자는 기준일에 고정</p>')
rep('<button class="info-btn" id="setBtn" aria-haspopup="dialog" title="자사·섹션 이름 설정 (이 브라우저에만 저장)">⚙ 설정</button>',
    '<button class="info-btn" id="setBtn" hidden>⚙</button>')
rep('<span class="info-btn" title="2026.10 Beta 전환 전 화면 보관본" style="cursor:default">v1 보관본</span><a class="info-btn" id="sumLink" href="../" title="현재 메인 화면">메인으로</a>',
    '<a class="info-btn" href="./" title="다른 호 보기">호 목록</a><a class="info-btn" href="../" title="대시보드">← 대시보드</a><button class="info-btn" type="button" id="printBtn" onclick="print()">인쇄·PDF</button>')
rep("function maybeIntro(){", "function maybeIntro(){ return; ")
# 호 머리 자리
rep('  <div id="content">', '  <div id="content">\n    <section class="panel is-panel" id="secIssue"></section>')
rep('''function renderAll(){
  if (grp().mode === "full") renderMkt();
  renderCompanies();
}''', '''function renderAll(){
  if (grp().mode === "full") renderMkt();
  renderCompanies();
  renderIssue();
}''')

CSS = """
/* ---------- 월간 호 ---------- */
#content > #secIssue{order:-100}
.is-badge{font-size:14px;font-weight:600;color:var(--brand);background:var(--brand-soft);border-radius:999px;padding:3px 12px;vertical-align:4px;margin-left:6px}
.is-panel{border-top:4px solid var(--brand)}
.is-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.is-hd h2{margin:2px 0 0;font-size:22px}
.is-k{font-size:13px;font-weight:700;color:var(--brand);letter-spacing:.02em}
.is-ins{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:10px}
.is-ins li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.is-ins li > i{font-style:normal;font-weight:700;color:var(--brand);font-size:18px}
.is-ins b{display:block;font-size:16px;margin-bottom:3px}
.is-ins p{margin:0;color:var(--ink-2);font-size:14.5px;line-height:1.6}
.is-ins .act-src{margin-top:6px}
.is-none{color:var(--muted);margin:0 0 18px}
.is-grid{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:14px}
.is-box{border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0}
.is-box h3{margin:0 0 8px;font-size:14px;color:var(--ink-2);display:flex;justify-content:space-between}
.is-box h3 b{color:var(--ink)}
.is-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;font-size:14px;padding:4px 0;border-top:1px solid var(--line)}
.is-row:first-of-type{border-top:0}
.is-row span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.is-d{font-size:14px;padding:5px 0;border-top:1px solid var(--line)}
.is-d:first-of-type{border-top:0}
.is-d small{color:var(--muted);margin-right:6px}
.is-d a{color:var(--ink)}
.is-bar{display:grid;grid-template-columns:118px minmax(0,1fr) 34px;gap:8px;align-items:center;font-size:14px;padding:3px 0}
.is-bar i{display:block;height:10px;border-radius:3px;background:var(--brand)}
.is-bar b{text-align:right}
.upd{margin:0 0 10px;font-size:13px;font-weight:600;display:inline-block;border-radius:999px;padding:2px 10px}
.upd.new{background:color-mix(in srgb,var(--up) 12%,transparent);color:var(--up)}
.upd.same{background:var(--tag);color:var(--muted)}
@media (max-width:760px){ .is-grid{grid-template-columns:1fr} .is-hd h2{font-size:19px} .hdr-r .info-btn{white-space:nowrap;padding:5px 8px;font-size:12.5px} #updated{white-space:nowrap} }
@media print{
  @page{size:A4;margin:12mm}
  body{background:#fff}
  .hdr-r .meta > *:not(#updated), #themeBtn, #fsBtn, #printBtn, .seg, select{display:none !important}
  .panel{break-inside:avoid;box-shadow:none}
  #secIssue{break-after:page}
  .tabs .tab:not([aria-selected="true"]){display:none}
}
"""
rep("</style>\n</head>", CSS + "</style>\n</head>")

JS = r"""
/* ---------- 월간 호: 머리(인사이트·이번 달 공시·보도·1개월 주가), 섹션 갱신 표시 ---------- */
let REPORT = null;
const FIELD_OF = { biz: "core", hff: "hff", microbiome: "microbiome" };
const FIELD_NAME = { core: "핵심 경쟁사", hff: "건강기능식품", microbiome: "마이크로바이옴" };
async function renderIssue(){
  if (!REPORT){ try { REPORT = await loadJSON("data/report.json"); } catch(e){ REPORT = {}; } }
  const R = REPORT, g = state.group, F = FIELD_OF[g], dg = R.digest?.[g] || {}, ins = R.insights?.[F];
  const d2 = d => d ? d.slice(5, 10).replace("-", ".") : "";
  document.title = `${R.title || "리포트"} · 경쟁사 리포트`;
  $("issueBadge").textContent = `${R.title || ""}${R.pilot ? " · 시범호" : ""}`;
  $("updated").textContent = `기준 ${(R.asOf || "").replace(/-/g, ".")}`;
  const all = await allCompanies(), nm = id => all.get(id)?.name || id, col = id => color(all.get(id) || {id});
  const moves = (dg.moves || []).map(x => `<div class="is-row"><span><i class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${col(x.c)}"></i>${esc(nm(x.c))}</span><b class="${x.m1 > 0 ? "up" : x.m1 < 0 ? "down" : ""}">${arrow(x.m1)}</b></div>`).join("");
  const disc = (dg.disc || []).slice(0, 8).map(x => `<div class="is-d"><small>${d2(x.d)}</small><b>${esc(nm(x.c))}</b> <a href="${esc(x.url || "#")}" target="_blank" rel="noopener">${esc(x.t)}</a></div>`).join("");
  const nw = Object.entries(dg.news || {}).sort((a, b) => b[1] - a[1]), mx = nw[0]?.[1] || 1, nt = nw.reduce((t, x) => t + x[1], 0);
  const news = nw.slice(0, 8).map(([id, n]) => `<div class="is-bar"><span>${esc(nm(id))}</span><span><i style="width:${(n / mx * 100).toFixed(0)}%;background:${col(id)}"></i></span><b>${n}</b></div>`).join("");
  $("secIssue").innerHTML = `<div class="is-hd"><div><span class="is-k">${esc(R.title || "")}${R.pilot ? " · 시범호" : ""}</span><h2>${FIELD_NAME[F] || ""} · 이번 달 인사이트</h2>
      <p class="hint">기준일 ${d2(R.asOf)} · 주가 ${d2(R.close)} 종가 · 기간 ${d2(R.window?.[0])} ~ ${d2(R.window?.[1])} · 재무는 OpenDART, 주가는 KRX·Yahoo</p></div></div>
    ${ins?.items?.length ? `<ol class="is-ins">${ins.items.map((x, i) => `<li><i>${i + 1}</i><div><b>${esc(x.h)}</b><p>${esc(x.d)}</p>${srcLinks(x.s)}</div></li>`).join("")}</ol>` : `<p class="is-none">이번 호 인사이트를 작성 중입니다.</p>`}
    <div class="is-grid">
      <div class="is-box"><h3>1개월 주가 <span>상장사</span></h3>${moves || '<p class="hint">상장사 없음</p>'}</div>
      <div class="is-box"><h3>기간 중 공시 <b>${(dg.disc || []).length}건</b></h3>${disc || '<p class="hint">기간 중 공시 없음</p>'}</div>
      <div class="is-box"><h3>기간 중 보도 <b>${nt}건</b></h3>${news || '<p class="hint">기간 중 보도 없음</p>'}<p class="hint" style="margin:6px 0 0">시세 기사 제외 · 같은 날 비슷한 제목은 1건</p></div>
    </div>`;
  setTimeout(applyUpd, 400);
}
function applyUpd(){
  const S = REPORT?.sections?.[state.group] || {};
  document.querySelectorAll("#content .upd").forEach(e => e.remove());
  Object.entries(S).forEach(([id, x]) => {
    const sec = $(id); if (!sec) return;
    const host = sec.tagName === "SECTION" ? sec : sec.querySelector("section.panel"); if (!host) return;
    let el = host.querySelector(":scope > .upd");
    if (!el){ el = document.createElement("p"); host.prepend(el); }
    el.className = "upd " + x.st; el.textContent = x.t;
  });
}
"""
rep("/* ---------- 안내 팝업 ---------- */", JS + "\n/* ---------- 안내 팝업 ---------- */")

os.makedirs(os.path.join(ROOT, "report"), exist_ok=True)
open(os.path.join(ROOT, "report", "issue.html"), "w", encoding="utf-8").write(s)
print("report/issue.html", len(s))
