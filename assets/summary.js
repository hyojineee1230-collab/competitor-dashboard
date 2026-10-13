/* Beta: 그래프 중심, 핵심 숫자만, AI 정리 문장 없음
   그래프는 마우스를 올리거나 누르면 그 점의 숫자(얼마 → 얼마)가 뜨고, 카드 아래 '숫자 보기'를 펼치면 근거 표 */
"use strict";
const card = (inner, cls = "") => `<div class="card ${cls}">${inner}</div>`;
// 인사이트 카드: 머리줄(오른쪽 '자세히'), 큰 숫자, 그래프, 펼치는 표
const icard = (meta, num, numCol, head, chart, { isNew = false, sub = "", link = "", more = "" } = {}) =>
  card(`<div class="meta"><span>${meta}${isNew ? '<span class="new" aria-label="새 소식"></span>' : ""}</span>${link ? `<a class="more" href="${link}">자세히 ›</a>` : ""}</div>
  <div class="big"><b style="color:${numCol}">${num}</b><span>${head}</span></div>${sub ? `<div class="sub">${sub}</div>` : ""}${chart}${more}`, "ic");
const moreLink = (menu, label) => `<div class="right"><a class="more" href="${href(menu, S.field, "detail")}">${label} ›</a></div>`;
const won = (v, cur = "KRW") => v == null ? "–" : cur === "KRW" ? `${nf(v)}원` : `${{ USD: "$", EUR: "€" }[cur] || ""}${nf(v, 2)}`;
const coCell = c => `<button type="button" class="co cob" data-co="${esc(c.id)}"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</button>`;
const capFn = v => v == null ? null : Math.abs(v) > MCAP ? null : v;

function todayRows(F){
  const mk = marketChg("KQ"), out = [];
  F.cos.filter(c => isKR(c) && c.quote).forEach(c => { const q = quoteToday(c); out.push({ c, q, chg: q.chg, cap: q.cap, rel: c.ticker.endsWith(".KS") || q.chg == null || mk.chg == null ? null : q.chg - mk.chg, live: q.live, ts: q.ts }); });
  return { rows: out, mk };
}
// 오늘 등락 한 회사의 숫자 확인 내용
const todayTip = (r, mk) => [r.c.name, `현재가\t${won(r.q.price, r.q.cur)}`, r.q.prev != null ? `전일 종가\t${won(r.q.prev, r.q.cur)}` : null, `등락\t${sgn(r.chg, 2)}`,
  r.c.ticker.endsWith(".KS") ? "코스피 상장 — 코스닥과 비교 안 함" : `코스닥\t${sgn(mk.chg, 2)}`, r.rel != null ? `시장 대비\t${sgn(r.rel, 2, "%p")}` : null];
const todayTable = (rows, mk) => tbl(["회사", "현재가", "전일 종가", "등락", "시장 대비", "시가총액"],
  rows.map(r => [coCell(r.c), won(r.q.price, r.q.cur), won(r.q.prev, r.q.cur), pct(r.chg, 2, 0), r.rel == null ? '<span class="dim">–</span>' : pct(r.rel, 2, 0, "%p"), big(r.cap)]),
  `시장 대비 = 등락 − 코스닥(${sgn(mk.chg, 2)}) · 코스피 상장사는 비교하지 않음`);
// 기업가치: 기존 화면 기업가치 표와 같은 계산(PSR = 시가총액 ÷ 최근 연간 매출, 비상장 = 같은 묶음 상장사 PSR 범위 × 매출)
function psrOf(c){
  const q = c.quote, a = c.annual, i = a?.years?.length ? a.years.length - 1 : -1, rev = i < 0 ? null : a.revenue?.[i];
  if (!q?.marketCap || !rev || rev <= 0 || (q.currency && a.currency && q.currency !== a.currency)) return null;
  return q.marketCap / rev;
}
function valRows(F){
  const g = F.g, segFor = c => g.segments?.find(x => x.members.includes(c.id));
  const latest = c => { const a = c.annual, i = a?.years?.length ? a.years.length - 1 : -1; return i < 0 ? {} : { rev: a.revenue?.[i], y: a.years[i], cur: a.currency }; };
  return F.cos.map(c => { const L = latest(c), q = c.quote || {};
    if (c.listed) return { c, L, q, psr: psrOf(c) };
    const peers = g.companies.filter(p => (p.listed ?? !!p.ticker) && segFor(p) === segFor(c)).map(psrOf).filter(v => v != null);
    return { c, L, est: true, lo: peers.length ? Math.min(...peers) : null, hi: peers.length ? Math.max(...peers) : null, n: peers.length }; });
}
// 재무: 한 해의 손익 숫자
function plAt(a, k){
  const rv = a.revenue?.[k], cs = a.costOfSales?.[k], op = a.operatingIncome?.[k], ni = a.netIncome?.[k];
  return { rv, cs, gp: rv != null && cs != null ? rv - cs : null, op, ni, opm: capFn(margin(op, rv)), gpm: capFn(margin(rv != null && cs != null ? rv - cs : null, rv)),
           g: k > 0 ? growth(rv, a.revenue[k - 1]) : null };
}

/* ---------- 회사 약식 PL (회사 이름을 누르면) ----------
   계산은 기존 화면 회사 팝업(openCo)과 같음: 연간 3개년 + 올해 누적(분기 자료가 있으면) + 3개년 평균(평균 금액끼리 나눈 %)
   AI 정리(성장 원인·동향)는 넣지 않음 */
