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
    '<a class="info-btn" href="./" title="다른 호 보기">호 목록</a><a class="info-btn" href="../" title="대시보드">← 대시보드</a><span class="pm"><button class="info-btn" type="button" id="printBtn" aria-haspopup="menu" aria-expanded="false">인쇄·PDF</button><span class="pm-m" id="printMenu" role="menu" hidden><button type="button" role="menuitem" data-p="all">전체 3개 분야</button><button type="button" role="menuitem" data-p="cur">현재 분야만</button></span></span>')
rep("function maybeIntro(){", "function maybeIntro(){ return; ")
# 호 머리 자리
rep('  <div id="content">', '  <div id="content">\n    <section class="panel is-panel" id="secIssue"></section>')
rep('<div class="gbar"><p class="gdesc" id="gdesc"></p></div>', '<div class="gbar"><p class="gdesc" id="gdesc"></p></div>\n  <div id="printRoot" aria-hidden="true"></div>')
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
#content[data-mode="business"] > #secHead{order:-101}
.is-badge{font-size:14px;font-weight:600;color:var(--brand);background:var(--brand-soft);border-radius:999px;padding:3px 12px;vertical-align:4px;margin-left:6px}
.is-panel{border-top:4px solid var(--brand)}
.is-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.is-hd h2{margin:2px 0 0;font-size:22px}
.is-k{font-size:13px;font-weight:700;color:var(--brand);letter-spacing:.02em}
.is-ins{list-style:none;margin:0 0 18px;padding:0}
.is-ins > li{padding:12px 2px;border-top:1px solid var(--line)}
.is-ins > li:first-child{border-top:0;padding-top:4px}
.is-ins > li > b{display:flex;gap:8px;align-items:baseline;font-size:16px;margin-bottom:4px}
.is-ins > li > b::before{content:"";flex:none;width:8px;height:8px;border-radius:2px;background:var(--brand);transform:translateY(-2px)}
.is-ins ul{margin:0;padding:0 0 0 34px;color:var(--ink-2);font-size:14.5px;line-height:1.6}
.is-ins ul li{margin:2px 0}
.is-ins ul li::marker{color:var(--muted)}
.is-ins .act-src{margin:6px 0 0 16px}
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
/* 기간 중 보도: 3D 원형 + 범례 */
.is-pie{display:grid;gap:10px}
.is-pie .c{width:min(190px,80%);justify-self:center}
.is-pie .c svg{display:block;width:100%;height:auto;overflow:visible}
.is-pie .c text{font-size:13px;font-weight:700;pointer-events:none}
.is-leg{display:grid;gap:1px;font-size:14px}
.is-leg > div{display:grid;grid-template-columns:10px minmax(0,1fr) auto 40px;gap:8px;align-items:center;padding:3px 0;border-top:1px solid var(--line)}
.is-leg > div:first-child{border-top:0}
.is-leg b{width:10px;height:10px;border-radius:2px}
.is-leg span:first-of-type{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.is-leg span:nth-of-type(2){font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
.is-leg span:nth-of-type(3){color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
/* 연간 실적 비교 막대: 윗면·옆면을 덧대 입체로 (리포트 양식) */
.fr-row .tr{overflow:visible}
.fr-row .tr i{border-radius:0}
.fr-row .tr i::before{content:"";position:absolute;left:0;right:0;top:-5px;height:5px;background:inherit;filter:brightness(1.35);transform:skewX(-45deg);transform-origin:bottom left}
.fr-row .tr i::after{content:"";position:absolute;left:100%;top:0;width:5px;height:100%;background:inherit;filter:brightness(.7);transform:skewY(-45deg);transform-origin:top left}
.fr-row .tr i.cut::before,.fr-row .tr i.cut::after{display:none}
.fr-row{padding:7px 0}
.upd{margin:0 0 10px;font-size:13px;font-weight:600;display:inline-block;border-radius:999px;padding:2px 10px}
.upd.new{background:color-mix(in srgb,var(--up) 12%,transparent);color:var(--up)}
.upd.same{background:var(--tag);color:var(--muted)}
@media (max-width:760px){ .is-grid{grid-template-columns:1fr} .is-hd h2{font-size:19px} .hdr-r .info-btn{white-space:nowrap;padding:5px 8px;font-size:12.5px} #updated{white-space:nowrap} }
/* 인쇄 메뉴 */
.pm{position:relative;display:inline-block}
.pm-m{position:absolute;right:0;top:calc(100% + 6px);z-index:30;display:flex;flex-direction:column;min-width:150px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px}
.pm-m[hidden]{display:none}
.pm-m button{all:unset;cursor:pointer;padding:9px 12px;border-radius:7px;font-size:14px;color:var(--ink);white-space:nowrap}
.pm-m button:hover,.pm-m button:focus-visible{background:var(--tag)}
#printRoot{display:none}
#pOverlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--page) 88%,transparent);font-size:17px;font-weight:700;color:var(--ink);backdrop-filter:blur(2px)}
/* ---------- 인쇄: A4 보고서 서식 ----------
   화면에서 그린 그래프는 그림으로 바꿔 담고(잘림 방지), 넓은 화면 배치를 0.8배로 줄여 담음 */
@media print{
  @page{size:A4;margin:12mm 11mm 14mm;
    @bottom-left{content:"경쟁사 리포트";font-size:8pt;color:#8A94A6}
    @bottom-right{content:counter(page) " / " counter(pages);font-size:8pt;color:#8A94A6}}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{background:#fff !important}
  .wrap{max-width:none !important;padding:0 !important;margin:0 !important}
  body.printing .wrap > *:not(header):not(#printRoot){display:none !important}
  body.printing #printRoot{display:block;zoom:.8}
  header{border-radius:0 !important;margin:0 0 10px !important;break-after:avoid}
  .hdr-r .meta > *:not(#updated), #themeBtn, #fsBtn, .pm, #introBtn, #setBtn{display:none !important}
  .pgrp + .pgrp{margin-top:18px}
  .pgrp-h{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--brand);padding:2px 2px 6px;margin:0 0 12px;break-after:avoid}
  .pgrp-h b{font-size:20px}
  .pgrp-h span{font-size:13px;color:var(--muted)}
  #printRoot .seg, #printRoot select, #printRoot .fs-btn, #printRoot .btn, #printRoot .go, #printRoot .sel-btn,
  #printRoot .more, #printRoot .mk-strip, #printRoot [hidden]{display:none !important}
  #printRoot .core-grid{display:grid !important;grid-template-columns:repeat(auto-fit,minmax(150px,1fr)) !important;grid-auto-flow:row !important;grid-auto-columns:auto !important;overflow:visible !important;padding-bottom:0 !important}
  #printRoot .tw, #printRoot .tbl-wrap, #printRoot .table-wrap{overflow:visible !important}
  #printRoot table{width:100% !important}
  #printRoot .chart-box{height:auto !important}
  #printRoot img.pimg{display:block;width:100%;height:auto;max-height:430px;object-fit:contain;object-position:left top}
  #printRoot .panel{break-inside:auto;box-shadow:none !important;margin-bottom:12px !important}
  #printRoot .panel:has(img.pimg){break-inside:avoid}   /* 그래프가 있는 구역은 제목·그래프를 한 쪽에 */
  #printRoot .pgrp-h + *{break-before:avoid}
  #printRoot .is-pie .c{width:150px}
  #printRoot .panel h2, #printRoot .panel h3, #printRoot .upd, #printRoot .hint{break-after:avoid}
  #printRoot .chart-box, #printRoot img.pimg, #printRoot .core-card, #printRoot tr, #printRoot li, #printRoot .is-box, #printRoot .card{break-inside:avoid}
  #printRoot .is-grid{grid-template-columns:1fr 1.4fr 1fr !important}
}
"""
rep("</style>\n</head>", CSS + "</style>\n</head>")

PRINT_JS = r"""/* ---------- 인쇄: 분야별로 그려 그래프는 그림으로 담음 ---------- */
const PTABS = () => [...document.querySelectorAll("#tabs .tab")].map(b => [b.dataset.id, (b.childNodes[0]?.textContent || b.textContent).trim()]);
const pWait = ms => new Promise(r => setTimeout(r, ms)), pFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
let PRINT_RESTORE = null, P_PENDING = 0;
{ const f0 = window.fetch.bind(window);   // 진행 중인 데이터 요청 수
  window.fetch = (...a) => { P_PENDING++; return f0(...a).finally(() => { P_PENDING--; }); }; }
async function pReady(){   // 요청이 0건인 상태가 0.5초 이어지면 그리기 끝으로 봄(최대 10초)
  let calm = 0;
  for (let t = 0; t < 10000 && calm < 500; t += 100){ await pWait(100); calm = P_PENDING ? 0 : calm + 100; }
  await pFrames();
}
function pOverlay(msg){
  let o = $("pOverlay");
  if (!msg){ o?.remove(); return; }
  if (!o){ o = document.createElement("div"); o.id = "pOverlay"; o.setAttribute("role", "status"); document.body.append(o); }
  o.textContent = msg;
}
function snapGroup(name){
  const src = $("content"), cl = src.cloneNode(true);
  // 화면에서 안 보이는 구역(#content 규칙으로 숨긴 것 포함)은 사본에서도 숨김
  const sa = src.querySelectorAll("*"), ca = cl.querySelectorAll("*");
  sa.forEach((el, i) => { if (ca[i] && getComputedStyle(el).display === "none") ca[i].setAttribute("hidden", ""); });
  const a = src.querySelectorAll("canvas"), b = cl.querySelectorAll("canvas");
  a.forEach((c, i) => { const d = b[i]; if (!d || !c.width) return;
    try { const img = new Image(); img.src = c.toDataURL("image/png"); img.className = "pimg"; img.alt = c.getAttribute("aria-label") || ""; d.replaceWith(img); } catch (e) {} });
  cl.querySelectorAll(".hint, small").forEach(e => { e.innerHTML = e.innerHTML.replace(/\s*·\s*[^·<]*누르면[^·<]*/g, ""); });
  cl.querySelectorAll("[id]").forEach(e => e.removeAttribute("id")); cl.removeAttribute("id");
  const sec = document.createElement("section"); sec.className = "pgrp";
  sec.innerHTML = `<div class="pgrp-h"><b>${esc(name)}</b><span>${esc($("issueBadge").textContent)} · ${esc($("updated").textContent)}</span></div>`;
  sec.append(cl); return sec;
}
async function buildPrint(all){
  const cur = location.hash.slice(1) || PTABS()[0][0];
  PRINT_RESTORE = { cur, theme: document.documentElement.dataset.theme };
  document.documentElement.dataset.theme = "light";   // 그래프를 밝은 서식으로 다시 그림
  const root = $("printRoot"); root.innerHTML = "";
  const list = all ? PTABS() : PTABS().filter(t => t[0] === cur);
  for (const [k, [id, name]] of list.entries()){
    pOverlay(`인쇄 준비 중 ${k + 1}/${list.length} · ${name}`);
    await selectGroup(id); await pReady();
    root.append(snapGroup(name));
  }
  pOverlay("");
  document.body.classList.add("printing");
}
function endPrint(){
  const r = PRINT_RESTORE; PRINT_RESTORE = null;
  document.body.classList.remove("printing");
  if (!r) return;
  if (r.theme) document.documentElement.dataset.theme = r.theme; else delete document.documentElement.dataset.theme;
  if (r.rerender) selectGroup(r.cur);
}
// Ctrl+P로 바로 인쇄: 지금 화면(현재 분야)을 같은 서식으로
addEventListener("beforeprint", () => {
  if (document.body.classList.contains("printing") && $("printRoot").children.length) { if (PRINT_RESTORE) PRINT_RESTORE.rerender = true; return; }
  const cur = location.hash.slice(1) || PTABS()[0][0], t = PTABS().find(x => x[0] === cur);
  PRINT_RESTORE = { cur, theme: document.documentElement.dataset.theme, rerender: true };
  document.documentElement.dataset.theme = "light";   // 종이는 밝은 서식(그래프는 다음 화면에서 다시 그림)
  $("printRoot").innerHTML = ""; $("printRoot").append(snapGroup(t ? t[1] : ""));
  document.body.classList.add("printing");
});
addEventListener("afterprint", () => {
  const go = () => { ["pointermove", "keydown", "touchstart", "wheel"].forEach(ev => removeEventListener(ev, go, true)); endPrint(); };
  setTimeout(() => ["pointermove", "keydown", "touchstart", "wheel"].forEach(ev => addEventListener(ev, go, { capture: true, once: true })), 800);
});
document.addEventListener("click", async e => {
  const m = $("printMenu"), b = e.target.closest("#printBtn"), it = e.target.closest("#printMenu [data-p]");
  if (b){ m.hidden = !m.hidden; b.setAttribute("aria-expanded", String(!m.hidden)); return; }
  if (it){ m.hidden = true; const pb = $("printBtn"); pb.setAttribute("aria-expanded", "false"); pb.textContent = "준비 중…";
    try { await buildPrint(it.dataset.p === "all"); } finally { pb.textContent = "인쇄·PDF"; }
    print(); return; }
  if (m && !m.hidden && !e.target.closest(".pm")) m.hidden = true;
});
"""
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
  const top = nw.slice(0, 7), rest = nw.slice(7).reduce((t, x) => t + x[1], 0);
  const pieIt = [...top.map(([id, n]) => [nm(id), n, col(id)]), ...(rest ? [["그 외", rest, css("--axis")]] : [])];
  const news = nt ? `<div class="is-pie"><div class="c">${pie3d(pieIt.map(([n, v, c]) => [n, v / nt * 100, c, ""]))}</div>
      <div class="is-leg">${pieIt.map(([n, v, c], i) => `<div data-i="${i}"><b style="background:${c}"></b><span>${esc(n)}</span><span>${v}건</span><span>${(v / nt * 100).toFixed(0)}%</span></div>`).join("")}</div></div>` : "";
  $("secIssue").innerHTML = `<div class="is-hd"><div><span class="is-k">${esc(R.title || "")}${R.pilot ? " · 시범호" : ""}</span><h2>${FIELD_NAME[F] || ""} · 이번 달 인사이트</h2>
      <p class="hint">기준일 ${d2(R.asOf)} · 주가 ${d2(R.close)} 종가 · 기간 ${d2(R.window?.[0])} ~ ${d2(R.window?.[1])} · 재무는 OpenDART, 주가는 KRX·Yahoo</p></div></div>
    ${ins?.items?.length ? `<ul class="is-ins">${ins.items.map(x => `<li><b>${esc(x.h)}</b><ul>${String(x.d || "").split(/(?<=\.)\s+(?=\S)/).filter(Boolean).map(z => `<li>${esc(z)}</li>`).join("")}</ul>${srcLinks(x.s)}</li>`).join("")}</ul>` : `<p class="is-none">이번 호 인사이트를 작성 중입니다.</p>`}
    <div class="is-grid">
      <div class="is-box"><h3>1개월 주가 <span>상장사</span></h3>${moves || '<p class="hint">상장사 없음</p>'}</div>
      <div class="is-box"><h3>기간 중 공시 <b>${(dg.disc || []).length}건</b></h3>${disc || '<p class="hint">기간 중 공시 없음</p>'}</div>
      <div class="is-box"><h3>기간 중 보도 <b>${nt}건</b></h3>${news || '<p class="hint">기간 중 보도 없음</p>'}<p class="hint" style="margin:6px 0 0">시세 기사 제외 · 같은 날 비슷한 제목은 1건</p></div>
    </div>`;
  // 별도 재무제표 스위치는 숫자가 바뀌는 실적 비교 구역에 둠
  const fb = $("fsBtn"), ctl = document.querySelector("#secAnnual .controls");
  if (fb && ctl && fb.parentElement !== ctl) ctl.prepend(fb);
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
JS += PRINT_JS
rep("/* ---------- 안내 팝업 ---------- */", JS + "\n/* ---------- 안내 팝업 ---------- */")

import re
s = re.sub(r"@media \((max|min)-width:", r"@media screen and (\1-width:", s)
os.makedirs(os.path.join(ROOT, "report"), exist_ok=True)
open(os.path.join(ROOT, "report", "issue.html"), "w", encoding="utf-8").write(s)
print("report/issue.html", len(s))
