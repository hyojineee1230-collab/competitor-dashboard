/* Beta: 그래프 중심, 핵심 숫자만, AI 정리 문장 없음
   그래프는 마우스를 올리거나 누르면 그 점의 숫자(얼마 → 얼마)가 뜨고, 카드 아래 '숫자 보기'를 펼치면 근거 표 */
"use strict";
const card = (inner, cls = "", attr = "") => `<div class="card ${cls}"${attr}>${inner}</div>`;
// 인사이트 카드: 머리줄(오른쪽 '자세히'), 큰 숫자, 그래프, 펼치는 표
const icard = (meta, num, numCol, head, chart, { isNew = false, sub = "", link = "", more = "", tool = "" } = {}) =>
  card(`<div class="meta"><span>${meta}${isNew ? '<span class="new" aria-label="새 소식"></span>' : ""}</span>${tool || link ? `<span class="mr">${tool}${link ? `<a class="more" href="${link}">자세히 ›</a>` : ""}</span>` : ""}</div>
  <div class="big"><b style="color:${numCol}">${num}</b><span>${head}</span></div>${sub ? `<div class="sub">${sub}</div>` : ""}${chart}${more}`, "ic");
const won = (v, cur = "KRW") => v == null ? "–" : cur === "KRW" ? `${nf(v)}원` : `${{ USD: "$", EUR: "€" }[cur] || ""}${nf(v, 2)}`;
const xaTag = c => c.noAvg ? `<span class="xa" title="평균·중앙값 계산에서 제외">평균 제외</span>` : "";
const coCell = c => `<button type="button" class="co cob" data-co="${esc(c.id)}"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</button>${xaTag(c)}`;
// 제목 옆 ⓘ: 표 아래 주석 대신 기준 설명을 마우스오버(모바일은 탭)로
const infoI = text => `<button type="button" class="ii" aria-label="기준 설명"${tipA(["기준", ...text.split(" · ")])}>i</button>`;
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
  if (!peers.length){ peers = F.cos.filter(x => !x.noAvg && (x.annual?.currency || "KRW") === "KRW" && x.annual?.revenue?.length); avgLbl = `${F.name} ${peers.length}사 평균`; }
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
    kpi(qy == null ? "최근 분기 매출 YoY" : `${qLbl} 매출 YoY`, qy == null ? `<span class="dim" style="font-size:18px">${c.listed ? "분기 미수집" : "분기 미공시"}</span>` : upPct(qy), qy == null ? (c.listed ? "분기 자료 없음" : "연간 실적만 공시") : "전년 같은 분기 대비"),
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
  const pctRow = (fn, cls = "") => { const p = (v, b) => v == null || !b ? "–" : `(${(v / b * 100).toFixed(1)}%)`;
    const vs = annualCols.map(col => [fn(col), col.rev]).filter(([v, b]) => v != null && b);
    const av = vs.length ? p(vs.reduce((t, x) => t + x[0], 0) / vs.length, vs.reduce((t, x) => t + x[1], 0) / vs.length) : "–";
    if (cols.every(col => fn(col) == null)) return "";   // 값이 하나도 없는 계정은 % 줄 생략
    return `<tr class="pct ${cls}"><td class="l"></td>${cols.map(col => `<td>${p(fn(col), col.rev)}</td>`).join("")}<td class="avg">${av}</td></tr>`; };
  const pl = `<table class="cp-pl"><thead><tr><th style="text-align:left">${cur === "KRW" ? "억원" : cur}</th>${cols.map(col => `<th>${col.h}</th>`).join("")}<th class="avg">${annualCols.length}개년 평균</th></tr></thead><tbody>
    ${row("매출", col => col.rev, "key")}
    ${row("매출원가", col => col.cogs)}${pctRow(col => col.cogs)}
    ${row("매출총이익", col => col.gp, "key")}${pctRow(col => col.gp)}
    ${row("판관비", col => col.sga)}${pctRow(col => col.sga)}
    ${row("인건비", col => col.sg?.labor, "sub")}${pctRow(col => col.sg?.labor, "sub")}
    ${row("광고/판촉", col => col.sg?.adpromo, "sub")}${pctRow(col => col.sg?.adpromo, "sub")}
    ${row("판매수수료", col => col.sg?.commission || null, "sub")}${pctRow(col => col.sg?.commission || null, "sub")}
    ${row("연구개발비", col => col.sg?.rnd || null, "sub")}${pctRow(col => col.sg?.rnd || null, "sub")}
    ${row("영업이익", col => col.op, "key")}${pctRow(col => col.op)}
  </tbody></table>`;
  // 비용 구조: 매출액 대비 원가·판관비 계정·영업이익 비중 (연도별 한 줄). 영업손실이면 비용이 100%를 넘음
  const CS = [["cogs", "매출원가", "#9AA8BD"], ["labor", "인건비", "#5B7DB1"], ["adpromo", "광고/판촉", "#D08A3C"], ["commission", "판매수수료", "#C46A6A"], ["rnd", "연구개발", "#7A5AD0"], ["etc", "기타 판관비", "#C9D2DE"], ["op", "영업이익", "#1F8A78"]];
  const costCols = annualCols.filter(col => col.rev > 0 && col.cogs != null && col.op != null).slice(-3);
  const struct = (() => { if (!costCols.length) return "";
    const parts = col => { const sg = col.sg, sga = col.rev - col.cogs - col.op, known = sg ? (sg.labor || 0) + (sg.adpromo || 0) + (sg.commission || 0) + (sg.rnd || 0) : 0;
      const v = { cogs: col.cogs, labor: sg?.labor || 0, adpromo: sg?.adpromo || 0, commission: sg?.commission || 0, rnd: sg?.rnd || 0, etc: sga - known, op: Math.max(col.op, 0) };
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x / col.rev * 100])); };
    const P = costCols.map(parts), cost = p => p.cogs + p.labor + p.adpromo + p.commission + p.rnd + p.etc;
    const scale = Math.min(300, Math.max(100, ...P.map(cost)));
    const rows = costCols.map((col, j) => { const p = P[j], tot = cost(p), loss = col.op < 0, D = Math.max(scale, tot, 100);
      const seg = CS.filter(([k]) => p[k] > 0.05).map(([k, l, clr]) => { const w = p[k] / D * 100;
        return `<i style="width:${w.toFixed(2)}%;background:${clr}"${tipA([`${c.name} · ${col.y}`, `${l}\t${big(k === "op" ? col.op : p[k] * col.rev / 100, cur)}`, `매출 대비\t${p[k].toFixed(1)}%`])}>${w >= 9 ? `${p[k].toFixed(0)}` : ""}</i>`; }).join("");
      return `<div class="cs-row"><span class="cs-y">${col.y}</span><span class="cs-bar${D > 100.5 ? " over" : ""}" style="--h:${(100 / D * 100).toFixed(2)}%">${seg}</span><b class="${loss ? "dn" : ""}">${(col.op / col.rev * 100).toFixed(1)}%</b></div>`; }).join("");
    const used = CS.filter(([k]) => P.some(p => p[k] > 0.05));
    return `<div class="cs"><div class="cs-row cs-h"><span></span><span></span><b>영업이익률</b></div>${rows}<div class="cs-lg">${used.map(([, l, clr]) => `<span><i style="background:${clr}"></i>${l}</span>`).join("")}${scale > 100 ? '<span class="mu">점선 = 매출액(100%)</span>' : ""}</div></div>`; })();
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
    ${struct ? `<div class="cp-sec"><h3>비용 구조 <small>매출액 대비 비중(%) · 판관비 계정은 사업보고서 주석 기준</small></h3>${struct}</div>` : ""}
    <div class="cp-sec"><h3 class="h3o">약식 손익계산서 <small>(%) = 매출 대비 · OpenDART${c.alt?.annual ? "" : a.basis === "OFS" || c.fs === "OFS" ? " 별도" : " 연결"}</small>${c.alt?.annual ? `<span class="seg cp-fs">${[[0, "연결"], [1, "별도"]].map(([k, l]) => `<button type="button" data-pofs="${k}" aria-pressed="${!!k === !!F.ofs}">${l}</button>`).join("")}</span>` : ""}</h3><div class="cp-tw">${pl}</div></div>
    ${news.length ? `<div class="cp-sec"><h3>최근 보도 <small>최근 2주</small></h3>${news.map(e => `<a class="cp-n" href="${esc(e.url)}" target="_blank" rel="noopener"><span class="mu">${md(e.d)}</span><span class="tag">${esc(catName(e.cat))}</span><span>${esc(e.title)}</span></a>`).join("")}</div>` : ""}`;
}
// ofs: 이 팝업에서만 쓰는 연결/별도(처음엔 화면 스위치를 따름). 회사·비교 평균 모두 같은 기준으로 다시 계산
function openCo(id, ofs = S.ofs){
  const F = { ...fieldCtx(S.field, ofs), ofs }, c = F.cos.find(x => x.id === id); if (!c) return;
  hideTip();
  const dlg = $("coPop"), keep = dlg.open && dlg.dataset.co === id ? dlg.scrollTop : 0;
  dlg.dataset.co = id; $("coPopBody").innerHTML = coPL(c, F);
  if (!dlg.open) dlg.showModal(); dlg.scrollTop = keep;
}
document.addEventListener("keydown", e => { const b = e.target.closest?.(".fcard[data-co]"); if (b && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); openCo(b.dataset.co); } });
document.addEventListener("click", e => {
  const t = e.target.closest("[data-pofs]"); if (t){ const d = $("coPop"); if (d?.dataset.co) openCo(d.dataset.co, t.dataset.pofs === "1"); return; }
  const b = e.target.closest("[data-co]:not(dialog)"); if (b && !e.target.closest("[data-tip]")){ e.preventDefault(); openCo(b.dataset.co); return; }
  const d = $("coPop"); if (d?.open && (e.target === d || e.target.closest("[data-close]"))) d.close();
});

// 넓은 화면: 왼쪽 그래프 · 오른쪽 표 (좁은 화면은 위아래)
const split = (left, right, cls = "") => `<div class="split ${cls}"><div class="sp-l">${left}</div><div class="sp-r">${right}</div></div>`;
// 회사별 누적 막대: rows [{label, parts:{key:값%}, end, tip}], segs [[key, 이름, 색]] — 막대 길이 = 합계(가장 큰 회사 기준)
function stackRows(rows, segs, { lab = 150, endFmt = v => `${v.toFixed(1)}%` } = {}){
  const max = Math.max(...rows.map(r => segs.reduce((t, [k]) => t + (r.parts[k] || 0), 0))) || 1;
  const body = rows.map(r => { let x = 0;
    const seg = segs.filter(([k]) => r.parts[k] > 0).map(([k, l, clr]) => { const w = r.parts[k] / max * 100, left = x; x += w;
      return `<i class="hb-b" style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%;background:${clr}"></i>`; }).join("");
    return `<div class="hb-r"${tipA(r.tip)}><span class="hb-l">${esc(r.label)}</span><span class="hb-t">${seg}<b class="hb-v" style="left:calc(${x.toFixed(2)}% + 7px)">${endFmt(r.end)}</b></span></div>`; }).join("");
  const used = segs.filter(([k]) => rows.some(r => r.parts[k] > 0));
  return `<div class="hb stk" style="--lab:${lab}px">${body}</div><div class="cs-lg" style="margin-left:0">${used.map(([, l, clr]) => `<span><i style="background:${clr}"></i>${l}</span>`).join("")}</div>`;
}