const COMM_RE = /판매수수료|판매대행/;
const signedB = (v, cur) => v == null ? "–" : `<span class="${v < 0 ? "dn" : ""}">${big(v, cur)}</span>`;
const upPct = v => v == null || !isFinite(v) ? '<span class="dim">–</span>' : `<span class="${v > 0 ? "up" : v < 0 ? "dn" : ""}">${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(1)}%</span>`;
function coPL(c, F){
  const a = c.annual || {}, ys = a.years || [], n = ys.length, i = n - 1, cur = a.currency || "KRW";
  // 비교 평균: 기존 화면과 같이 건강기능식품 '브랜드사' 묶음(이 분야에 있는 회사). 묶음 회사가 없으면 이 분야 전체
  const brandSeg = (D.hff?.segments || []).find(x => x.key === "brand");
  let peers = F.cos.filter(x => brandSeg ? brandSeg.members.includes(x.id) : x.id !== c.id), avgLbl = `건기식 ${peers.length}사 평균`;
  if (!peers.length){ peers = F.cos.filter(x => (x.annual?.currency || "KRW") === "KRW" && x.annual?.revenue?.length); avgLbl = `${F.name} ${peers.length}사 평균`; }
  const lastOf = x => { const A = x.annual, k = (A?.years?.length || 0) - 1; if (k < 0) return {};
    const r = A.revenue?.[k], g = A.costOfSales?.[k] != null && r != null ? r - A.costOfSales[k] : null;
    return { gr: k > 0 ? growth(r, A.revenue?.[k - 1]) : null, gpm: margin(g, r), opm: margin(A.operatingIncome?.[k], r) }; };
  const me = lastOf(c), avgOf = k => mean(peers.map(x => lastOf(x)[k]).filter(v => v != null && Math.abs(v) < 1000));
  const q = c.quarterly; let qy = null, qLbl = "";
  if (q?.periods?.length){ const k = q.periods.length - 1, p = q.periods[k], j = q.periods.indexOf(`${+p.slice(0, 4) - 1}${p.slice(4)}`);
    qy = j < 0 ? null : growth(q.revenue[k], q.revenue[j]); qLbl = `${p.slice(2, 4)}.${p.slice(5)}Q`; }
  const pp = (v, b) => v == null || b == null ? "" : (() => { const d = v - b; return `<span class="${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "▲" : d < 0 ? "▼" : ""}${Math.abs(d).toFixed(1)}%p</span>`; })();
  const pctTxt = v => v == null ? "–" : `${v.toFixed(1)}%`;
  const kpi = (l, v, cmp) => `<div class="cp-kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="c">${cmp}</div></div>`;
  const rev = a.revenue?.[i];
  const kpis = [
    kpi(`${ys[i] || ""} 매출`, big(rev, cur), `성장률 ${upPct(me.gr)} · ${avgLbl} ${upPct(avgOf("gr"))}`),
    kpi("매출총이익률", pctTxt(me.gpm), `${avgLbl} ${pctTxt(avgOf("gpm"))} ${pp(me.gpm, avgOf("gpm"))}`),
    kpi("영업이익률", `<span class="${me.opm < 0 ? "dn" : ""}">${pctTxt(me.opm)}</span>`, `${avgLbl} ${pctTxt(avgOf("opm"))} ${pp(me.opm, avgOf("opm"))}`),
    kpi(qy == null ? "최근 분기 매출 YoY" : `${qLbl} 매출 YoY`, qy == null ? `<span class="dim" style="font-size:18px">${c.listed ? "분기 미수집" : "분기 미공시"}</span>` : upPct(qy), qy == null ? (c.listed ? "분기 실적은 핵심 경쟁사만" : "연간 실적만 공시") : "전년 같은 분기 대비"),
  ].join("");
  // 머리줄
  const Q = c.quote || {};
  const capTxt = c.listed && Q.marketCap ? `<span>시가총액 <b>${big(Q.marketCap, Q.currency || "KRW")}</b> <small>(${md(Q.asOf)})</small></span><span>1년 주가 ${upPct(Q.change1y)}</span>${Q.per ? `<span>PER ${Q.per.toFixed(1)}배</span>` : ""}` : "<span>비상장</span>";
  const lastDisc = (c.disclosures || [])[0];
  // 약식 손익
  const sgaAt = y => { const d = c.sga; if (!d?.years) return null; const k = d.years.indexOf(String(y)); if (k < 0) return null;
    const items = d.itemsYear === String(y) ? d.items : null;
    const comm = d.commission ? d.commission[k] : items ? items.filter(x => COMM_RE.test(x[0])).reduce((t, x) => t + x[1], 0) : null;
    return { tot: d.total[k], labor: d.labor[k], adpromo: d.adpromo[k], commission: comm, rnd: d.rnd[k] }; };
  const cols = ys.map((y, k) => { const r = a.revenue?.[k], cs = a.costOfSales?.[k], g = r != null && cs != null ? r - cs : null, o = a.operatingIncome?.[k], sg = sgaAt(y);
    return { h: `${y}`, y, rev: r, cogs: cs, gp: g, sga: sg?.tot ?? (g != null && o != null ? g - o : null), sg, op: o, ni: a.netIncome?.[k] }; });
  if (q?.periods?.length){ const last = q.periods.at(-1), yr = last.slice(0, 4), idx = q.periods.map((p, k) => p.startsWith(yr) ? k : -1).filter(k => k >= 0);
    if (yr > (ys.at(-1) || "") && idx.length){ const sum = key => idx.every(k => q[key]?.[k] != null) ? idx.reduce((t, k) => t + q[key][k], 0) : null;
      const r = sum("revenue"), cs = sum("costOfSales"), g = r != null && cs != null ? r - cs : null, o = sum("operatingIncome");
      cols.push({ h: `${yr} 누적<small>${idx.length}개 분기</small>`, y: `${yr} 누적`, ytd: true, rev: r, cogs: cs, gp: g, sga: g != null && o != null ? g - o : null, sg: null, op: o, ni: sum("netIncome") }); } }
  const annualCols = cols.filter(col => !col.ytd);
  const avg3 = fn => { const vs = annualCols.map(col => fn(col)).filter(v => v != null); return vs.length ? signedB(vs.reduce((t, x) => t + x, 0) / vs.length, cur) : "–"; };
  const row = (label, fn, cls = "") => `<tr class="${cls}"><td class="l">${label}</td>${cols.map(col => `<td>${signedB(fn(col), cur)}</td>`).join("")}<td class="avg">${avg3(fn)}</td></tr>`;
  const pctRow = fn => { const p = (v, b) => v == null || !b ? "–" : `(${(v / b * 100).toFixed(1)}%)`;
    const vs = annualCols.map(col => [fn(col), col.rev]).filter(([v, b]) => v != null && b);
    const av = vs.length ? p(vs.reduce((t, x) => t + x[0], 0) / vs.length, vs.reduce((t, x) => t + x[1], 0) / vs.length) : "–";
    return `<tr class="pct"><td class="l"></td>${cols.map(col => `<td>${p(fn(col), col.rev)}</td>`).join("")}<td class="avg">${av}</td></tr>`; };
  const pl = `<table class="cp-pl"><thead><tr><th style="text-align:left">${cur === "KRW" ? "억원" : cur}</th>${cols.map(col => `<th>${col.h}</th>`).join("")}<th class="avg">${annualCols.length}개년 평균</th></tr></thead><tbody>
    ${row("매출", col => col.rev, "key")}
    ${row("매출원가", col => col.cogs)}${pctRow(col => col.cogs)}
    ${row("매출총이익", col => col.gp, "key")}${pctRow(col => col.gp)}
    ${row("판관비", col => col.sga)}
    ${row("인건비", col => col.sg?.labor, "sub")}
    ${row("광고/판촉", col => col.sg?.adpromo, "sub")}
    ${row("판매수수료", col => col.sg?.commission || null, "sub")}
    ${row("연구개발비", col => col.sg?.rnd || null, "sub")}
    ${row("영업이익", col => col.op, "key")}${pctRow(col => col.op)}
  </tbody></table>`;
  // 추이 그래프: 매출 막대 + 영업이익률 (누르면 숫자)
  const tc = cols.filter(col => col.rev != null), unit = cur === "KRW" ? 1e8 : 1e6;
  const trend = tc.length >= 2 ? colChart(tc.map(col => +(col.rev / unit).toFixed(cur === "KRW" ? 0 : 1)), tc.map(col => col.y), {
    W: 920, H: 190, colors: tc.map(col => col.ytd ? "#B9C6DA" : c.color), hi: annualCols.length - 1,
    fmt: v => cur === "KRW" ? nf(v) : v.toFixed(1),
    subs: tc.map(col => { const m = margin(col.op, col.rev); return m == null || Math.abs(m) > MCAP ? "" : `이익률 ${m < 0 ? "−" : ""}${Math.abs(m).toFixed(1)}%`; }),
    tips: tc.map(col => { const k = annualCols.indexOf(col), pv = k > 0 ? annualCols[k - 1].rev : null;
      return [`${c.name} · ${col.y}`, `매출\t${big(col.rev, cur)}`, !col.ytd && pv ? `매출 성장률\t${sgn(growth(col.rev, pv))}` : null,
        `매출총이익\t${big(col.gp, cur)}`, `영업이익\t${big(col.op, cur)}`, margin(col.op, col.rev) != null ? `영업이익률\t${margin(col.op, col.rev).toFixed(1)}%` : null, `순이익\t${big(col.ni, cur)}`]; }) }) : "";
  // 부문(사업보고서 부문 정보가 있을 때)
  const sgm = (() => { const s2 = c.segment; if (!s2?.years) return ""; const k = s2.years.length - 1; if (s2.revenue[k] == null) return "";
    const ai = ys.indexOf(s2.years[k]), tot = ai >= 0 ? a.revenue?.[ai] : null, share = tot ? s2.revenue[k] / tot * 100 : null;
    const T0 = s2.revenue[k] / ((share || 100) / 100), others = s2.others || [];
    const bigO = others.filter(([, v]) => v / T0 >= .02).sort((p, q2) => q2[1] - p[1]), etc = others.filter(([, v]) => v / T0 < .02).reduce((t, [, v]) => t + (v || 0), 0);
    return `<div class="cp-seg"><span class="main">${esc(s2.name.replace("건강기능식품", "건기식"))} 부문 <b>${big(s2.revenue[k])}</b>${share == null ? "" : ` (${share.toFixed(0)}%)`} · 영업이익 ${signedB(s2.operatingIncome[k])}</span>${bigO.map(([nm, v]) => `<span>${esc(nm)} ${big(v)}</span>`).join("")}${etc ? `<span>기타 ${big(etc)}</span>` : ""}</div>`; })();
  // 최근 보도(수집 기사 그대로, AI 정리 아님)
  const news = (D.newsfx?.recent || []).filter(e => e.c === c.id && e.cat !== "market").slice(0, 5);
  return `<div class="cp-head" style="--cc:${c.color}"><div>
      <h2 id="coPopTitle"><i></i>${esc(c.name)}${c.listed ? "" : '<span class="tag">비상장</span>'}${c.fs === "OFS" ? '<span class="tag">별도</span>' : ""}</h2>
      <div class="cp-meta">${capTxt}${lastDisc ? `<span>최근 공시 <a href="${esc(lastDisc.url)}" target="_blank" rel="noopener">${esc(lastDisc.title)}</a> <small>${md(lastDisc.date)}</small></span>` : ""}</div>
    </div><button class="cp-x" type="button" data-close aria-label="닫기">✕</button></div>
    <div class="cp-kpis">${kpis}</div>${sgm}
    ${c.note ? `<p class="note" style="margin:-8px 0 16px">${esc(c.note)}</p>` : ""}
    ${trend ? `<div class="cp-sec"><h3>매출 추이 <small>${cur === "KRW" ? "억원" : cur + " 백만"} · 이익률 = 영업이익률 · 막대를 누르면 금액</small></h3>${trend}</div>` : ""}
    <div class="cp-sec"><h3>약식 손익계산서 <small>(%) = 매출 대비 · OpenDART ${a.basis === "OFS" || c.fs === "OFS" ? "별도" : "연결"}</small></h3><div class="cp-tw">${pl}</div></div>
    ${news.length ? `<div class="cp-sec"><h3>최근 보도 <small>최근 2주</small></h3>${news.map(e => `<a class="cp-n" href="${esc(e.url)}" target="_blank" rel="noopener"><span class="mu">${md(e.d)}</span><span class="tag">${esc(catName(e.cat))}</span><span>${esc(e.title)}</span></a>`).join("")}</div>` : ""}`;
}
function openCo(id){
  const F = fieldCtx(S.field), c = F.cos.find(x => x.id === id); if (!c) return;
  hideTip();
  const dlg = $("coPop"); $("coPopBody").innerHTML = coPL(c, F);
  if (!dlg.open) dlg.showModal(); dlg.scrollTop = 0;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-co]"); if (b){ e.preventDefault(); openCo(b.dataset.co); return; }
  const d = $("coPop"); if (d?.open && (e.target === d || e.target.closest("[data-close]"))) d.close();
});

function valCard(F){
  const rows = valRows(F), xv = v => v == null ? "–" : `${v.toFixed(2)}배`;
  const lst = rows.filter(r => !r.est && r.psr != null).sort((a, b) => b.psr - a.psr);
  const ref = id => [D.biz, D.hff, D.microbiome].flatMap(g => g?.companies || []).find(x => x.id === id);
  const sv = lst.map(r => r.psr).sort((a, b) => a - b), med = sv.length >= 3 ? (sv[(sv.length - 1) >> 1] + sv[sv.length >> 1]) / 2 : null;   // 3곳 이상일 때만
  const chart = barChart(lst.map(r => ({ label: r.c.name, color: r.c.color, v: r.psr,
    tip: [r.c.name, `PSR\t${xv(r.psr)}`, `시가총액\t${big(r.q.marketCap, r.q.currency || "KRW")}`, `매출 ${r.L.y}\t${big(r.L.rev, r.L.cur || "KRW")}`,
      r.q.per ? `PER\t${r.q.per.toFixed(1)}배` : null, r.q.pbr ? `PBR\t${r.q.pbr.toFixed(1)}배` : null, `1년 주가\t${sgn(r.q.change1y)}`] })), { W: 1200, row: 34, lab: 210, fmt: v => `${v.toFixed(2)}배`, valW: 90 });
  const body = rows.slice().sort((a, b) => (b.q?.marketCap ?? -1) - (a.q?.marketCap ?? -1)).map(r => {
    if (r.est){
      const v = r.lo == null || !r.L.rev ? "–" : r.lo === r.hi ? `약 ${big(r.L.rev * r.lo)}` : `${big(r.L.rev * r.lo)} ~ ${big(r.L.rev * r.hi)}`;
      const note = F.g.valuationNotes?.[r.c.id], rc = note && ref(note.ref);
      return [coCell(r.c), `<span class="est">추정</span> ${v}`, big(r.L.rev, r.L.cur || "KRW"), r.lo == null ? "–" : r.lo === r.hi ? `피어 ${xv(r.lo)}` : `피어 ${r.lo.toFixed(2)}~${xv(r.hi)}`, "–", "–", "–", "–", "–"].map((x, i) => i === 0 && rc?.quote?.marketCap ? `${x}<small>참고: ${esc(note.text)} ${big(rc.quote.marketCap)}</small>` : x);
    }
    return [coCell(r.c), big(r.q.marketCap, r.q.currency || "KRW"), big(r.L.rev, r.L.cur || "KRW"), xv(r.psr), r.q.per == null ? "–" : r.q.per.toFixed(1) + "배", r.q.pbr == null ? "–" : r.q.pbr.toFixed(1) + "배",
      pct(r.q.change1m, 1, 0), pct(r.q.change3m, 1, 0), pct(r.q.change1y, 1, 0)];
  });
  const t = tbl(["회사", "시가총액", "매출(최근 연간)", "PSR", "PER", "PBR", "1개월", "3개월", "1년"], body,
    "PSR = 시가총액 ÷ 최근 연간 매출(OpenDART) · PER·PBR = 시가총액 ÷ 최근 연간 순이익·자본총계 · 비상장 = 같은 묶음 상장사 PSR 범위 × 매출");
  return card(`<h2>기업가치<small>PSR = 시가총액 ÷ 매출 · 막대를 누르면 PER·PBR</small></h2>
    ${med != null ? `<div class="big1"><b>${xv(med)}</b><span>상장 ${lst.length}곳 PSR 중앙값</span></div>` : ""}
    ${lst.length ? chart : '<p class="empty">상장사 없음</p>'}${fold("q-val", "숫자 보기 · 시총·PSR·PER·PBR·수익률" + (rows.some(r => r.est) ? " · 비상장 추정" : ""), t)}`);
}