// 당일 시세: 등락·코스닥 대비·시가총액을 한 표에, 칸 안에 작은 막대
function dayCard(rows, mk, tsLive){
  if (!rows.length) return "";
  const srt = rows.slice().sort((a, b) => (b.chg ?? -99) - (a.chg ?? -99));
  const mxC = Math.max(...srt.map(r => Math.abs(r.chg ?? 0)), .5), mxM = Math.max(...srt.map(r => r.cap || 0), 1);
  const div = (v, mx, d = 2, suf = "%") => v == null ? '<span class="dim">–</span>' : `<span class="mb2"><span class="mbt"><i class="${v >= 0 ? "p" : "n"}" style="width:${(Math.abs(v) / mx * 50).toFixed(1)}%"></i></span><b class="${v > 0 ? "up" : v < 0 ? "dn" : ""}">${sgn(v, d, suf)}</b></span>`;
  const capC = r => r.cap ? `<span class="mb2"><span class="mbt cap"><i style="width:${(r.cap / mxM * 100).toFixed(1)}%;background:${r.c.color}"></i></span><b>${big(r.cap)}</b></span>` : "–";
  const body = srt.map(r => [coCell(r.c), won(r.q.price, r.q.cur), won(r.q.prev, r.q.cur), div(r.chg, mxC), r.rel == null ? '<span class="dim">–</span>' : sgn(r.rel, 2, "%p"), capC(r)]);
  const up = srt.filter(r => r.chg > 0).length, dn = srt.filter(r => r.chg < 0).length, avg = mean(srt.map(r => r.chg));
  return card(`<h2>당일 시세<small>${tsLive ? `장중 ${tsLive.slice(11, 16)} · 15~20분 지연` : `종가 ${md(srt[0].c.quote?.asOf)}`} · 코스닥 ${sgn(mk.chg, 2)}</small></h2>
    <div class="big1"><b class="${avg > 0 ? "up" : avg < 0 ? "dn" : ""}">${sgn(avg, 2)}</b><span>국내 상장 ${srt.length}개사 평균 등락률 · 상승 ${up}개사 · 하락 ${dn}개사</span></div>
    <div class="day-t">${tbl(["회사", "현재가", "전일 종가", "등락률", "코스닥 대비", "시가총액"], body, "코스닥 대비 = 등락률 − 코스닥 등락률 · 코스피 상장사는 비교하지 않음 · 시가총액 = 현재가 × 상장주식수")}</div>`);
}

function valCard(F){
  const rows = valRows(F), xv = v => v == null ? "–" : `${v.toFixed(2)}배`;
  const lst = rows.filter(r => !r.est && r.psr != null).sort((a, b) => b.psr - a.psr);
  const ref = id => [D.biz, D.hff, D.microbiome].flatMap(g => g?.companies || []).find(x => x.id === id);
  const sv = lst.filter(r => !r.c.noAvg).map(r => r.psr).sort((a, b) => a - b), med = sv.length >= 3 ? (sv[(sv.length - 1) >> 1] + sv[sv.length >> 1]) / 2 : null;   // 3곳 이상일 때만
  const chart = barChart(lst.map(r => ({ label: r.c.name, color: r.c.color, v: r.psr,
    tip: [r.c.name, `PSR\t${xv(r.psr)}`, `시가총액\t${big(r.q.marketCap, r.q.currency || "KRW")}`, `매출 ${r.L.y}\t${big(r.L.rev, r.L.cur || "KRW")}`,
      r.q.per ? `PER\t${r.q.per.toFixed(1)}배` : null, r.q.pbr ? `PBR\t${r.q.pbr.toFixed(1)}배` : null, `1개월 주가\t${sgn(r.q.change1m)}`, `3개월 주가\t${sgn(r.q.change3m)}`, `1년 주가\t${sgn(r.q.change1y)}`] })),
    { lab: 130, fmt: v => `${v.toFixed(2)}배`, dot: true, ref: med != null ? { v: med, label: `중앙값 ${xv(med)}` } : null });
  // 상장사만(그래프와 같은 회사). 비상장 추정 가치는 비교 상장사가 적으면 범위가 지나치게 넓어 표시하지 않음
  const body = lst.slice().sort((a, b) => (b.q?.marketCap ?? -1) - (a.q?.marketCap ?? -1)).map(r =>
    [coCell(r.c), big(r.q.marketCap, r.q.currency || "KRW"), big(r.L.rev, r.L.cur || "KRW"), xv(r.psr), r.q.per == null ? "–" : r.q.per.toFixed(1) + "배", r.q.pbr == null ? "–" : r.q.pbr.toFixed(1) + "배",
      pct(r.q.change1y, 1, 0)]);
  const t = tbl(["회사", "시가총액", "매출<small>최근 연간</small>", "PSR", "PER", "PBR", "1년 주가"], body,
    "");
  return card(`<h2 class="h2o">기업가치<small>상장 ${lst.length}개사</small>${infoI("PSR = 시가총액 ÷ 최근 연간 매출(OpenDART) · PER·PBR = 시가총액 ÷ 최근 연간 순이익·자본총계 · 비상장사는 시가총액이 없어 제외")}${ofsBtn()}</h2>
    ${split(`${med != null ? `<div class="big1"><b>${xv(med)}</b><span>PSR 중앙값</span></div>` : ""}${lst.length ? chart : '<p class="empty">상장사 없음</p>'}`, `<div class="val-t">${t}</div>`, "wide")}`, "valc");
}

/* ---------- 비중 도넛: items [{label, v(%), color, tip}] — 조각과 범례(이름·%) ---------- */
function donut(items, center = ""){
  const R0 = 70, C = 2 * Math.PI * R0, tot = items.reduce((t, x) => t + x.v, 0) || 1; let off = 0;
  const segs = items.map(x => { const len = x.v / tot * C, d = `<circle r="${R0}" cx="90" cy="90" fill="none" stroke="${x.color}" stroke-width="30" stroke-dasharray="${Math.max(len - 1.5, .5).toFixed(2)} ${(C - Math.max(len - 1.5, .5)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 90 90)"${tipA(x.tip || [x.label, `비중\t${x.v.toFixed(1)}%`])}/>`; off += len; return d; }).join("");
  const leg = items.map(x => `<div class="dnut-r"${tipA(x.tip || [x.label, `비중\t${x.v.toFixed(1)}%`])}><i style="background:${x.color}"></i><span>${esc(x.label)}</span><b>${x.v.toFixed(1)}%</b></div>`).join("");
  return `<div class="dnut"><svg viewBox="0 0 180 180" role="img" aria-label="비중 도넛">${segs}${center ? `<text x="90" y="90" dy=".35em" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">${esc(center)}</text>` : ""}</svg><div class="dnut-l">${leg}</div></div>`;
}

/* ---------- 연구개발 회수 (마이크로바이옴) ----------
   연구개발비 = 사업보고서 '연구개발비용' 표 합계(원가 처리분 포함, c.rnd), 없으면 판관비 주석 연구개발비(c.sga.rnd)
   회수율 = 3개년 누적 매출총이익 ÷ 3개년 누적 연구개발비 · 회수기간 = 3개년 누적 연구개발비 ÷ 최근 연간 매출총이익
   회사 단위 지표 — 파이프라인별 투입·회수는 공시 숫자가 없어 계산하지 않음 */
function rndOf(c){
  const a = c.annual; if (!a?.years?.length || (a.currency || "KRW") !== "KRW") return null;
  const src = c.rnd?.amount?.length ? { ys: c.rnd.years, v: c.rnd.amount, s: "연구개발비용 표", link: c.rnd.links } : c.sga?.rnd?.some(x => x) ? { ys: c.sga.years, v: c.sga.rnd, s: "판관비 주석", link: c.sga.links } : null;
  if (!src) return null;
  const rows = src.ys.map((y, k) => { const i = a.years.indexOf(String(y)); if (i < 0 || !src.v[k]) return null;
    const rv = a.revenue?.[i], gp = rv != null && a.costOfSales?.[i] != null ? rv - a.costOfSales[i] : null;
    return { y: String(y), rnd: src.v[k], rv, gp, op: a.operatingIncome?.[i] }; }).filter(Boolean).slice(-3);
  if (!rows.length) return null;
  const L = rows.at(-1), sum = k => rows.every(r => r[k] != null) ? rows.reduce((t, r) => t + r[k], 0) : null;
  const cr = sum("rnd"), cg = sum("gp");
  return { c, rows, L, n: rows.length, cr, cg, ratio: margin(L.rnd, L.rv), rec: cg == null || !cr ? null : cg / cr * 100,
           pay: L.gp > 0 && cr ? cr / L.gp : null, src: src.s, link: src.link?.[L.y] };
}
function rndCard(cos){
  const R = cos.map(rndOf).filter(Boolean); if (!R.length) return "";
  const yr = R.map(r => r.L.y).sort().at(-1);
  const srt = R.slice().sort((a, b) => (b.rec ?? -1e9) - (a.rec ?? -1e9)), rmx = Math.max(...srt.map(r => r.rec || 0), 1);
  const pctC = v => v == null ? "–" : v > 999 ? '<span class="dim">매출 미미</span>' : `${v.toFixed(0)}%`;
  const payTxt = r => r.pay != null ? `${r.pay < 10 ? r.pay.toFixed(1) : nf(r.pay)}년` : `<span class="dn">${r.L.gp == null ? "–" : "매출총손실"}</span>`;
  const recC = r => r.rec == null ? "–" : `<span class="ib2"${tipA([`${r.c.name} · ${r.rows[0].y}~${r.L.y}`, ...r.rows.map(x => `${x.y} 연구개발비\t${big(x.rnd)}`), `누적 매출총이익\t${big(r.cg)}`, `회수율\t${r.rec.toFixed(0)}%`])}><i style="--f:${(Math.max(0, r.rec) / rmx).toFixed(3)};background:${r.c.color}"></i><b>${r.rec.toFixed(0)}%</b></span>`;
  const rndC = r => r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(r.src)} 원문">${big(r.L.rnd)} ↗</a>` : big(r.L.rnd);
  const body = srt.map(r => [coCell(r.c) + (r.L.y !== yr || r.n < 3 ? `<small>${r.L.y !== yr ? `${r.L.y}년` : ""}${r.L.y !== yr && r.n < 3 ? " · " : ""}${r.n < 3 ? `누적 ${r.n}개년` : ""}</small>` : ""),
    rndC(r), pctC(r.ratio), big(r.cr), signedB(r.cg), recC(r), payTxt(r), signedB(r.L.op)]);
  const srtA = srt.filter(r => !r.c.noAvg);
  if (srtA.length >= 2){ const av = k => mean(srtA.map(r => r[k]).filter(v => v != null)), ar = av("rec"), ap = mean(srtA.map(r => r.pay).filter(v => v != null));
    const row = [`<b>비교 평균</b><small>${srtA.length}개사</small>`, "", "", "", "", `<b>${ar == null ? "–" : `${ar.toFixed(0)}%`}</b>`, `<b>${ap == null ? "–" : `${ap < 10 ? ap.toFixed(1) : nf(ap)}년`}</b>`, ""]; row.cls = "avg"; body.push(row); }
  const foot = `OpenDART ${basisLbl()} · 누적 = 최근 3개 사업연도 · 회수율 = 누적 매출총이익 ÷ 누적 연구개발비 · 회수기간 = 누적 연구개발비 ÷ 최근 연간 매출총이익 · 연구개발비는 사업보고서 연구개발비용 표(원가 처리분 포함), 없으면 판관비 주석 · 회사 단위 지표`;
  const t = tbl(["회사", "연구개발비", "매출 대비", "누적 연구개발비", "누적 매출총이익", "회수율", "회수기간", "영업이익"], body);
  return card(`<h2>연구개발 투자 회수<small>${yr} 사업연도 기준</small>${infoI(foot)}</h2><div class="hmt adt rdt">${t}</div>`);
}

/* ---------- 판관비: 계정 × 회사 히트맵 ----------
   사업보고서 판관비 주석의 계정을 8개 묶음으로 모아 매출액 대비 비중(%)으로 비교. 셀을 누르면 구성 계정·3개년·회사 비교
   계정 목록이 없는 해(주석 미분리)는 인건비·광고·수수료·연구개발 묶음 값만 쓰고 나머지는 기타 */
const SGA_G = [
  ["labor", "인건비", /급여|상여|퇴직|복리후생|인건비|임원|잡급|주식보상|주식기준/],
  ["ad", "광고선전·판촉", /광고|판매촉진|판촉|견본|홍보|마케팅|시용|샘플/],
  ["fee", "판매·지급수수료", /수수료|판매대행/],
  ["rnd", "연구개발", /연구|개발비|경상개발/],
  ["logi", "운반·포장·수출", /운반|포장|수출|물류|보관|배송|창고|운송|운임/],
  ["dep", "상각비", /^(?!.*대손).*상각/],
  ["rent", "임차·관리", /임차|임대|건물관리|관리비|수도광열|전력|수선|보험|통신/],
  ["etc", "기타", null]];
const SGA_CAT = { labor: "labor", adpromo: "ad", commission: "fee", rnd: "rnd" };
function sgaGroups(c){
  const d = c.sga; if (!d?.years?.length) return null;
  const i = d.total.map((v, k) => v ? k : -1).filter(k => k >= 0).at(-1); if (i == null || i < 0) return null;
  const y = d.years[i], items = d.itemsYear === y ? d.items || [] : [], g = {}, it = {};
  SGA_G.forEach(([k]) => { g[k] = 0; it[k] = []; });
  if (items.length){
    items.forEach(([nm, v, cat]) => { const hit = SGA_G.find(([, , re]) => re && re.test(nm)), k = v < 0 ? "etc" : hit ? hit[0] : SGA_CAT[cat] || "etc"; g[k] += v || 0; it[k].push([nm, v]); });
    const diff = d.total[i] - items.reduce((t, x) => t + (x[1] || 0), 0); if (Math.abs(diff) > d.total[i] * .005){ g.etc += diff; it.etc.push(["주석 합계와의 차이", diff]); }
  } else {
    g.labor = d.labor?.[i] || 0; g.ad = d.adpromo?.[i] || 0; g.fee = d.commission?.[i] || 0; g.rnd = d.rnd?.[i] || 0;
    ["logi", "dep", "rent"].forEach(k => g[k] = null); g.etc = d.total[i] - g.labor - g.ad - g.fee - g.rnd;
  }
  const a = c.annual, ak = a?.years?.indexOf(y) ?? -1, rev = ak >= 0 ? a.revenue?.[ak] : d.revenue?.[i];
  const gp = ak >= 0 && a.costOfSales?.[ak] != null && rev != null ? rev - a.costOfSales[ak] : null;
  return { c, y, rev, gp, op: ak >= 0 ? a.operatingIncome?.[ak] : null, g: ak > 0 ? growth(rev, a.revenue[ak - 1]) : null, tot: d.total[i], grp: g, it, partial: !items.length, link: d.links?.[y], d, i };
}
const sgaRows = cos => cos.filter(c => (c.annual?.currency || "KRW") === "KRW").map(sgaGroups).filter(x => x?.rev > 0);
// 열 안 최솟값~최댓값을 연한 하늘색 → 진한 남색으로(진한 칸은 흰 글씨)
const HM_LO = [241, 245, 251], HM_HI = [24, 66, 140];
const heat = (v, lo, hi) => { if (v == null || hi == null) return "";
  const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : .5, e = Math.pow(t, .85), c = HM_LO.map((a, i) => Math.round(a + (HM_HI[i] - a) * e));
  return `background:rgb(${c.join(",")});color:${e > .62 ? "#fff" : "var(--ink)"}`; };