const SUM = {
  /* ---------- 인사이트 ---------- */
  async insight(F){
    const { rows, mk } = todayRows(F), avg = mean(rows.map(r => r.chg));
    const tsLive = rows.find(r => r.ts)?.ts;
    let c1 = "";
    if (rows.length){
      const d = avg != null && mk.chg != null ? avg - mk.chg : null;
      const verdict = d == null ? "" : d >= 1 ? "시장보다 강함" : d <= -1 ? "시장보다 약함" : "코스닥과 비슷";
      const rel = rows.filter(r => r.rel != null).sort((a, b) => b.rel - a.rel);
      c1 = icard(`오늘 주가 · 시장 대비(%p) · ${tsLive ? tsLive.slice(11, 16) : "종가 " + md(rows[0].c.quote?.asOf)}`, arrow(avg), colOf(avg), verdict,
        barChart(rel.map(r => ({ label: r.c.name, color: r.c.color, v: r.rel, tip: todayTip(r, mk) })), { W: 560, row: 30, lab: 130, valW: 56, fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}`, colorFn: v => v >= 1.5 ? UP : v <= -1.5 ? DN : "#A9B4C4" }),
        { isNew: !!tsLive, link: href("quotes", S.field), more: fold("in-today", "숫자 보기", todayTable(rows.slice().sort((a, b) => (b.chg ?? -99) - (a.chg ?? -99)), mk)) });
    }
    const { kept } = signalsOf(F);
    let c2;
    if (kept.length){
      const s = kept[0], c = F.cos.find(x => x.id === s.c), P = c.price || {}, cl = (P.close || []).slice(-40), ds = (P.dates || []).slice(-40), b = cl[0];
      const why = !s.why ? "사유 미확인" : s.why.type === "filing" ? "공시 뒤" : `${catName(s.why.cat)} 보도 뒤`;
      const cur = c.quote?.currency || "KRW";
      const sigTbl = tbl(["날짜", "회사", "주가 등락", "회사 고유 움직임<small>시장·분야 영향 뺀 값</small>", "평소 하루 변동폭", "거래량", "사유"],
        kept.map(k => { const x = F.cos.find(y => y.id === k.c);
          return [md(k.d), coCell(x), pct(k.ar, 1, 0), pct(k.idio, 1, 0), `±${k.sd.toFixed(1)}%`, k.vr ? `평소의 ${k.vr.toFixed(1)}배` : "–",
            !k.why ? '<span class="dim">미확인</span>' : `<a class="more" href="${esc(k.why.url || "#")}" target="_blank" rel="noopener">${k.why.type === "filing" ? "공시" : esc(catName(k.why.cat))} · ${esc(k.why.title.length > 26 ? k.why.title.slice(0, 25) + "…" : k.why.title)}</a>`]; }));
      c2 = icard(`평소와 다른 움직임 · 최근 2주${kept.length > 1 ? ` · 외 ${kept.length - 1}곳` : ""}`, arrow(s.idio), colOf(s.idio), esc(c.name),
        lineChart([{ name: c.name, color: c.color, raw: cl, vals: cl.map(x => x && b ? (x / b - 1) * 100 : null) }],
          { W: 560, H: 150, labels: false, xs: ds, tipFmt: (sr, i) => `${sr.name}\t${won(sr.raw[i], cur)}  ${sgn(sr.vals[i])}` }),
        { sub: `${md(s.d)} · 평소의 ${s.z.toFixed(1)}배 · ${why}`, link: href("quotes", S.field), more: fold("in-sig", `숫자 보기 · ${kept.length}곳`, sigTbl) });
    } else c2 = icard("평소와 다른 움직임 · 최근 2주", "없음", INK, "평소 변동폭 안에서 움직였습니다", "", { link: href("quotes", S.field) });
    const { wk, pw } = voiceOf(F), byC = {}, byP = {};
    wk.forEach(e => byC[e.c] = (byC[e.c] || 0) + 1); pw.forEach(e => byP[e.c] = (byP[e.c] || 0) + 1);
    const top = Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const wkList = wk.slice(0, 10).map(e => { const c = F.cos.find(x => x.id === e.c);
      return [md(e.d), coCell(c), esc(catName(e.cat)), `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>`]; });
    const c3 = icard("보도 · 최근 7일(같은 소식은 1건)", `${wk.length}건`, INK, wk.length > pw.length ? `지난 7일 ${pw.length}건보다 늘어남` : wk.length < pw.length ? `지난 7일 ${pw.length}건보다 줄어듦` : "지난 7일과 같음",
      top.length ? barChart(top.map(([id, n]) => { const c = F.cos.find(x => x.id === id); return { label: c.name, color: c.color, v: n, tip: [c.name, `최근 7일\t${n}건`, `그 전 7일\t${byP[id] || 0}건`] }; }), { W: 560, row: 30, lab: 130, valW: 50, fmt: v => `${v}건` }) : "",
      { isNew: wk.some(e => e.d === todayKST()), link: href("news", S.field), more: wkList.length ? fold("in-news", `기사 보기 · ${wk.length}건`, `<div class="wrapcells">${tbl(["날짜", "회사", "유형", "제목"], wkList)}</div>`) : "" });
    const fin = F.cos.filter(c => c.annual?.revenue?.length && (c.annual.currency || "KRW") === "KRW").map(c => { const a = c.annual, k = a.revenue.length - 1; return { c, v: a.revenue[k], y: a.years[k], p: plAt(a, k), py: a.years[k - 1], pv: a.revenue[k - 1] }; }).sort((a, b) => b.v - a.v);
    const c4 = fin.length ? icard(`실적 · ${fin[0].y} 매출(억원)`, `${eok(fin[0].v)}억`, INK, `1위 ${esc(fin[0].c.name)}`,
      barChart(fin.slice(0, 8).map(x => ({ label: x.c.name, color: x.c.color, v: x.v / 1e8,
        tip: [`${x.c.name} · ${x.y}`, `매출\t${big(x.v)}`, x.p.g != null ? `매출 성장률\t${sgn(x.p.g)}` : null, `영업이익\t${big(x.p.op)}${x.p.opm != null ? ` (${x.p.opm.toFixed(1)}%)` : ""}`] })), { W: 560, row: 30, lab: 120, valW: 70 }),
      { link: href("finance", S.field), more: fold("in-fin", "숫자 보기", tbl(["회사", `${fin[0].y} 매출`, "성장률", "영업이익", "영업이익률"],
        fin.map(x => [coCell(x.c), big(x.v), pct(x.p.g, 1, 0), big(x.p.op), x.p.opm == null ? '<span class="dim">–</span>' : `${x.p.opm.toFixed(1)}%`]), "OpenDART 사업보고서 · 연결 기준")) }) : "";
    const m = F.mk.kr, ser = m?.size?.series?.[0]?.points;
    let c5 = "";
    if (ser?.length){
      const v = ser.map(p => p[1]), g = growth(v.at(-1), v.at(-2)), u = m.size.unit ? ` ${m.size.unit}` : "";
      c5 = icard(`시장 · ${esc(m.size.series[0].name.split("(")[0].trim())} (${esc(m.size.unit || "")})`, pct(g, 1, 0).replace(/<[^>]+>/g, ""), colOf(g), `${esc(m.size.kpis?.[0]?.value || "")}`,
        colChart(v, ser.map(p => p[0]), { W: 560, H: 160, unit: u }), { link: href("market", S.field) });
    } else if (m?.size?.kpis?.length){
      c5 = icard(`시장 · ${esc(m.label || "")}`, esc(m.size.kpis[0].value), INK, esc(m.size.kpis[0].label), "", { sub: esc(m.size.kpis[0].sub || ""), link: href("market", S.field) });
    }
    return `<p class="hint">그래프를 누르면 그 지점의 숫자가 보입니다</p><div class="g2"><div class="col">${c1}${c2}${c3}</div><div class="col">${c4}${c5}</div></div>`;
  },

  /* ---------- 시세 ---------- */
  async quotes(F, ui){
    const per = ui.per || "1Y", N = { "1Y": 250, "3M": 63, "1M": 21 }[per], perL = { "1Y": "1년", "3M": "3개월", "1M": "1개월" }[per];
    const listed = F.cos.filter(c => c.listed && c.price?.close?.length > 20);
    const step = per === "1Y" ? 3 : 1;
    // 날짜 축: 모든 회사 거래일을 합친 최근 N일. 휴장일(해외사 등)은 직전 종가를 이어 씀
    const axis = [...new Set(listed.flatMap(c => c.price.dates))].sort().slice(-N);
    const keep = axis.map((_, i) => i % step === 0 || i === axis.length - 1);
    const xs = axis.filter((_, i) => keep[i]);
    const ser = listed.map(c => {
      const m = new Map(c.price.dates.map((d, i) => [d, c.price.close[i]])); let lastV = null;
      const before = c.price.dates.filter(d => d < axis[0]).at(-1); if (before) lastV = m.get(before);
      const cl = axis.map(d => (lastV = m.get(d) ?? lastV)), b = cl.find(x => x);
      const raw = cl.filter((_, i) => keep[i]);
      return { c, name: c.name, color: c.color, raw, vals: raw.map(x => x && b ? (x / b - 1) * 100 : null), all: cl.filter(x => x != null), b }; });
    const { rows, mk } = todayRows(F), tsLive = rows.find(r => r.ts)?.ts;
    const caps = rows.filter(r => r.cap).sort((a, b) => b.cap - a.cap);
    const seg = [["1Y", "1년"], ["3M", "3개월"], ["1M", "1개월"]].map(([k, l]) => `<button data-ui="per=${k}" aria-pressed="${k === per}">${l}</button>`).join("");
    const perTbl = tbl(["회사", `시작 <small>${md(axis[0])}</small>`, `현재 <small>${md(axis.at(-1))}</small>`, `${perL} 등락`, `${perL} 최고`, `${perL} 최저`, "52주 범위"],
      ser.filter(s => s.all.length).sort((a, b) => (b.vals.at(-1) ?? -1e9) - (a.vals.at(-1) ?? -1e9)).map(s => { const cur = s.c.quote?.currency || "KRW", q = s.c.quote || {};
        return [coCell(s.c), won(s.b, cur), won(s.all.at(-1), cur), pct(s.b ? (s.all.at(-1) / s.b - 1) * 100 : null, 1, 0), won(Math.max(...s.all), cur), won(Math.min(...s.all), cur),
          q.low52w != null ? `${won(q.low52w, cur)} ~ ${won(q.high52w, cur)}` : "–"]; }), "종가 기준 · 해외 상장사는 현지 통화");
    return `<div class="ph"><h1>시세</h1><span class="m">${tsLive ? `장중 ${tsLive.slice(11, 16)}(15~20분 지연)` : `종가 ${md(rows[0]?.c.quote?.asOf)}`} · 종가 확정 16:40 · KRX, Yahoo</span><span class="r"><span class="seg">${seg}</span></span></div>
      ${card(`<h2>${perL} 주가 흐름<small>시작일 = 0% · 그래프를 누르면 그날 종가</small></h2>${lineChart(ser, { W: 1200, H: 400, xs, tipFmt: (s, i) => `${s.name}\t${won(s.raw[i], s.c.quote?.currency || "KRW")}  ${sgn(s.vals[i])}` })}${fold("q-per", "숫자 보기 · 시작 → 현재 종가", perTbl)}`)}
      <div class="g2">${card(`<h2>오늘 등락<small>코스닥 ${pct(mk.chg, 2, null)}</small></h2>${barChart(rows.slice().sort((a, b) => (b.chg ?? -99) - (a.chg ?? -99)).map(r => ({ label: r.c.name, v: r.chg ?? 0, tip: todayTip(r, mk) })), { fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, colorFn: v => v > 0 ? UP : v < 0 ? DN : "#A9B4C4" })}
        ${fold("q-today", "숫자 보기 · 현재가·전일 종가", todayTable(rows.slice().sort((a, b) => (b.chg ?? -99) - (a.chg ?? -99)), mk))}`)}
      ${card(`<h2>시가총액<small>억원 · 국내 상장 ${caps.length}곳</small></h2>${barChart(caps.map(r => { const q = r.c.quote || {};
        return { label: r.c.name, color: r.c.color, v: r.cap / 1e8, tip: [r.c.name, `시가총액\t${big(r.cap)}`, `기준\t${r.live ? "장중 " + r.ts.slice(11, 16) : ymd(q.asOf)}`, q.per ? `PER\t${q.per.toFixed(1)}배` : null, q.pbr ? `PBR\t${q.pbr.toFixed(2)}배` : null] }; }))}`)}</div>
      ${valCard(F)}`;
  },

  /* ---------- 재무 ---------- */
  async finance(F, ui){
    const segs = F.g.segments || [], seg = ui.seg || segs[0]?.key || "all", met = ui.met || "rv";
    const MET = { rv: "매출", op: "영업이익", ni: "순이익" };
    const pick = seg === "all" || !segs.length ? F.cos : F.cos.filter(c => segs.find(s => s.key === seg)?.members.includes(c.id));
    const cos = pick.filter(c => c.annual?.revenue?.length).sort((a, b) => (b.annual.currency === "KRW") - (a.annual.currency === "KRW") || b.annual.revenue.at(-1) - a.annual.revenue.at(-1));
    const segBtn = segs.length ? `<span class="seg">${[...segs.map(s => [s.key, s.title]), ["all", "전체"]].map(([k, l]) => `<button data-ui="seg=${k}" aria-pressed="${k === seg}">${esc(l)}</button>`).join("")}</span>` : "";
    const metBtn = `<span class="seg">${Object.entries(MET).map(([k, l]) => `<button data-ui="met=${k}" aria-pressed="${k === met}">${l}</button>`).join("")}</span>`;
    const cards = cos.map(c => {
      const a = c.annual, cur = a.currency || "KRW", n = a.revenue.length, last = plAt(a, n - 1);
      const k0 = Math.max(0, n - 3), ks = [...Array(n - k0).keys()].map(j => k0 + j), ys = ks.map(k => a.years[k]), P = ks.map(k => plAt(a, k));
      const raw = P.map(p => p[met]), vals = raw.map(v => v == null ? null : cur === "KRW" ? Math.round(v / 1e8) : +(v / 1e6).toFixed(1));
      const unit = cur === "KRW" ? "억" : "M";
      const tips = ks.map((k, j) => { const p = P[j], pv = j ? P[j - 1][met] : k > 0 ? plAt(a, k - 1)[met] : null;
        return [`${c.name} · ${ys[j]}`, `${MET[met]}\t${big(p[met], cur)}`, pv != null && p[met] != null ? `${met === "rv" ? "매출 성장률" : "전년 대비"}\t${pv > 0 ? sgn(growth(p[met], pv)) : "전년 적자"}` : null,
          met !== "rv" ? `매출\t${big(p.rv, cur)}` : null, p.opm != null ? `영업이익률\t${p.opm.toFixed(1)}%` : null]; });
      const plTbl = tbl(["항목", ...ys], [
        ["매출", ...P.map(p => big(p.rv, cur))], ["매출 성장률", ...P.map((p, j) => pct(p.g, 1, 0))], ["매출원가", ...P.map(p => big(p.cs, cur))],
        ["매출총이익", ...P.map(p => big(p.gp, cur))], ["영업이익", ...P.map(p => big(p.op, cur))], ["영업이익률", ...P.map(p => p.opm == null ? "–" : `${p.opm.toFixed(1)}%`)],
        ["당기순이익", ...P.map(p => big(p.ni, cur))]], "", true);
      return card(`<button type="button" class="cob" data-co="${esc(c.id)}" style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}<span class="cob-h">약식 PL ›</span></button>
        <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 4px"><span style="font-size:28px;font-weight:700">${big(last[met], cur)}</span><span style="font-size:15px;color:${MU}">${ys.at(-1)} ${MET[met]}</span>${met === "rv" ? `<span style="font-size:17px;font-weight:700">${pct(last.g, 1, 0)}</span>` : ""}</div>
        ${colChart(vals, ys, { W: 360, H: 130, colors: vals.map((v, i) => v < 0 ? "#9DB5DD" : i === vals.length - 1 ? c.color : "#D5DCE7"), fmt: v => v == null ? "–" : cur === "KRW" ? nf(v) : (Math.abs(v) < 10 ? v.toFixed(1) : nf(v)) + "M", tips })}
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:15px;margin-top:6px;color:${MU}"><span>영업이익률</span><span>${P.map(p => { const v = margin(p.op, p.rv); return capFn(v) == null ? (v == null ? "–" : "매출 미미") : `<b style="color:${v < 0 ? DN : INK}">${v.toFixed(1)}%</b>`; }).join(" → ")}</span></div>
        ${fold("fin-" + c.id, "손익 숫자 보기", plTbl)}`);
    }).join("");
    const pts = cos.map(c => { const s = sgaOf(c), a = c.annual, n = a.revenue.length; if (!s?.mk || a.currency !== "KRW") return null;
      const g = growth(a.revenue[n - 1], a.revenue[n - 2]), om = margin(a.operatingIncome[n - 1], a.revenue[n - 1]);
      return g == null ? null : { label: c.name, color: c.color, x: s.mk, y: g, r: Math.max(8, Math.sqrt(a.revenue[n - 1] / 1e8) / 2.2), sub: om == null ? "" : `영업이익률 ${om.toFixed(1)}%`,
        tip: [`${c.name} · ${s.y}`, `매출\t${big(a.revenue[n - 1])}`, `매출 성장률\t${sgn(g)}`, `마케팅 강도\t${s.mk.toFixed(1)}%`, `광고·판촉비\t${big(s.adpromo)}`, `판매수수료\t${s.comm == null ? "계정 없음" : big(s.comm)}`, om == null ? null : `영업이익률\t${om.toFixed(1)}%`] }; }).filter(Boolean);
    const yr = cos[0]?.annual?.years?.at(-1) || "";
    return `<div class="ph"><h1>재무</h1><span class="m">${yr} 사업연도 · 연결 기준 · OpenDART · 막대를 누르면 금액</span><span class="r">${metBtn}${segBtn}</span></div>
      <div class="g3">${cards || '<div class="card empty">재무 데이터 없음</div>'}</div>
      ${pts.length >= 2 ? card(`<h2>성장 vs 마케팅 강도<small>${yr} · 원 크기 = 매출 · 원을 누르면 숫자</small></h2>${scatter(pts, { xl: "마케팅 강도 (광고·판촉 + 판매수수료) ÷ 매출 →", yl: "↑ 매출 성장률" })}`) : ""}
      ${moreLink("finance", "손익·판관비 표로 보기")}`;
  },

  /* ---------- 시장 ---------- */
  async market(F, ui){
    const reg = ui.reg || "kr", m = F.mk[reg] || {};
    const regBtn = `<span class="seg">${[["kr", "국내"], ["global", "해외"]].filter(([k]) => F.mk[k]).map(([k, l]) => `<button data-ui="reg=${k}" aria-pressed="${k === reg}">${l}</button>`).join("")}</span>`;
    const kp = (m.size?.kpis || []).slice(0, 3).map(k => card(`<div style="font-size:15px;color:${MU}">${esc(k.label)}</div><div style="font-size:30px;font-weight:700;margin:4px 0;letter-spacing:-.02em">${esc(k.value)}</div><div style="font-size:15px;font-weight:600;color:${/\+/.test(k.sub || "") ? UP : MU}">${esc(k.sub || "")}</div>`)).join("");
    const ser = m.size?.series?.[0];
    let trend = "";
    if (ser?.points?.length > 1){
      const v = ser.points.map(p => p[1]), u = m.size.unit ? ` ${m.size.unit}` : "";
      trend = card(`<h2>시장 규모 추이<small>${esc(m.size.unit || "")} · ${esc(ser.name)}</small></h2>${colChart(v, ser.points.map(p => p[0]), { H: 300, unit: u, subs: v.map((x, i) => i ? (() => { const g = growth(x, v[i - 1]); return `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(g).toFixed(1)}%`; })() : "") })}`);
    }
    const chs = m.channels?.items?.length ? card(`<h2>어디서 사나<small>${esc(m.channels.title || "")}</small></h2>${barChart(m.channels.items.slice().sort((a, b) => (/(기타|그 외|미공개)/.test(a[0])) - (/(기타|그 외|미공개)/.test(b[0])) || b[1] - a[1]).map(([n, v]) => ({ label: n.replace(/\(.*\)/, ""), color: /(기타|그 외|미공개)/.test(n) ? "#C3CEDF" : v > 50 ? "#2B5CA8" : "#7C97C2", v, tip: [n, `비중\t${v.toFixed(1)}%`] })), { row: 42, lab: 120, valW: 70, fmt: v => `${v.toFixed(1)}%` })}`) : "";
    const sh = m.share?.items?.length ? card(`<h2>무엇을 사나<small>${esc(m.share.title || "")}</small></h2><div style="display:flex;height:40px;border-radius:6px;overflow:hidden;font-size:15px;font-weight:700">${m.share.items.map((x, i) => `<span${tipA([x.name, `비중\t${x.pct}%`])} style="width:${x.pct}%;background:${["#A0522D", "#2B8A7E", "#D3DAE5"][i] || "#B4BFCF"};color:${i < 2 ? "#fff" : "#4A5568"};display:flex;align-items:center;padding:0 10px;white-space:nowrap;overflow:hidden">${esc(x.name.length > 22 ? x.name.slice(0, 20) + "…" : x.name)} ${x.pct}%</span>`).join("")}</div>`) : "";
    const pipe = !m.brands || m.brands.layout === "grouped" ? "" : card(`<h2>${esc(m.brands.title || "")}</h2><div style="display:flex;flex-direction:column">${m.brands.rows.slice(0, 7).map(r => `<div class="prow"><b>${esc(r[0])}</b><span>${esc(r[1])} <span class="mu">· ${esc(r[2])}</span></span><span style="text-align:right">${esc(r[3])}</span></div>`).join("")}</div>`);
    const upd = ser?.points?.length ? `${ser.points.at(-1)[0]}년 기준` : `${md(D.market?.updatedAt)} 정리`;
    return `<div class="ph"><h1>시장</h1><span class="m">${esc(m.label || F.name)} · ${upd}</span><span class="r">${regBtn}</span></div>
      ${kp ? `<div class="g3">${kp}</div>` : ""}${trend || chs ? `<div class="g2">${trend}${chs}</div>` : ""}${sh}${pipe}
      ${moreLink("market", "대표 브랜드 · 동향 · 출처")}`;
  },

  /* ---------- 공시·기사 ---------- */
  async news(F, ui){
    const W = D.newsfx?.weekly, ids = F.cos.map(c => c.id);
    const wk = W ? W.weeks.map((_, i) => ids.reduce((t, id) => t + (W.counts[id]?.[i] || 0), 0)) : [];
    const lab = W ? W.weeks.map((d, i) => i === W.weeks.length - 1 ? "이번 주" : md(d)) : [];
    const wTips = W ? W.weeks.map((d, i) => { const by = ids.map(id => [id, W.counts[id]?.[i] || 0]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      return [`${ymd(d)} 주`, `보도\t${wk[i]}건`, i ? `직전 주\t${wk[i - 1]}건` : null, ...by.map(([id, n]) => `${F.cos.find(c => c.id === id).name}\t${n}건`)]; }) : null;
    const { wk: w7 } = voiceOf(F), byCat = {};
    w7.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + 1);
    const cats = Object.entries(byCat).sort((a, b) => (a[0] === "etc") - (b[0] === "etc") || b[1] - a[1]);
    // 기사·공시 찾기: 최근 2주 보도(매시간) + 회사별 최근 기사·공시(하루 2회)를 합쳐 최신순
    const ACT = { product: "제품·브랜드", ir: "IR", finance: "자금조달" }, cn = k => ACT[k] || catName(k);
    const seen = new Set(), pool = [];
    const add = x => { const k = x.url || x.title; if (seen.has(k)) return; seen.add(k); pool.push(x); };
    (D.newsfx?.recent || []).filter(e => ids.includes(e.c)).forEach(e => add({ c: e.c, d: e.d, title: e.title, url: e.url, src: "기사", cat: e.cat, by: (e.media || [])[0] || "" }));
    F.cos.forEach(c => (c.activity || []).forEach(a => add({ c: c.id, d: a.date, title: a.title, url: a.url, src: a.src === "공시" ? "공시" : "기사", cat: a.cat, by: a.src === "공시" ? "DART" : a.by || "" })));
    (F.cos.flatMap(c => (c.disclosures || []).map(d => ({ c: c.id, d: d.date, title: d.title, url: d.url, src: "공시", cat: d.cat, by: "DART" })))).forEach(add);
    pool.sort((a, b) => b.d.localeCompare(a.d));
    const src = ui.src || "", co = ui.co || "", ty = ui.ty || "", by = ui.by || "", lim = +(ui.lim || 15);
    const f1 = pool.filter(x => (!src || x.src === src) && (!co || x.c === co));
    const types = [...new Set(f1.map(x => x.cat))].map(k => [k, cn(k), f1.filter(x => x.cat === k).length]).sort((a, b) => b[2] - a[2]);
    const meds = Object.entries(f1.filter(x => x.src === "기사" && x.by).reduce((o, x) => (o[x.by] = (o[x.by] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 30);
    const rows = f1.filter(x => (!ty || x.cat === ty) && (!by || x.by === by));
    const sel = (k, all, items, cur) => `<select data-uisel="${k}" aria-label="${all}"><option value="">${all}</option>${items.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const ctrl = `<div class="flt"><span class="seg">${[["", "전체"], ["기사", "기사"], ["공시", "공시"]].map(([k, l]) => `<button data-ui="src=${k}" aria-pressed="${k === src}">${l}</button>`).join("")}</span>
      ${sel("co", "전체 회사", F.cos.map(c => [c.id, c.name]), co)}${sel("ty", "전체 유형", types.map(([k, l, n]) => [k, `${l} ${n}`]), ty)}${src !== "공시" && meds.length ? sel("by", "전체 매체", meds.map(([m, n]) => [m, `${m} ${n}`]), by) : ""}</div>`;
    const list = rows.slice(0, lim).map(e => { const c = F.cos.find(x => x.id === e.c);
      return `<a href="${esc(e.url)}" target="_blank" rel="noopener" class="nrow">
        <span class="mu" style="font-size:15px">${md(e.d)}${(new Date(todayKST()) - new Date(e.d)) / 864e5 <= 2 ? '<span class="new"></span>' : ""}</span><span class="co"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</span>
        <span><span class="tag${e.src === "공시" ? " tg-d" : ""}" style="margin-right:8px">${e.src === "공시" ? "공시" : esc(cn(e.cat))}</span>${esc(e.title)}${e.by && e.src === "기사" ? ` <small class="mu">· ${esc(e.by)}</small>` : ""}</span></a>`; }).join("");
    return `<div class="ph"><h1>공시·기사</h1><span class="m">기사 ${D.newsfx?.updatedAt ? mdh(D.newsfx.updatedAt) : "–"} · 공시 ${D.meta?.updatedAt ? mdh(D.meta.updatedAt) : "–"}</span></div>
      <div class="g2">${card(`<h2>주별 보도 수<small>최근 12주 · 같은 소식은 1건 · 막대를 누르면 회사별</small></h2>${wk.length ? colChart(wk, lab, { H: 240, fmt: v => String(v), tips: wTips }) : '<p class="empty">집계 준비 중</p>'}`)}
      ${card(`<h2>최근 7일 보도 유형<small>${w7.length}건</small></h2>${cats.length ? barChart(cats.map(([k, n]) => ({ label: catName(k), color: k === "etc" ? "#C3CEDF" : "#2B5CA8", v: n, tip: [catName(k), `최근 7일\t${n}건`, ...Object.entries(w7.filter(e => e.cat === k).reduce((o, e) => (o[e.c] = (o[e.c] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, x]) => `${F.cos.find(c => c.id === id).name}\t${x}건`)] })), { row: 40, lab: 130, valW: 60, fmt: v => `${v}건` }) : '<p class="empty">최근 7일 보도 없음</p>'}`)}</div>
      ${card(`<h2>기사·공시 찾기<small>최신순 · ${rows.length}건 · 같은 링크는 1건</small></h2>${ctrl}${list || '<p class="empty">조건에 맞는 기사·공시 없음</p>'}
        ${rows.length > lim ? `<div style="text-align:center;padding:12px 0 2px"><button class="morebtn" data-ui="lim=${lim + 30}">30건 더 보기 (${rows.length - lim}건 남음)</button></div>` : ""}`)}`;
  },
};
start(SUM);