let SGA_IDS = null;
function sgaCard(cos){
  const rows = sgaRows(cos); if (!rows.length) return "";
  SGA_IDS = rows.map(x => x.c.id);
  const yc = {}; rows.forEach(x => yc[x.y] = (yc[x.y] || 0) + 1);
  const main = Object.keys(yc).sort((a, b) => yc[b] - yc[a])[0];
  const cols = [["tot", "판관비 합계"], ...SGA_G.map(([k, l]) => [k, l])];
  const pv = (x, k) => { const v = k === "tot" ? x.tot : x.grp[k]; return v == null ? null : margin(v, x.rev); };
  const srt = rows.slice().sort((a, b) => (a.c.noAvg - b.c.noAvg) || pv(b, "tot") - pv(a, "tot"));   // 평균 제외 회사는 평균 행 바로 위
  const inA = srt.filter(x => !x.c.noAvg);
  const lo = {}, hi = {}, avg = {}; cols.forEach(([k]) => { const vs = inA.map(x => pv(x, k)).filter(v => v != null && Math.abs(v) < MCAP); lo[k] = vs.length ? Math.min(...vs) : null; hi[k] = vs.length ? Math.max(...vs) : null; avg[k] = vs.length ? mean(vs) : null; });
  const cellOf = (x, k) => { const v = pv(x, k);
    if (v == null) return '<span class="dim">–</span>';
    if (Math.abs(v) >= MCAP) return '<span class="dim">매출 미미</span>';
    return `<button type="button" class="hm" data-sga="${esc(x.c.id)}|${k}" style="${heat(v, lo[k], hi[k])}"${k === "tot" ? ' data-b="1"' : ""}>${v.toFixed(1)}%</button>`; };
  const body = srt.map(x => [coCell(x.c) + (x.y !== main ? `<small>${x.y}년</small>` : ""), ...cols.map(([k]) => cellOf(x, k))]);
  if (inA.length >= 2){ const r = [`<b>비교 평균</b><small>${inA.length}개사</small>`, ...cols.map(([k]) => avg[k] == null ? "–" : `<b>${avg[k].toFixed(1)}%</b>`)]; r.cls = "avg"; body.push(r); }
  const part = rows.filter(x => x.partial).map(x => x.c.name);
  const foot = `${main}년 사업보고서 판관비 주석 · OpenDART ${basisLbl()} · 셀 = 매출액 대비 비중, 색은 계정마다 가장 낮은 회사(연함) ~ 가장 높은 회사(진함)${part.length ? ` · ${part.join("·")}: 계정 목록 미공시로 일부 묶음만` : ""}`;
  const t = tbl(["회사", ...cols.map(([, l]) => l)], body);
  return card(`<h2>판관비 세부<small>${main} 사업연도 · 계정별 매출액 대비 비중</small>${infoI(foot)}</h2><div class="hmt">${t}</div>`);
}
// 셀 상세 팝업: 구성 계정 · 3개년 · 같은 계정 회사 비교
function openSga(id, key){
  const F = fieldCtx(S.field), all = sgaRows(F.cos.filter(c => !SGA_IDS || SGA_IDS.includes(c.id))), x = all.find(r => r.c.id === id); if (!x) return;
  const lab = key === "tot" ? "판매비와 관리비" : SGA_G.find(g => g[0] === key)[1];
  const amt = key === "tot" ? x.tot : x.grp[key], r1 = v => v == null ? "–" : `${v.toFixed(1)}%`;
  const peers = all.map(r => ({ r, v: key === "tot" ? margin(r.tot, r.rev) : r.grp[key] == null ? null : margin(r.grp[key], r.rev) })).filter(p => p.v != null && Math.abs(p.v) < MCAP);
  const avP = peers.filter(p => !p.r.c.noAvg), av = avP.length >= 2 ? mean(avP.map(p => p.v)) : null;
  const kpi = (l, v) => `<div class="cp-kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const kpis = kpi(`${x.y} 금액`, big(amt)) + kpi("매출액 대비", r1(margin(amt, x.rev))) + (key === "tot" ? kpi("매출 대비 광고선전·판촉", r1(margin(x.grp.ad, x.rev))) : kpi("판관비 대비", r1(margin(amt, x.tot)))) + kpi(`비교 평균 <small>${avP.length}개사 · 매출액 대비</small>`, r1(av));
  // 구성: 합계면 묶음별, 묶음이면 계정별
  const comp = key === "tot" ? SGA_G.filter(([k]) => x.grp[k]).map(([k, l]) => [l, x.grp[k]]) : (x.it[key] || []).slice().sort((a, b) => b[1] - a[1]);
  const compT = comp.length ? tbl(["계정", "금액", "매출액 대비", "판관비 대비"], comp.map(([nm, v]) => [esc(nm), big(v), r1(margin(v, x.rev)), r1(margin(v, x.tot))]), "", true)
    : `<p class="note">${x.partial ? "계정 목록이 공시되지 않은 해 — 묶음 합계만 있음" : "해당 계정 없음"}</p>`;
  // 3개년: 수집 묶음(인건비·광고·수수료·연구개발·합계)이 있을 때
  const ser = { tot: x.d.total, labor: x.d.labor, ad: x.d.adpromo, fee: x.d.commission, rnd: x.d.rnd }[key], a = x.c.annual;
  const yrs = ser ? x.d.years.map((y, k) => { const ak = a.years.indexOf(y), rv = ak >= 0 ? a.revenue[ak] : x.d.revenue?.[k]; return [y, ser[k], rv]; }).filter(r => r[1]) : [];
  const trendT = yrs.length >= 2 ? `<div class="cp-sec"><h3>3개년 추이</h3>${tbl(["연도", "금액", "전년 대비", "매출액 대비"], yrs.map(([y, v, rv], j) => [y, big(v), j ? upPct(growth(v, yrs[j - 1][1])) : "–", r1(margin(v, rv))]), "", true)}</div>` : "";
  const cmp = peers.length >= 2 ? `<div class="cp-sec"><h3>회사 비교 <small>매출액 대비 · ${x.y} 전후 사업연도</small></h3>${barChart(peers.sort((p, q) => q.v - p.v).map(p => ({ label: p.r.c.name, color: p.r.c.id === id ? p.r.c.color : "#C3CEDF", v: p.v, tip: [p.r.c.name, `${lab}\t${big(key === "tot" ? p.r.tot : p.r.grp[key])}`, `매출액 대비\t${r1(p.v)}`] })), { lab: 120, fmt: v => `${v.toFixed(1)}%`, ref: av == null ? null : { v: av, label: `평균 ${av.toFixed(1)}%` } })}</div>` : "";
  $("coPopBody").innerHTML = `<div class="cp-head" style="--cc:${x.c.color}"><div><h2 id="coPopTitle"><i></i>${esc(x.c.name)} · ${esc(lab)}</h2>
      <div class="cp-meta"><span>${x.y} 사업연도 · OpenDART ${basisLbl()} 판관비 주석</span>${x.link ? `<span><a href="${esc(x.link)}" target="_blank" rel="noopener">원문 ↗</a></span>` : ""}</div></div>
      <button class="cp-x" type="button" data-close aria-label="닫기" autofocus>✕</button></div>
    <div class="cp-kpis">${kpis}</div>
    <div class="cp-sec"><h3>구성 계정 <small>${x.y}</small></h3><div class="cp-tw">${compT}</div></div>${trendT}${cmp}`;
  hideTip(); const dlg = $("coPop"); if (!dlg.open) dlg.showModal(); dlg.scrollTop = 0; dlg.querySelector(".cp-x")?.focus();
}
document.addEventListener("click", e => { const b = e.target.closest("[data-sga]"); if (!b) return; e.preventDefault(); const [id, k] = b.dataset.sga.split("|"); openSga(id, k); });

/* ---------- 광고비 효율 (회사 단위 연간) ----------
   매출총이익 ÷ 광고선전·판촉비, 매출 ÷ 광고선전·판촉비. '수수료 포함'은 판매·지급수수료를 더한 마케팅비 기준
   광고선전·판촉비가 매출의 1% 미만인 회사(주로 ODM)는 비교에서 제외 */
function adCard(cos, ui){
  const fee = ui.adb === "fee", rows = sgaRows(cos);
  const all = rows.map(x => { const sp = (x.grp.ad || 0) + (fee ? (x.grp.fee || 0) : 0);
    return { ...x, sp, adr: margin(x.grp.ad, x.rev), spr: margin(sp, x.rev), gpx: x.gp != null && sp > 0 ? x.gp / sp : null, rvx: sp > 0 ? x.rev / sp : null, opm: capFn(margin(x.op, x.rev)) }; });
  const R = all.filter(x => x.adr != null && x.adr >= 1 && x.gpx != null).sort((a, b) => b.gpx - a.gpx), out = all.filter(x => !R.includes(x));
  if (R.length < 2) return "";
  const yc = {}; R.forEach(x => yc[x.y] = (yc[x.y] || 0) + 1); const main = Object.keys(yc).sort((a, b) => yc[b] - yc[a])[0];
  const SP = fee ? "광고·판촉 + 수수료" : "광고선전·판촉비", av = k => mean(R.filter(x => !x.c.noAvg).map(x => x[k]).filter(v => v != null));
  const ag = av("gpx");
  const btn = `<span class="seg">${[["ad", "광고선전·판촉"], ["fee", "수수료 포함"]].map(([k, l]) => `<button data-ui="adb=${k}" aria-pressed="${(fee ? "fee" : "ad") === k}">${l}</button>`).join("")}</span>`;
  const x1 = v => v == null ? "–" : `${v.toFixed(1)}배`, gmx = Math.max(...R.map(x => x.gpx));
  const body = R.map(x => [coCell(x.c) + (x.y !== main ? `<small>${x.y}년</small>` : ""), big(x.rev), `${big(x.sp)} <small class="in">${x.spr.toFixed(1)}%</small>`, x1(x.rvx), `<span class="ib2"${tipA([`${x.c.name} · ${x.y}`, `매출총이익\t${big(x.gp)}`, `${SP}\t${big(x.sp)}`, `평균\t${x1(ag)}`])}><i style="--f:${(Math.max(0, x.gpx) / gmx).toFixed(3)};background:${x.c.color}"></i><b>${x1(x.gpx)}</b></span>`, upPct(x.g), x.opm == null ? "–" : `<span class="${x.opm < 0 ? "dn" : ""}">${x.opm.toFixed(1)}%</span>`]);
  const ar = [`<b>비교 평균</b><small>${R.filter(x => !x.c.noAvg).length}개사</small>`, "", `<b>${av("spr").toFixed(1)}%</b>`, `<b>${x1(av("rvx"))}</b>`, `<b>${x1(ag)}</b>`, `<b>${upPct(av("g"))}</b>`, `<b>${av("opm")?.toFixed(1) ?? "–"}%</b>`]; ar.cls = "avg"; body.push(ar);
  const foot = `OpenDART ${basisLbl()} · 판관비 주석 · 광고선전·판촉비 = 광고선전비·판매촉진비·견본비 등${fee ? " · 마케팅비 = 광고선전·판촉비 + 판매수수료·지급수수료" : ""} · 회사 전체 연간 값(캠페인·채널 단위 아님)${out.length ? ` · 제외: 광고선전·판촉비 매출 1% 미만 ${out.map(x => x.c.name).join("·")}` : ""}`;
  const t = tbl(["회사", "매출", `${fee ? "마케팅비" : "광고·판촉비"}<small>매출 대비</small>`, `매출 ÷ ${fee ? "마케팅비" : "광고비"}`, `매출총이익 ÷ ${fee ? "마케팅비" : "광고비"}`, "매출 성장률", "영업이익률"], body);
  return card(`<h2 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">광고비 효율<small>${main} 사업연도 · 배 = 매출총이익 또는 매출 ÷ ${SP}</small>${infoI(foot)}<span style="margin-left:auto">${btn}</span></h2>
    <div class="hmt adt">${t}</div>`);
}

/* ---------- 최근 공시/기사 (기존 화면 '최근 공시/기사'와 같은 구성: 정기보고서 표 · IR · 기사 목록) ---------- */
let NEWSCLS = null;
async function newsCls(){
  if (NEWSCLS) return NEWSCLS;
  const [nc, mdj] = await Promise.all([getJSON("news_cats", CONF), getJSON("media", CONF)]);
  const norm = t => String(t || "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  const tierOf = new Map(), alias = mdj?.aliases || {};
  (mdj?.tiers || []).forEach(t => t.members.forEach(m => tierOf.set(norm(m), t.key)));
  const cats = (nc?.cats || []).map(c => ({ ...c, re: new RegExp(c.pattern, "i") }));
  return NEWSCLS = {
    cats: [...cats.map(c => [c.key, c.name]), ["etc", "기타"]],
    tiers: [...(mdj?.tiers || []).map(t => [t.key, t.name]), ["etc", "기타(미분류)"]],
    cat: title => (cats.find(c => c.re.test(title)) || { key: "etc" }).key,
    tier: by => tierOf.get(norm(alias[by] || by)) || "etc",
    name: by => alias[by] || by,
  };
}
const discCatOf = d => d.cat || (/사업보고서|반기보고서|분기보고서|감사보고서/.test(d.title) ? "report" : /IR|기업설명회/.test(d.title) ? "ir" : null);
function periodOf(d){
  const m = d.title.match(/\((\d{4})\.(\d{2})\)/); if (!m) return null;
  let q = /반기/.test(d.title) ? 2 : /사업보고서|감사보고서/.test(d.title) ? 4 : Math.ceil(+m[2] / 3);
  if (/분기/.test(d.title) && (q === 2 || q === 4)) q = +m[2] <= 4 ? 1 : 3;   // 결산월이 다른 회사 보정
  return { year: +m[1], q };
}
async function discPanel(F, ui){
  const cat = ui.dc || "report", co = ui.co || "", lim = +(ui.lim || 15), today = new Date(todayKST());
  const pool = F.cos.filter(c => c.disclosures?.length || (c.activity || []).some(x => x.src === "뉴스"));
  const pick = pool.filter(c => !co || c.id === co);
  const isNew = d => (today - new Date(d)) / 864e5 <= 3 ? '<span class="tag new-t">NEW</span>' : "";
  const sel = (k, all, items, cur) => `<select data-uisel="${k}" aria-label="${all}"><option value="">${all}</option>${items.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const segs = `<span class="seg">${[["report", "정기보고서"], ["ir", "IR"], ["news", "기사"]].map(([k, l]) => `<button data-ui="dc=${k}" aria-pressed="${k === cat}">${l}</button>`).join("")}</span>`;
  let ctrl = segs + sel("co", "전체 회사", pool.map(c => [c.id, c.name]), co), body = "", hint = "";
  if (cat === "report"){
    const Q = { 1: "1Q", 2: "2Q", 3: "3Q", 4: "연간" };
    const byCo = pick.map(c => { const cells = {};
      (c.disclosures || []).filter(d => discCatOf(d) === "report").forEach(d => { const p = periodOf(d); if (!p) return; const k = `${p.year}-${p.q}`; if (!cells[k] || cells[k].date < d.date) cells[k] = d; });
      return { c, cells }; });
    const years = [...new Set(byCo.flatMap(x => Object.keys(x.cells).map(k => +k.split("-")[0])))].sort((a, b) => b - a).slice(0, 4);
    const yr = years.includes(+ui.yr) ? +ui.yr : years[0];
    if (years.length) ctrl += `<span class="seg">${years.map(y => `<button data-ui="yr=${y}" aria-pressed="${y === yr}">${y}년</button>`).join("")}</span>`;
    body = years.length ? `<div class="tw keep"><table class="dgrid"><thead><tr><th>회사</th>${[1, 2, 3, 4].map(q => `<th>${Q[q]}</th>`).join("")}</tr></thead><tbody>${byCo.map(({ c, cells }) =>
      `<tr><td>${coCell(c)}</td>${[1, 2, 3, 4].map(q => { const d = cells[`${yr}-${q}`];
        return d ? `<td><a class="chip" href="${esc(d.url)}" target="_blank" rel="noopener" title="${esc(d.title)} · 접수 ${d.date}">${Q[q]} ↗ <small>${md(d.date)}</small></a>${isNew(d.date)}</td>` : '<td class="dim">–</td>'; }).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="empty">정기보고서 없음</p>';
    hint = `${yr ?? ""}년 정기보고서 ${byCo.reduce((n, x) => n + Object.keys(x.cells).filter(k => k.startsWith(yr + "-")).length, 0)}건 · 누르면 DART 원문`;
  } else {
    const isNews = cat === "news", K = isNews ? await newsCls() : null, ty = ui.ty || "", tr = ui.tr || "";
    if (isNews) ctrl += sel("ty", "전체 유형", K.cats, ty) + sel("tr", "전체 매체", K.tiers, tr);
    const rows = pick.flatMap(c => isNews
        ? (c.activity || []).filter(x => x.src === "뉴스").map(x => ({ ...x, c, nc: K.cat(x.title), tier: K.tier(x.by) }))
        : (c.disclosures || []).filter(d => discCatOf(d) === "ir").map(d => ({ ...d, c })))
      .filter(d => !isNews || ((!ty || d.nc === ty) && (!tr || d.tier === tr)))
      .sort((a, b) => b.date.localeCompare(a.date) || F.cos.indexOf(a.c) - F.cos.indexOf(b.c));
    const cn = isNews ? Object.fromEntries(K.cats) : {}, tn = isNews ? Object.fromEntries(K.tiers) : {};
    body = tbl([isNews ? "보도일" : "접수일", "회사", ...(isNews ? ["매체", "유형"] : []), isNews ? "기사" : "공시명"],
      rows.slice(0, lim).map(d => [`${d.date.slice(2).replace(/-/g, ".")}${isNew(d.date)}`, coCell(d.c),
        ...(isNews ? [`<b>${esc(K.name(d.by || ""))}</b><small>${esc(tn[d.tier] || "")}</small>`, `<span class="tag">${esc(cn[d.nc] || "기타")}</span>`] : []),
        `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a>`]));
    if (!rows.length) body = `<p class="empty">${isNews ? (ty || tr ? "조건에 맞는 기사 없음" : "수집된 기사 없음") : "최근 3년 IR 공시 없음"}</p>`;
    if (rows.length > lim) body += `<div style="text-align:center;padding:12px 0 2px"><button class="morebtn" data-ui="lim=${lim + 30}">더 보기 (${rows.length - lim}건 남음)</button></div>`;
    hint = isNews ? `최근 9개월 기사 ${rows.length}건` : `IR · 최근 3년 ${rows.length}건`;
  }
  return card(`<h2>최근 공시/기사<small>${hint}</small></h2><div class="flt">${ctrl}</div><div class="wrapcells disc">${body}</div>`, "", ) ;
}

const SUM = {
  /* ---------- 인사이트 ---------- */
  async insight(F){
    GROW = {};
    const { rows, mk } = todayRows(F);
    const tsLive = rows.find(r => r.ts)?.ts;
    let c1 = "";
    if (rows.length){
      // 큰 숫자 = 코스닥 상장사 평균 등락 − 코스닥 등락(%p). 막대와 같은 기준(코스피 상장사 제외)
      const rel = rows.filter(r => r.rel != null).sort((a, b) => b.rel - a.rel);
      const relA = rel.filter(r => !r.c.noAvg);   // 평균은 평균 제외 회사(신약 등)를 빼고, 막대는 모두 표시
      const avgQ = mean(relA.map(r => r.chg)), d = avgQ != null && mk.chg != null ? avgQ - mk.chg : null, avgAll = mean(rows.filter(r => !r.c.noAvg).map(r => r.chg));
      const verdict = d == null ? "코스닥 지수 미수집" : d >= 1 ? "코스닥 대비 강세" : d <= -1 ? "코스닥 대비 약세" : "코스닥과 유사";
      const sub = d == null ? `평균 등락 ${sgn(avgAll)}` : `${relA.length === 1 ? `${relA[0].c.name} ${sgn(relA[0].chg)}` : `코스닥 상장 ${relA.length}개사 평균 등락 ${sgn(avgQ)}`} · 코스닥 ${sgn(mk.chg)}${relA.length < rel.length ? ` · ${rel.filter(r => r.c.noAvg).map(r => r.c.name).join("·")} 평균 제외` : ""}`;
      c1 = icard(`당일 주가 · 코스닥 대비(%p) · ${tsLive ? tsLive.slice(11, 16) : "종가 " + md(rows[0].c.quote?.asOf)}`, d == null ? arrow(avgAll) : sgn(d, 1, "%p"), colOf(d ?? avgAll), verdict,
        barChart(rel.map(r => ({ label: r.c.name, color: r.c.color, v: r.rel, tip: todayTip(r, mk) })), { W: 560, row: 30, lab: 130, valW: 56, fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}`, colorFn: v => v >= 1.5 ? UP : v <= -1.5 ? DN : "#A9B4C4" }),
        { isNew: !!tsLive, sub, link: href("quotes", S.field), more: fold("in-today", "숫자 보기", todayTable(rows.slice().sort((a, b) => (b.chg ?? -99) - (a.chg ?? -99)), mk)) });
    }
    const { kept } = signalsOf(F);
    let c2;
    if (kept.length){
      // 판정: 시장·업종 영향을 뺀 회사 고유 등락이 최근 60거래일 하루 변동폭(표준편차)의 2배 이상이거나, 거래량이 평소의 3배 이상
      // 회사마다 두 줄: ① 회사 · 등락 · 날짜 · 변동 배수 ② 같은 날 전후 공시·보도 제목 전체(없으면 없음)
      const gap = k => { if (!k.why?.d) return ""; const n = Math.round((new Date(k.d) - new Date(k.why.d)) / 864e5); return n <= 0 ? "같은 날" : `${n}일 전`; };
      const whyTag = k => !k.why ? "" : k.why.type === "filing" ? "공시" : `${catName(k.why.cat)} 보도`;
      const whyLink = k => !k.why ? `<span class="dim">확인된 공시·보도 없음</span>` : `<a class="more" href="${esc(k.why.url || "#")}" target="_blank" rel="noopener">${esc(k.why.title)}</a>`;
      const rowsH = kept.slice(0, 4).map(k => { const x = F.cos.find(y => y.id === k.c);
        return `<div class="sg-r"><div class="sg-h"><button type="button" class="co cob" data-co="${esc(x.id)}"><i class="dot" style="background:${x.color}"></i>${esc(x.name)}</button>
            <b style="color:${colOf(k.idio)}">${arrow(k.idio)}</b><span class="mu">${md(k.d)}</span>
            <span class="sg-m"${tipA([`${x.name} · ${md(k.d)}`, `고유 등락률\t${sgn(k.idio)}`, `실제 등락률\t${sgn(k.ar)}`, `평소 하루 변동폭\t±${k.sd.toFixed(1)}%`, `변동 배수\t${k.z.toFixed(1)}배`, k.vr ? `거래량\t평소의 ${k.vr.toFixed(1)}배` : null])}>평소의 ${k.z.toFixed(1)}배${k.vr ? ` · 거래량 ${k.vr.toFixed(1)}배` : ""}</span></div>
          <div class="sg-w">${k.why ? `<span class="tag">${esc(gap(k))} ${esc(whyTag(k))}</span>` : ""}${whyLink(k)}</div></div>`; }).join("");
      // 아래 그래프: 해당 회사들의 최근 40거래일 주가(시작일 = 0%), 열 끝 맞춤에 쓰는 늘림 그래프
      const sers = kept.slice(0, 4).map(k => { const x = F.cos.find(y => y.id === k.c), P = x.price || {}, cl = (P.close || []).slice(-40), b0 = cl.find(v => v);
        return { name: x.name, color: x.color, raw: cl, ds: (P.dates || []).slice(-40), vals: cl.map(v => v && b0 ? (v / b0 - 1) * 100 : null), cur: x.quote?.currency || "KRW" }; }).filter(x => x.raw.length > 5);
      const sigChart = sers.length ? (GROW.sig = H => lineChart(sers, { W: 560, H, labels: sers.length > 1, xs: sers[0].ds,
        tipFmt: (sr, i) => `${sr.name}\t${won(sr.raw[i], sr.cur)}  ${sgn(sr.vals[i])}` }), `<p class="sg-c">최근 40거래일 주가 · 시작일 = 0%</p><div data-grow="sig" data-h0="130">${GROW.sig(130)}</div>`) : "";
      const sigTbl = tbl(["일자", "회사", "고유 등락률", "변동 배수", "관련 공시·보도"],
        kept.map(k => { const x = F.cos.find(y => y.id === k.c);
          return [md(k.d), coCell(x), pct(k.idio, 1, 0), `${k.z.toFixed(1)}배<small>±${k.sd.toFixed(1)}%</small>`, whyLink(k)]; }));
      c2 = icard(`이례적 주가 변동 · 최근 2주${infoI("고유 등락률 = 시장·업종 영향을 제외한 등락률 · 평소의 n배 = 고유 등락률 ÷ 최근 60거래일 하루 변동폭(표준편차) · 판정 = 2배 이상 또는 거래량 평소의 3배 이상 · 공시·보도 = 직전 거래일 ~ 등락일(당일 장 마감 뒤 보도 제외), 공시 우선")}`,
        `${kept.length}개사`, INK, "평소 변동폭을 벗어난 등락", `<div class="sg-l">${rowsH}</div>${sigChart}`,
        { link: href("quotes", S.field), more: kept.length > 4 ? fold("in-sig", `전체 · ${kept.length}개사`, `<div class="wrapcells sig-t">${sigTbl}</div>`) : "" });
    } else c2 = icard("이례적 주가 변동 · 최근 2주", "없음", INK, "평소 변동폭 범위 내 등락", "", { link: href("quotes", S.field) });
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
      { tool: ofsBtn(), link: href("finance", S.field), more: fold("in-fin", "숫자 보기", tbl(["회사", `${fin[0].y} 매출`, "성장률", "영업이익", "영업이익률"],
        fin.map(x => [coCell(x.c), big(x.v), pct(x.p.g, 1, 0), big(x.p.op), x.p.opm == null ? '<span class="dim">–</span>' : `${x.p.opm.toFixed(1)}%`]), `OpenDART 사업보고서 · ${basisLbl()} 기준`)) }) : "";
    const m = F.mk.kr, ser = m?.size?.series?.[0]?.points;
    let c5 = "";
    if (ser?.length){
      const v = ser.map(p => p[1]), g = growth(v.at(-1), v.at(-2)), u = m.size.unit ? ` ${m.size.unit}` : "";
      c5 = icard(`시장 · ${esc(m.size.series[0].name.split("(")[0].trim())} (${esc(m.size.unit || "")})`, pct(g, 1, 0).replace(/<[^>]+>/g, ""), colOf(g), `${esc(m.size.kpis?.[0]?.value || "")}`,
        (GROW.mkt = H => colChart(v, ser.map(p => p[0]), { W: 560, H, unit: u }), `<div data-grow="mkt" data-h0="160">${GROW.mkt(160)}</div>`), { link: href("market", S.field) });
    } else if (m?.size?.kpis?.length){
      c5 = icard(`시장 · ${esc(m.label || "")}`, esc(m.size.kpis[0].value), INK, esc(m.size.kpis[0].label), "", { sub: esc(m.size.kpis[0].sub || ""), link: href("market", S.field) });
    }
    return `<div class="g2 home"><div class="col">${c1}${c2}</div><div class="col">${c4}${c5}${c3}</div></div>`;
  },

  /* ---------- 시세 ---------- */
  async quotes(F, ui){
    // 기간(증권 화면 관례): 1주·1개월·3개월·연초 이후·1년, 기본 1년. 1일은 아래 '당일 시세' 카드
    const RNG = [["1W", "1주", 5], ["1M", "1개월", 21], ["3M", "3개월", 63], ["YTD", "연초 이후", null], ["1Y", "1년", 250]];
    const per = RNG.some(r => r[0] === ui.per) ? ui.per : "1Y", [, perL] = RNG.find(r => r[0] === per);
    const listed = F.cos.filter(c => c.listed && c.price?.close?.length > 20);
    const step = per === "1Y" ? 3 : 1;
    // 날짜 축: 모든 회사 거래일을 합친 최근 N일. 휴장일(해외사 등)은 직전 종가를 이어 씀
    // 연초 이후 = 전년 마지막 거래일 종가를 0%로(올해 거래일 + 1일)
    const allD = [...new Set(listed.flatMap(c => c.price.dates))].sort();
    const N = per === "YTD" ? allD.filter(d => d >= `${(allD.at(-1) || "").slice(0, 4)}-01-01`).length + 1 : RNG.find(r => r[0] === per)[2] + 1;
    const axis = allD.slice(-N);
    const keep = axis.map((_, i) => i % step === 0 || i === axis.length - 1);
    const xs = axis.filter((_, i) => keep[i]);
    const ser = listed.map(c => {
      const m = new Map(c.price.dates.map((d, i) => [d, c.price.close[i]])); let lastV = null;
      const before = c.price.dates.filter(d => d < axis[0]).at(-1); if (before) lastV = m.get(before);
      const cl = axis.map(d => (lastV = m.get(d) ?? lastV)), b = cl.find(x => x);
      const raw = cl.filter((_, i) => keep[i]);
      return { c, name: c.name, color: c.color, raw, vals: raw.map(x => x && b ? (x / b - 1) * 100 : null), all: cl.filter(x => x != null), b }; });
    const { rows, mk } = todayRows(F), tsLive = rows.find(r => r.ts)?.ts;
    const seg = RNG.map(([k, l]) => `<button data-ui="per=${k}" aria-pressed="${k === per}">${l}</button>`).join("");
    const perTbl = tbl(["회사", `시작 <small>${md(axis[0])}</small>`, `현재 <small>${md(axis.at(-1))}</small>`, `${perL} 등락`, `${perL} 최고`, `${perL} 최저`, "52주 범위"],
      ser.filter(s => s.all.length).sort((a, b) => (b.vals.at(-1) ?? -1e9) - (a.vals.at(-1) ?? -1e9)).map(s => { const cur = s.c.quote?.currency || "KRW", q = s.c.quote || {};
        return [coCell(s.c), won(s.b, cur), won(s.all.at(-1), cur), pct(s.b ? (s.all.at(-1) / s.b - 1) * 100 : null, 1, 0), won(Math.max(...s.all), cur), won(Math.min(...s.all), cur),
          q.low52w != null ? `${won(q.low52w, cur)} ~ ${won(q.high52w, cur)}` : "–"]; }), "종가 기준 · 해외 상장사는 현지 통화");
    return `<div class="ph"><h1>시세</h1><span class="m">${tsLive ? `장중 ${tsLive.slice(11, 16)}` : `종가 ${md(rows[0]?.c.quote?.asOf)}`}${infoI(`${tsLive ? "장중 시세 = Yahoo 지연 시세(15~20분)" : "종가 = KRX"} · KRX 종가는 다음 영업일 08:30 반영 · 해외 상장사는 Yahoo`)}</span><span class="r"><span class="seg">${seg}</span></span></div>
      ${card(`<h2>${perL} 주가 흐름<small>시작일 = 0% · 그래프를 누르면 그날 종가</small></h2>${lineChart(ser, { W: 1200, H: 400, xs, tipFmt: (s, i) => `${s.name}\t${won(s.raw[i], s.c.quote?.currency || "KRW")}  ${sgn(s.vals[i])}` })}${fold("q-per", "숫자 보기 · 시작 → 현재 종가", perTbl)}`)}
      ${dayCard(rows, mk, tsLive)}
      ${valCard(F)}`;
  },

  /* ---------- 재무 ---------- */
  async finance(F, ui){
    // 경쟁사 묶음: 설정(segments)이 없고 국내·해외가 섞인 분야는 국내/해외로 나눔
    const domestic = c => (c.country || (isKR(c) ? "KR" : "")) === "KR", kr = F.cos.filter(domestic), ov = F.cos.filter(c => !domestic(c));
    const segs = F.g.segments?.length ? F.g.segments : kr.length && ov.length ? [{ key: "kr", title: "국내", members: kr.map(c => c.id) }, { key: "global", title: "해외", members: ov.map(c => c.id) }] : [];
    const seg = ui.seg || segs[0]?.key || "all", met = ["rv", "gp", "op"].includes(ui.met) ? ui.met : "rv";
    const hasQ = F.cos.some(c => c.quarterly?.periods?.length), per = hasQ && ui.per === "q" ? "q" : "a";
    const MET = { rv: "매출", gp: "매출총이익", op: "영업이익" }, METB = { rv: "매출", gp: "매출총이익(%)", op: "영업이익(%)" };
    // 매출총이익·영업이익 모드: 금액 옆에 매출액 대비 이익률, 아래 줄은 같은 이익률의 연도별 추이
    const RATE = { rv: "영업이익률", gp: "매출총이익률", op: "영업이익률" }[met];
    const rateTxt = v => `<b style="color:${v < 0 ? DN : INK}">${v.toFixed(1)}%</b>`;
    const rateCell = (num, rv) => { const v = margin(num, rv); return v == null ? "–" : capFn(v) == null ? "매출 미미" : rateTxt(v); };
    const rateNum = (num, rv) => { const v = capFn(margin(num, rv)); return v == null ? "" : `<span style="font-size:15px;color:${MU};white-space:nowrap">이익률 <b style="font-size:17px;color:${v < 0 ? DN : INK}">${v.toFixed(1)}%</b></span>`; };
    const pick = seg === "all" || !segs.length ? F.cos : F.cos.filter(c => segs.find(s => s.key === seg)?.members.includes(c.id));
    const cos = pick.filter(c => c.annual?.revenue?.length).sort((a, b) => (b.annual.currency === "KRW") - (a.annual.currency === "KRW") || b.annual.revenue.at(-1) - a.annual.revenue.at(-1));
    const segBtn = segs.length ? `<select class="pick" data-uisel="seg" aria-label="경쟁사 묶음">${[...segs.map(s => [s.key, s.title]), ["all", "전체"]].map(([k, l]) => `<option value="${k}"${k === seg ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>` : "";
    const perBtn = hasQ ? `<select class="pick" data-uisel="per" aria-label="기간"><option value="a"${per === "a" ? " selected" : ""}>연간</option><option value="q"${per === "q" ? " selected" : ""}>분기</option></select>` : "";
    const metBtn = `<span class="seg">${Object.entries(METB).map(([k, l]) => `<button data-ui="met=${k}" aria-pressed="${k === met}">${l}</button>`).join("")}</span>`;
    // 비교 평균: 화면에 표시된 회사의 이익률 단순평균(매출 미미 제외, 연간 2개사·분기 3개사 이상일 때만)
    const avgOf = vs => { const v = vs.map(capFn).filter(x => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; };
    const AVG = {}, AVN = {};
    const avgCos = cos.filter(c => !c.noAvg);
    if (per === "q"){ const by = {}; avgCos.forEach(c => { const q = c.quarterly; (q?.periods || []).forEach((p, k) => {
        const num = met === "gp" ? (q.revenue?.[k] != null && q.costOfSales?.[k] != null ? q.revenue[k] - q.costOfSales[k] : null) : q.operatingIncome?.[k];
        const v = margin(num, q.revenue?.[k]); if (v != null) (by[p] = by[p] || []).push(v); }); });
      Object.entries(by).forEach(([p, vs]) => { const v = vs.map(capFn).filter(x => x != null); if (v.length >= 3){ AVG[p] = avgOf(vs); AVN[p] = v.length; } }); }
    else { const by = {}; avgCos.forEach(c => { const a = c.annual; a.years.forEach((y, k) => { const p = plAt(a, k), v = margin(met === "gp" ? p.gp : p.op, p.rv); if (v != null) (by[y] = by[y] || []).push(v); }); });
      Object.entries(by).forEach(([y, vs]) => { const v = vs.map(capFn).filter(x => x != null); if (v.length >= 2){ AVG[y] = avgOf(vs); AVN[y] = v.length; } }); }
    const avgLine = keys => keys.some(k => AVG[k] != null) ? `<div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;margin-top:3px;color:${MU}"><span title="표시된 회사 ${RATE} 단순평균(매출 미미${cos.some(c => c.noAvg) ? `·${cos.filter(c => c.noAvg).map(c => c.name).join("·")}` : ""} 제외)">비교 평균</span><span>${keys.map(k => AVG[k] == null ? "–" : `${AVG[k].toFixed(1)}%`).join(" → ")}</span></div>` : "";
    const avgTip = k => AVG[k] == null ? null : `비교 평균 ${RATE}\t${AVG[k].toFixed(1)}% (${AVN[k]}개사)`;
    // 분기: 연간 카드와 같은 회사·같은 순서. 분기 자료가 없는 회사는 카드 자리만 두고 비움
    const qCard = c => {
      const q = c.quarterly, head = `<div style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}${xaTag(c)}</div>`;
      if (!q?.periods?.length) return card(`${head}<div class="qempty">${c.listed ? "분기 미수집" : "분기 미공시 · 연간만"}</div>`, "fcard", ` data-co="${esc(c.id)}" role="button" tabindex="0"`);
      const cur = q.currency || "KRW", n = q.periods.length, val = k => met === "rv" ? q.revenue?.[k] : met === "op" ? q.operatingIncome?.[k] : q.revenue?.[k] != null && q.costOfSales?.[k] != null ? q.revenue[k] - q.costOfSales[k] : null, ks = [...Array(Math.min(5, n)).keys()].map(j => n - Math.min(5, n) + j);
      const ql = p => `${p.slice(2, 4)}.${p.slice(5)}Q`, yoyI = k => q.periods.indexOf(`${+q.periods[k].slice(0, 4) - 1}${q.periods[k].slice(4)}`);
      const raw = ks.map(k => val(k) ?? null), vals = raw.map(v => v == null ? null : cur === "KRW" ? Math.round(v / 1e8) : +(v / 1e6).toFixed(1));
      const rnum = k => met === "gp" ? val(k) : q.operatingIncome?.[k], opm = k => capFn(margin(rnum(k), q.revenue?.[k])), last = ks.at(-1), yj = yoyI(last);
      const yoy = yj < 0 ? null : met === "rv" ? growth(q.revenue[last], q.revenue[yj]) : null;
      const tips = ks.map(k => { const j = yoyI(k); return [`${c.name} · ${ql(q.periods[k])}`, `${MET[met]}\t${big(val(k), cur)}`,
        j >= 0 && val(j) != null ? `전년 같은 분기\t${big(val(j), cur)}${met === "rv" ? ` → ${sgn(growth(q.revenue[k], q.revenue[j]))}` : ""}` : null,
        met !== "rv" ? `매출\t${big(q.revenue?.[k], cur)}` : null, opm(k) != null ? `${RATE}\t${opm(k).toFixed(1)}%` : null, avgTip(q.periods[k])]; });
      return card(`${head}
        <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 4px"><span style="font-size:28px;font-weight:700">${big(val(last), cur)}</span><span style="font-size:15px;color:${MU};white-space:nowrap">${ql(q.periods[last])} ${MET[met]}</span>${met === "rv" ? (yoy != null ? `<span style="font-size:17px;font-weight:700">${pct(yoy, 1, 0)}</span>` : "") : rateNum(rnum(last), q.revenue?.[last])}</div>
        ${colChart(vals, ks.map(k => ql(q.periods[k])), { W: 360, H: 130, colors: vals.map((v, i) => v < 0 ? "#9DB5DD" : i === vals.length - 1 ? c.color : "#D5DCE7"), fmt: v => v == null ? "–" : cur === "KRW" ? nf(v) : v.toFixed(1), tips })}
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:15px;margin-top:6px;color:${MU}"><span>${RATE}</span><span>${ks.slice(-3).map(k => rateCell(rnum(k), q.revenue?.[k])).join(" → ")}</span></div>${avgLine(ks.slice(-3).map(k => q.periods[k]))}`,
        "fcard", ` data-co="${esc(c.id)}" role="button" tabindex="0" title="누르면 약식 손익계산서"`);
    };
    const cards = per === "q" ? cos.map(qCard).join("") : cos.map(c => {
      const a = c.annual, cur = a.currency || "KRW", n = a.revenue.length, last = plAt(a, n - 1);
      const k0 = Math.max(0, n - 3), ks = [...Array(n - k0).keys()].map(j => k0 + j), ys = ks.map(k => a.years[k]), P = ks.map(k => plAt(a, k));
      const raw = P.map(p => p[met]), vals = raw.map(v => v == null ? null : cur === "KRW" ? Math.round(v / 1e8) : +(v / 1e6).toFixed(1));
      const unit = cur === "KRW" ? "억" : "M";
      const tips = ks.map((k, j) => { const p = P[j], pv = j ? P[j - 1][met] : k > 0 ? plAt(a, k - 1)[met] : null;
        return [`${c.name} · ${ys[j]}`, `${MET[met]}\t${big(p[met], cur)}`, p.gpm != null && met === "gp" ? `매출총이익률\t${p.gpm.toFixed(1)}%` : null, pv != null && p[met] != null ? `${met === "rv" ? "매출 성장률" : "전년 대비"}\t${pv > 0 ? sgn(growth(p[met], pv)) : "전년 적자"}` : null,
          met !== "rv" ? `매출\t${big(p.rv, cur)}` : null, p.opm != null && met !== "gp" ? `영업이익률\t${p.opm.toFixed(1)}%` : null, avgTip(ys[j])]; });
      return card(`<div style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}${xaTag(c)}</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 4px"><span style="font-size:28px;font-weight:700">${big(last[met], cur)}</span><span style="font-size:15px;color:${MU};white-space:nowrap">${ys.at(-1)} ${MET[met]}</span>${met === "rv" ? `<span style="font-size:17px;font-weight:700">${pct(last.g, 1, 0)}</span>` : rateNum(last[met === "gp" ? "gp" : "op"], last.rv)}</div>
        ${colChart(vals, ys, { W: 360, H: 130, colors: vals.map((v, i) => v < 0 ? "#9DB5DD" : i === vals.length - 1 ? c.color : "#D5DCE7"), fmt: v => v == null ? "–" : cur === "KRW" ? nf(v) : (Math.abs(v) < 10 ? v.toFixed(1) : nf(v)) + "M", tips })}
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:15px;margin-top:6px;color:${MU}"><span>${RATE}</span><span>${P.map(p => rateCell(met === "gp" ? p.gp : p.op, p.rv)).join(" → ")}</span></div>${avgLine(ys)}
`, "fcard", ` data-co="${esc(c.id)}" role="button" tabindex="0" title="누르면 약식 손익계산서"`);
    }).join("");
    const yr = cos[0]?.annual?.years?.at(-1) || "";
    const lastQ = per === "q" ? cos.flatMap(c => c.quarterly?.periods || []).sort().at(-1) : null;
    const when = per === "q" ? `최근 5개 분기${lastQ ? ` (~${lastQ.slice(2, 4)}.${lastQ.slice(5)}Q)` : ""}` : `${yr} 사업연도`;
    return `<div class="ph"><h1>재무</h1><span class="m">${when} · ${basisLbl()}${infoI(`OpenDART ${basisLbl()} 재무제표 · 비교 평균 = 표시된 회사 이익률 단순평균(매출 미미 제외)`)}</span><span class="r">${metBtn}${segBtn}${perBtn}${ofsBtn()}</span></div>
      <div class="g3">${cards || '<div class="card empty">재무 데이터 없음</div>'}</div>
      ${F.id === "microbiome" ? rndCard(cos) : F.id === "hff" ? adCard(cos, ui) : ""}
      ${sgaCard(cos)}`;
  },

  /* ---------- 시장 ---------- */
  async market(F, ui){
    const reg = ui.reg || "kr", m = F.mk[reg] || {};
    // 출처 번호: market.json 의 s(0부터) → [s+1], 누르면 원문. 화면에 쓴 출처만 아래 목록에(번호는 리포트와 같음)
    const SRC = m.sources || [], used = new Set();
    const sref = s => { const ix = (Array.isArray(s) ? s : [s]).filter(i => Number.isInteger(i) && SRC[i]); if (!ix.length) return "";
      ix.forEach(i => used.add(i));
      return `<sup class="srcn">${ix.map(i => SRC[i].url ? `<a href="${esc(SRC[i].url)}" target="_blank" rel="noopener" title="${esc(SRC[i].t)}">[${i + 1}]</a>` : `<span title="${esc(SRC[i].t)}">[${i + 1}]</span>`).join("")}</sup>`; };
    const regBtn = `<span class="seg">${[["kr", "국내"], ["global", "해외"]].filter(([k]) => F.mk[k]).map(([k, l]) => `<button data-ui="reg=${k}" aria-pressed="${k === reg}">${l}</button>`).join("")}</span>`;
    const kp = (m.size?.kpis || []).slice(0, 3).map(k => card(`<div style="font-size:15px;color:${MU}">${esc(k.label)}${sref(k.s)}</div><div style="font-size:30px;font-weight:700;margin:4px 0;letter-spacing:-.02em">${esc(k.value)}</div><div style="font-size:15px;font-weight:600;color:${/\+/.test(k.sub || "") ? UP : MU}">${esc(k.sub || "")}</div>`)).join("");
    const ser = m.size?.series?.[0];
    let trend = "";
    if (ser?.points?.length > 1){
      const v = ser.points.map(p => p[1]), u = m.size.unit ? ` ${m.size.unit}` : "";
      trend = card(`<h2>시장 규모 추이${sref(ser.s ?? m.size.s)}<small>${esc(m.size.unit || "")} · ${esc(ser.name)}</small></h2>${colChart(v, ser.points.map(p => p[0]), { H: 300, unit: u, subs: v.map((x, i) => i ? (() => { const g = growth(x, v[i - 1]); return `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(g).toFixed(1)}%`; })() : "") })}`);
    }
    const CH_PAL = ["#2B5CA8", "#2B8A7E", "#D08A3C", "#7A5AD0", "#C46A6A", "#5B7DB1", "#8AA34B"], isRestCh = n => /(기타|그 외|미공개)/.test(n);
    const chItems = (() => { const it = m.channels?.items || [], rest = it.filter(([n]) => isRestCh(n));
      return rest.length < 2 ? it : [...it.filter(([n]) => !isRestCh(n)), ["그 외", rest.reduce((t, x) => t + x[1], 0), rest.map(([n, v]) => `${n} ${v.toFixed(1)}%`).join(" · ")]]; })();
    const chs = chItems.length ? card(`<h2>판매 채널 비중${sref(m.channels.s)}<small>${esc(m.channels.title || "")}</small></h2>${donut(chItems.slice().sort((a, b) => isRestCh(a[0]) - isRestCh(b[0]) || b[1] - a[1]).map(([n, v, sub], i) => ({ label: n.replace(/\(.*\)/, ""), color: isRestCh(n) ? "#C3CEDF" : CH_PAL[i % CH_PAL.length], v, tip: [n, `비중\t${v.toFixed(1)}%`, sub || null] })))}`, "dnut-card") : "";
    const sh = m.share?.items?.length ? card(`<h2>품목 비중${sref(m.share.s)}<small>${esc(m.share.title || "")}</small></h2><div style="display:flex;height:40px;border-radius:6px;overflow:hidden;font-size:15px;font-weight:700">${m.share.items.map((x, i) => `<span${tipA([x.name, `비중\t${x.pct}%`])} style="width:${x.pct}%;background:${["#A0522D", "#2B8A7E", "#D3DAE5"][i] || "#B4BFCF"};color:${i < 2 ? "#fff" : "#4A5568"};display:flex;align-items:center;padding:0 10px;white-space:nowrap;overflow:hidden">${esc(x.name.length > 22 ? x.name.slice(0, 20) + "…" : x.name)} ${x.pct}%</span>`).join("")}</div>`) : "";
    const pipe = !m.brands || m.brands.layout === "grouped" ? "" : card(`<h2>${esc(m.brands.title || "")}</h2><div style="display:flex;flex-direction:column">${m.brands.rows.slice(0, 7).map(r => `<div class="prow"><b>${esc(r[0])}</b><span>${esc(r[1])} <span class="mu">· ${esc(r[2])}</span></span><span style="text-align:right">${esc(r[3])}${typeof r.at(-1) === "number" ? sref(r.at(-1)) : ""}</span></div>`).join("")}</div>`);
    const upd = ser?.points?.length ? `${ser.points.at(-1)[0]}년 기준` : `${md(D.market?.updatedAt)} 정리`;
    return `<div class="ph"><h1>시장</h1><span class="m">${esc(m.label || F.name)} · ${upd}</span><span class="r">${regBtn}</span></div>
      ${kp ? `<div class="g3">${kp}</div>` : ""}${trend || chs ? `<div class="g2">${trend}${chs}</div>` : ""}${sh}${pipe}
      ${used.size ? `<div class="mk-src">${fold(`mk-src-${F.id}-${reg}`, `출처 ${used.size}건`, `<ol>${[...used].sort((a, b) => a - b).map(i => `<li value="${i + 1}">${SRC[i].url ? `<a href="${esc(SRC[i].url)}" target="_blank" rel="noopener">${esc(SRC[i].t)} ↗</a>` : esc(SRC[i].t)}</li>`).join("")}</ol>`)}</div>` : ""}`;
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
    const recent = (D.newsfx?.recent || []).filter(e => ids.includes(e.c) && e.cat !== "market").slice(0, 6);
    // 보도 유형을 고르면(기본 = 가장 많은 유형) 그 유형 기사 제목·매체를 아래에. 기사 본문 요약은 수집하지 않음(제목·매체만)
    const sel = cats.some(([k]) => k === ui.ntype) ? ui.ntype : cats[0]?.[0];
    const sArts = w7.filter(e => e.cat === sel).sort((a, b) => (b.d + (b.t || "")).localeCompare(a.d + (a.t || "")));
    const typeList = sel ? `<div class="tl"><p class="tl-h">${esc(catName(sel))} · ${sArts.length}건</p>${sArts.slice(0, 4).map(e => { const c = F.cos.find(x => x.id === e.c), md_ = (e.media || []).filter(Boolean);
        return `<a class="tl-r" href="${esc(e.url)}" target="_blank" rel="noopener"><span class="mu">${md(e.d)}</span><span class="tl-t"><b><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</b> ${esc(e.title)}${md_.length ? `<small>${esc(md_[0])}${(e.n || 1) > 1 ? ` 외 ${e.n - 1}곳` : ""}</small>` : ""}</span></a>`; }).join("")}${sArts.length > 4 ? `<p class="tl-m">외 ${sArts.length - 4}건 · 아래 최근 보도·전체 보기</p>` : ""}</div>` : "";
    const list = recent.map(e => { const c = F.cos.find(x => x.id === e.c);
      return `<a href="${esc(e.url)}" target="_blank" rel="noopener" class="nrow">
        <span class="mu" style="font-size:15px">${md(e.d)}</span><span class="co">${'<i class="dot" style="background:' + c.color + '"></i>' + esc(c.name)}</span>
        <span><span class="tag" style="margin-right:10px">${esc(catName(e.cat))}</span>${esc(e.title)}</span></a>`; }).join("");
    const open = ui.disc === "1", dp = open ? await discPanel(F, ui) : "";
    return `<div class="ph"><h1>공시·기사</h1><span class="m">기사 ${D.newsfx?.updatedAt ? mdh(D.newsfx.updatedAt) : "–"} · 공시 ${D.meta?.updatedAt ? mdh(D.meta.updatedAt) : "–"}</span></div>
      <div class="g2 home"><div class="col">${card(`<h2>주별 보도 수<small>최근 12주 · 같은 소식은 1건 · 막대를 누르면 회사별</small></h2>${wk.length ? (GROW.nwk = H => colChart(wk, lab, { H, fmt: v => String(v), tips: wTips }), `<div data-grow="nwk" data-h0="240">${GROW.nwk(240)}</div>`) : '<p class="empty">집계 준비 중</p>'}`)}</div><div class="col">
      ${card(`<h2>최근 7일 보도 유형<small>${w7.length}건 · 같은 소식은 1건</small></h2>${cats.length ? barChart(cats.map(([k, n]) => ({ label: catName(k), color: k === "etc" ? "#C3CEDF" : "#2B5CA8", v: n, on: k === sel, attr: ` data-ui="ntype=${esc(k)}" role="button" tabindex="0"`,
          tip: [catName(k), `최근 7일\t${n}건`, ...Object.entries(w7.filter(e => e.cat === k).reduce((o, e) => (o[e.c] = (o[e.c] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, x]) => `${F.cos.find(c => c.id === id).name}\t${x}건`)] })), { row: 40, lab: 130, valW: 60, fmt: v => `${v}건` }) + typeList : '<p class="empty">최근 7일 보도 없음</p>'}`)}</div></div>
      ${card(`<h2>최근 보도</h2>${list || '<p class="empty">최근 2주 보도 없음</p>'}<div style="text-align:center;padding:12px 0 2px"><button class="more linkbtn" data-ui="disc=${open ? "" : "1"}" aria-expanded="${open}">${open ? "최근 공시·기사 접기 ▴" : "최근 공시·기사 전체 보기 · 정기보고서·IR·기사 ▾"}</button></div>`)}
      ${dp}`;
  },
};
start(SUM);
