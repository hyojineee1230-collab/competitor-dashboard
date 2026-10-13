/* 상세 보기: 표·숫자 중심 + AI 정리(인사이트) */
"use strict";
const card = (inner, cls = "", attr = "") => `<div class="card ${cls}"${attr}>${inner}</div>`;
const tbl = (head, rows, cls = "") => `<div class="tw"><table class="${cls}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
// 모바일 카드용 이름표: 머리글 텍스트를 각 칸에 data-l 로
function labelCells(root){
  root.querySelectorAll(".tw table").forEach(t => {
    const hs = [...(t.tHead?.rows[0]?.cells || [])].flatMap(th => Array(th.colSpan || 1).fill(th.dataset.l ?? (th.childNodes[0]?.textContent || th.innerText).replace(/\s+/g, " ").trim()));
    [...(t.tBodies[0]?.rows || [])].forEach(tr => { let k = 0; [...tr.cells].forEach(td => { if (!td.hasAttribute("data-l")) td.dataset.l = td.colSpan > 1 ? "" : hs[k] || ""; k += td.colSpan || 1; }); });
  });
}
new MutationObserver(() => labelCells(document)).observe(document.getElementById("main"), { childList: true });
// 선택 상자: <select data-sel="key">
document.addEventListener("change", e => { const s = e.target.closest("[data-sel]"); if (!s) return; S.ui[s.dataset.sel] = s.value; S.ui.lim = ""; render(); });
const segBtns = (key, items, cur) => `<span class="seg">${items.map(([k, l]) => `<button data-ui="${key}=${k}" aria-pressed="${k === cur}">${esc(l)}</button>`).join("")}</span>`;
const srcLink = (url, label = "↗") => url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="more" style="font-size:13px;margin-left:6px" title="원문">${label}</a>` : "";

// 비상장 기업가치 추정: 같은 묶음 상장사 PSR 범위 × 매출 (가운데 값)
function valuations(F, list){
  const segOf = c => (F.g.segments || []).find(s => s.members.includes(c.id))?.key;
  const lastRev = c => { const a = c.annual; return a?.revenue?.length ? { rev: a.revenue.at(-1), cur: a.currency || "KRW", y: a.years.at(-1) } : {}; };
  const psr = c => { const q = c.quote, L = lastRev(c); return q?.marketCap && L.rev > 0 && (q.currency || "KRW") === L.cur ? q.marketCap / L.rev : null; };
  return list.map(c => {
    const L = lastRev(c), q = c.quote || {};
    if (c.listed) return { c, cap: q.marketCap, cur: q.currency || "KRW", rev: L.rev, rcur: L.cur, psr: psr(c), per: q.per, pbr: q.pbr };
    const peers = F.cos.filter(p => p.listed && segOf(p) === segOf(c)).map(psr).filter(v => v != null);
    if (!peers.length || !L.rev) return { c, est: true, rev: L.rev, rcur: L.cur };
    const lo = Math.min(...peers), hi = Math.max(...peers);
    return { c, est: true, cap: L.rev * (lo + hi) / 2, lo: L.rev * lo, hi: L.rev * hi, cur: L.cur, rev: L.rev, rcur: L.cur, plo: lo, phi: hi };
  });
}

const DET = {
  /* ---------- 인사이트 ---------- */
  async insight(F){
    const Sm = D.summaries || {}, coreIds = new Set((D.biz?.companies || []).map(c => c.id));
    const ai = (Sm.headline || []).length ? card(`<div class="meta">AI 정리 · ${md(Sm.updatedAt)} · 핵심 경쟁사 기준</div>
      ${Sm.headline.map((h, i) => `<div style="display:flex;gap:12px;margin-top:10px"><b style="color:#8FB3E0;font-size:17px">${i + 1}</b><div><div class="h" style="font-size:18px">${esc(h.t)}</div><div class="s" style="font-size:13px;margin-top:2px">${(h.s || []).map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:#9FC0EE">${esc(s.t)} ↗</a>` : esc(s.t)).join(" · ")}</div></div></div>`).join("")}`, "ai") : "";
    const bench = (Sm.bench || []).length ? `<div class="g3">${Sm.bench.map((b, i) => card(`<div style="font-size:12.5px;font-weight:700;color:#A06A12">POINT ${i + 1}</div><div style="font-size:17px;font-weight:700;margin:4px 0">${esc(b.h)}</div>
      <div class="mu" style="font-size:13.5px">${esc(b.who)}</div><p style="margin:8px 0;font-size:14.5px;line-height:1.6">${esc(b.e)}</p><p style="margin:0;font-size:14px;background:#F6F1E7;border-radius:8px;padding:8px 10px;color:#4A3B1F">${esc(b.imp)}</p>`)).join("")}</div>` : "";
    // 지금 · 흐름 (요약 화면과 같은 판단을 문장으로)
    const rows = F.cos.filter(c => isKR(c) && c.quote).map(c => ({ c, ...quoteToday(c) })), mk = marketChg("KQ"), avg = mean(rows.map(r => r.chg));
    const rel = rows.filter(r => r.chg != null && !r.c.ticker.endsWith(".KS") && mk.chg != null).map(r => ({ ...r, rel: r.chg - mk.chg })).sort((a, b) => b.rel - a.rel);
    const dc = (num, numCol, meta, h, s, link) => `<div class="card dc"><span class="n" style="color:${numCol}">${num}</span><span><span class="meta">${meta}</span><div class="h"><a href="${link}">${h}</a></div><div class="s">${s}</div></span></div>`;
    const now = [];
    if (rows.length) now.push(dc(arrow(avg), colOf(avg), `오늘 주가 · ${rows.find(r => r.ts)?.ts?.slice(11, 16) || "종가"}`, `국내 상장 ${rows.length}곳 평균, 코스닥 ${arrow(mk.chg)}`,
      rel.length > 1 ? `시장 대비 가장 강한 곳 ${esc(rel[0].c.name)} ${pct(rel[0].rel, 1, null, "%p")} · 가장 약한 곳 ${esc(rel.at(-1).c.name)} ${pct(rel.at(-1).rel, 1, null, "%p")}` : "", href("quotes", S.field)));
    const { kept, sector } = signalsOf(F);
    kept.slice(0, 3).forEach(s => { const c = F.cos.find(x => x.id === s.c), w = s.why;
      now.push(dc(arrow(s.idio), colOf(s.idio), `평소와 다른 움직임 · ${md(s.d)}`, `${esc(c.name)}, 평소 변동폭의 ${s.z.toFixed(1)}배`,
        `${s.vr >= 2 ? `거래량 ${s.vr.toFixed(1)}배 · ` : ""}${!w ? "전 거래일~당일 공시·주가 관련 보도 없음(사유 미확인)" : `${w.type === "filing" ? "공시" : catName(w.cat) + " 보도"}: <a href="${esc(w.url)}" target="_blank" rel="noopener" class="more">${esc(w.title)}</a>`}`, href("quotes", S.field))); });
    sector.slice(0, 1).forEach(x => now.push(dc(arrow(x.med), colOf(x.med), `분야 전체 움직임 · ${md(x.d)}`, `${x.n}곳 중 ${x.med < 0 ? x.down : x.up}곳이 같은 방향`, "회사 고유 신호에서는 제외", href("quotes", S.field))));
    const { wk, pw } = voiceOf(F), byC = {}; wk.forEach(e => byC[e.c] = (byC[e.c] || 0) + 1);
    const lead = Object.entries(byC).sort((a, b) => b[1] - a[1])[0];
    now.push(dc(`${wk.length}건`, INK, "보도 · 최근 7일(같은 소식은 1건)", `지난 7일 ${pw.length}건${lead ? ` · 최다 ${esc(F.cos.find(c => c.id === lead[0]).name)} ${lead[1]}건` : ""}`,
      Object.entries(wk.reduce((m, e) => (m[e.cat] = (m[e.cat] || 0) + 1, m), {})).filter(([k]) => k !== "etc").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${catName(k)} ${n}`).join(" · "), href("news", S.field)));
    const flow = [];
    const fin = F.cos.filter(c => c.annual?.revenue?.length > 1 && (c.annual.currency || "KRW") === "KRW").map(c => { const a = c.annual, n = a.revenue.length; return { c, v: a.revenue[n - 1], g: growth(a.revenue[n - 1], a.revenue[n - 2]), om: margin(a.operatingIncome[n - 1], a.revenue[n - 1]), y: a.years[n - 1] }; });
    if (fin.length){
      const top = fin.slice().sort((a, b) => b.v - a.v)[0], gr = fin.filter(x => x.g != null).sort((a, b) => b.g - a.g)[0], om = fin.filter(x => x.om != null && Math.abs(x.om) < MCAP).sort((a, b) => b.om - a.om)[0];
      flow.push(dc(`${eok(top.v)}억`, INK, `실적 · ${top.y} 사업연도`, `매출 1위 ${esc(top.c.name)} · 성장 1위 ${esc(gr.c.name)} ${pct(gr.g, 1, 0)}`, `영업이익률 1위 ${esc(om.c.name)} ${om.om.toFixed(1)}%`, href("finance", S.field)));
    }
    const m = F.mk.kr;
    if (m?.size?.kpis?.length){ const ser = m.size.series?.[0]?.points, g = ser?.length > 1 ? growth(ser.at(-1)[1], ser.at(-2)[1]) : null;
      flow.push(dc(g == null ? "–" : pct(g, 1, 0), colOf(g), `시장 · ${esc(m.label || "")}`, `${esc(m.size.kpis[0].label)} ${esc(m.size.kpis[0].value)}`, esc((m.channels?.items?.[0] ? `${m.channels.items[0][0]} 비중 ${m.channels.items[0][1]}%` : m.size.kpis[1] ? `${m.size.kpis[1].label} ${m.size.kpis[1].value}` : "")), href("market", S.field))); }
    // 핵심 경쟁사: 성장 원인(AI 정리) 칩
    const drv = F.cos.filter(c => coreIds.has(c.id) && Sm.drivers?.[c.id]).map(c => { const a = c.annual, n = a?.revenue?.length || 0;
      return `<tr><td>${coLabel(c)}</td><td>${a ? big(a.revenue[n - 1], a.currency) : "–"}<small>${pct(growth(a?.revenue[n - 1], a?.revenue[n - 2]), 1, 0)}</small></td><td>${a ? (margin(a.operatingIncome[n - 1], a.revenue[n - 1]) ?? 0).toFixed(1) + "%" : "–"}</td>
        <td class="wrap">${Sm.drivers[c.id].slice().sort((p, q) => q.lv - p.lv).map(d => `<span class="tag" title="${esc(d.d)}" style="margin:2px 4px 2px 0;${d.lv >= 2 ? "background:#E3EDFB;color:#1E4E96;font-weight:700" : ""}">${esc(d.tag)}</span>`).join("")}</td></tr>`; }).join("");
    return `${ai}${bench}
      <div class="g2"><div class="col"><div style="font-size:15px;font-weight:700;color:#4A5568">지금 <span class="dim" style="font-weight:400">· 매시간</span></div>${now.join("")}</div>
      <div class="col"><div style="font-size:15px;font-weight:700;color:#4A5568">흐름 <span class="dim" style="font-weight:400">· 분기·연간</span></div>${flow.join("")}</div></div>
      ${drv ? card(`<h2>성장 원인<small>AI 정리 · 진한 칩 = 핵심 동인 · 칩에 마우스를 올리면 근거</small></h2>${tbl('<th>회사</th><th>매출<small>성장률</small></th><th>영업이익률</th><th class="l">성장 원인</th>', drv)}`) : ""}`;
  },

  /* ---------- 시세 ---------- */
  async quotes(F, ui){
    const mk = marketChg("KQ");
    const rows = F.cos.filter(c => c.listed && c.quote).map(c => ({ c, ...quoteToday(c) })).sort((a, b) => ((b.c.quote.currency || "KRW") === "KRW") - ((a.c.quote.currency || "KRW") === "KRW") || (b.cap || 0) - (a.cap || 0));
    const qr = rows.map(r => { const kr = isKR(r.c), cl = (r.c.price?.close || []).slice(-250).filter(x => x), y1 = cl.length > 20 ? (cl.at(-1) / cl[0] - 1) * 100 : null;
      const rel = kr && !r.c.ticker.endsWith(".KS") && r.chg != null && mk.chg != null ? r.chg - mk.chg : null;
      return `<tr><td>${coLabel(r.c, r.c.ticker.endsWith(".KS") ? '<span class="dim" style="font-size:12px;font-weight:400">코스피</span>' : kr ? "" : `<span class="dim" style="font-size:12px;font-weight:400">${esc(r.c.ticker)}</span>`)}</td>
        <td>${pct(r.chg, 2, null)}</td><td>${pct(rel, 1, 2, "%p")}</td><td>${pct(r.c.quote.change1w, 1, 5)}</td>
        <td class="l">${spark(cl.filter((_, i) => i % 4 === 0), r.c.color)}</td><td>${pct(y1, 0, 20)}</td><td><b>${big(r.cap, r.c.quote.currency || "KRW")}</b></td></tr>`; }).join("");
    const segs = F.g.segments || [], seg = ui.vseg || segs[0]?.key || "all";
    const vlist = seg === "all" || !segs.length ? F.cos : F.cos.filter(c => segs.find(s => s.key === seg)?.members.includes(c.id));
    const vr = valuations(F, vlist).sort((a, b) => (b.cap || 0) - (a.cap || 0)).map(v => {
      const note = F.g.valuationNotes?.[v.c.id], ref = note && F.cos.find(c => c.id === note.ref);
      return `<tr><td>${coLabel(v.c, v.est ? '<span class="est">추정</span>' : "")}</td><td title="${v.est && v.lo ? `${big(v.lo, v.cur)} ~ ${big(v.hi, v.cur)}` : ""}"><b>${v.cap ? (v.est ? "약 " : "") + big(v.cap, v.cur) : "–"}</b></td><td>${big(v.rev, v.rcur)}</td>
        <td>${v.psr ? v.psr.toFixed(2) + "배" : '<span class="dim">–</span>'}</td><td>${v.per ? v.per.toFixed(1) + "배" : "–"}</td><td>${v.pbr ? v.pbr.toFixed(1) + "배" : "–"}</td></tr>` +
        (ref?.quote?.marketCap ? `<tr class="sub"><td colspan="6" style="padding-left:28px">참고: ${esc(note.text)} ${big(ref.quote.marketCap)}</td></tr>` : "");
    }).join("");
    const pr = valuations(F, vlist).find(v => v.est && v.plo);
    // 일자별 시가총액 조회 (국내 상장, 원 단위 복사)
    const kr = F.cos.filter(c => isKR(c) && c.price?.mcap?.length), dates = [...new Set(kr.flatMap(c => c.price.dates))].sort();
    const day = ui.day && dates.includes(ui.day) ? ui.day : dates.at(-1);
    const capAt = c => { const p = c.price; for (let k = p.dates.length - 1; k >= 0; k--) if (p.dates[k] <= day) return [p.mcap[k], p.dates[k]]; return [null, null]; };
    const cr = kr.map(c => [c, ...capAt(c)]).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    window.__cap = cr.map(([c, v]) => `${c.name}(${c.ticker.slice(0, 6)})\t${v == null ? "" : v / 1e8}`).join("\n");
    return `<div class="ph"><h1>시세</h1><span class="m">${rows.find(r => r.ts) ? `장중 ${rows.find(r => r.ts).ts.slice(11, 16)}(15~20분 지연)` : `종가 ${md(rows[0]?.asOf)}`} · 종가 확정 16:40 · KRX, Yahoo Finance</span></div>
      ${card(`<h2>오늘 등락과 1년 흐름<small>시가총액순 · 코스닥 ${pct(mk.chg, 2, null)}</small></h2>${tbl('<th>종목</th><th>오늘</th><th>시장 대비</th><th>1주</th><th class="l">1년 추이</th><th>1년</th><th>시가총액</th>', qr)}<p class="note">색은 시장 대비 ±2%p, 1주 ±5%, 1년 ±20%를 넘을 때만</p>`)}
      ${card(`<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px"><h2 style="margin:0">기업가치<small>시가총액 ${md(rows[0]?.asOf)} · 매출 최근 사업연도</small></h2><span style="margin-left:auto">${segs.length ? segBtns("vseg", [...segs.map(s => [s.key, s.title]), ["all", "전체"]], seg) : ""}</span></div>
        ${tbl('<th>종목</th><th>시가총액</th><th>매출</th><th>PSR</th><th>PER</th><th>PBR</th>', vr)}${pr ? `<p class="note">추정 = 비상장사, 같은 묶음 상장사 PSR(${pr.plo.toFixed(2)}~${pr.phi.toFixed(2)}배) × 매출의 가운데 값 · 범위는 마우스를 올리면 표시</p>` : ""}`)}
      ${kr.length ? card(`<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px"><h2 style="margin:0">일자별 시가총액<small>억원 · 그날 값이 없으면 직전 거래일</small></h2>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center"><input type="date" value="${day}" min="${dates[0]}" max="${dates.at(-1)}" data-sel="day" style="height:34px;border:1px solid #D5DBE5;border-radius:8px;padding:0 8px;font:inherit;font-size:14px">
        <button class="seg" style="border:1px solid #D5DBE5;background:#fff;padding:7px 12px;border-radius:8px;font-size:14px" onclick="navigator.clipboard?.writeText(window.__cap).then(()=>this.textContent='복사했습니다')">엑셀로 복사</button></span></div>
        ${tbl('<th>종목</th><th>시가총액(억원)</th><th>기준일</th>', cr.map(([c, v, d]) => `<tr><td>${coLabel(c)} <span class="dim" style="font-size:12px">${esc(c.ticker.slice(0, 6))}</span></td><td>${v == null ? "–" : nf(v / 1e8, 2)}</td><td class="mu">${md(d)}</td></tr>`).join(""))}`) : ""}`;
  },

  /* ---------- 재무 ---------- */
  async finance(F, ui){
    const ofs = ui.ofs === "1", segs = F.g.segments || [], seg = ui.seg || segs[0]?.key || "all";
    const list = (seg === "all" || !segs.length ? F.cos : F.cos.filter(c => segs.find(s => s.key === seg)?.members.includes(c.id))).filter(c => annual(c, ofs)?.revenue?.length);
    const cur0 = "KRW", krw = list.filter(c => (annual(c, ofs).currency || "KRW") === cur0).sort((a, b) => annual(b, ofs).revenue.at(-1) - annual(a, ofs).revenue.at(-1));
    const other = list.filter(c => (annual(c, ofs).currency || "KRW") !== cur0);
    const peer = [];
    const row = c => {
      const a = annual(c, ofs), n = a.revenue.length, cur = a.currency || "KRW", rv = a.revenue, op = a.operatingIncome, cs = a.costOfSales || [];
      const gp = rv.map((r, i) => r != null && cs[i] != null ? r - cs[i] : null), opm = op.map((o, i) => margin(o, rv[i])), gpm = margin(gp[n - 1], rv[n - 1]);
      const fm = v => v == null ? "–" : Math.abs(v) > MCAP ? '<span class="dim">매출 미미</span>' : `<span class="${v < 0 ? "dn" : ""}">${v.toFixed(1)}%</span>`;
      if (cur === "KRW") peer.push({ rv: rv[n - 1], g: growth(rv[n - 1], rv[n - 2]), gp: gp[n - 1], gpm, op: op[n - 1], opm: Math.abs(opm[n - 1] ?? 0) > MCAP ? null : opm[n - 1] });
      const link = a.links?.[a.years[n - 1]];
      let r = `<tr><td>${coLabel(c)}${srcLink(link)}<small class="dim" style="font-weight:400">${esc(a.source || "")}</small></td><td><b>${big(rv[n - 1], cur)}</b><small>${pct(growth(rv[n - 1], rv[n - 2]), 1, 10)}</small></td>
        <td class="l">${spark(rv.map(v => v == null ? null : v / 1e8), c.color, { W: 96, dots: true })}</td><td>${big(gp[n - 1], cur)}<small>${fm(gpm)}</small></td>
        <td><b class="${op[n - 1] < 0 ? "dn" : ""}">${big(op[n - 1], cur)}</b><small>${fm(opm[n - 1])}</small></td><td class="l">${spark(opm.map(v => v == null || Math.abs(v) > MCAP ? null : v), c.color, { W: 96, dots: true })}</td></tr>`;
      const sgm = !ofs && c.segment;
      if (sgm?.years?.length){ const k = sgm.years.length - 1, tot = a.revenue[a.years.indexOf(sgm.years[k])];
        r += `<tr class="sub"><td style="padding-left:28px">└ ${esc(sgm.name)} 부문 <span class="dim">${tot ? `매출의 ${Math.round(sgm.revenue[k] / tot * 100)}%` : ""}</span>${srcLink(sgm.link)}</td><td>${big(sgm.revenue[k])}<small>${pct(growth(sgm.revenue[k], sgm.revenue[k - 1]), 1, 10)}</small></td><td></td><td>–</td><td>${big(sgm.operatingIncome[k])}<small>${fm(margin(sgm.operatingIncome[k], sgm.revenue[k]))}</small></td><td></td></tr>`; }
      return r;
    };
    const body = krw.map(row).join("") + other.map(row).join("");
    const A = k => mean(peer.map(p => p[k]));
    const avg = peer.length > 1 ? `<tr class="avg"><td>경쟁사 평균 <span style="font-weight:400;font-size:12.5px" class="mu">${peer.length}개사 · 원화</span></td><td>${big(A("rv"))}<small>${pct(A("g"), 1, null)}</small></td><td></td><td>${big(A("gp"))}<small>${A("gpm")?.toFixed(1) ?? "–"}%</small></td><td>${big(A("op"))}<small>${A("opm")?.toFixed(1) ?? "–"}%</small></td><td></td></tr>` : "";
    const yr = annual(krw[0] || list[0] || {}, ofs)?.years || [];
    const sg = list.map(c => ({ c, s: sgaOf(c, ofs) })).filter(x => x.s).sort((a, b) => (b.s.mk ?? -1) - (a.s.mk ?? -1));
    const pv = (v, b) => v == null ? "–" : `${eok(v)}<small>${b ? (v / b * 100).toFixed(1) + "%" : ""}</small>`;
    const sgr = sg.map(({ c, s }) => `<tr><td>${coLabel(c)}${srcLink(s.link)}</td><td>${eok(s.rev)}</td><td class="l"><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:90px;height:8px;background:#EEF1F6;border-radius:3px;display:inline-block"><span style="display:block;height:8px;width:${Math.min(100, (s.mk || 0) / 60 * 100).toFixed(0)}%;background:${c.color};border-radius:3px"></span></span><b>${s.mk == null ? "–" : s.mk.toFixed(1) + "%"}</b></span></td>
      <td>${pv(s.tot, s.rev)}</td><td>${pv(s.adpromo, s.rev)}</td><td>${s.comm == null ? '<span class="dim">–</span>' : pv(s.comm, s.rev)}</td><td class="mu">${pv(s.labor, s.tot)}</td><td class="mu">${pv(s.rnd, s.tot)}</td></tr>`).join("");
    const segB = segs.length ? segBtns("seg", [...segs.map(s => [s.key, s.title]), ["all", "전체"]], seg) : "";
    const qs = F.cos.flatMap(c => c.quarterly?.periods || []).sort().at(-1);
    return `<div class="ph"><h1>재무</h1><span class="m">${qs ? `분기 ${qs.slice(0, 4)}.${qs.slice(5)}Q 반영 · ` : ""}OpenDART 정기보고서·감사보고서</span><span class="r">${segB}${segBtns("ofs", [["", "연결"], ["1", "별도"]], ofs ? "1" : "")}</span></div>
      ${card(`<h2>손익<small>${yr.at(-1) || ""} 사업연도 · 매출순 · 추이 ${yr[0] || ""}→${yr.at(-1) || ""} · ${ofs ? "별도" : "연결"} 기준</small></h2>
        ${tbl('<th>종목</th><th>매출<small>성장률</small></th><th class="l">매출 추이</th><th>매출이익<small>이익률</small></th><th>영업이익<small>이익률</small></th><th class="l">영업이익률 추이</th>', body + avg)}
        <p class="note">↗ = DART 원문 · 이익률 ±1,000% 초과는 '매출 미미'로 표시하고 평균에서 제외</p>`)}
      ${sg.length ? card(`<h2>판관비<small>${sg[0].s.y} · 억원 · 금액 아래 비율 · 마케팅 강도순</small></h2>
        ${tbl('<th>종목</th><th>매출</th><th class="l">마케팅 강도<small>광고·판촉+판매수수료 ÷ 매출</small></th><th>판관비<small>매출 대비</small></th><th>광고·판촉<small>매출 대비</small></th><th>판매수수료<small>매출 대비</small></th><th class="mu">인건비<small>판관비 대비</small></th><th class="mu">연구개발비<small>판관비 대비</small></th>', sgr)}
        <p class="note">판매수수료는 계정명에 '판매수수료·판매대행'이 있을 때만 집계</p>`) : ""}`;
  },

  /* ---------- 시장 ---------- */
  async market(F, ui){
    const reg = ui.reg || "kr", m = F.mk[reg] || {}, src = m.sources || [];
    const ref = s => [].concat(s ?? []).filter(x => x != null).map(i => src[i] ? `<sup><a href="${esc(src[i].url || "#")}" target="_blank" rel="noopener" class="more" style="font-size:11px">[${i + 1}]</a></sup>` : "").join("");
    const kp = (m.size?.kpis || []).map(k => card(`<div class="mu" style="font-size:14px">${esc(k.label)}${ref(k.s)}</div><div style="font-size:24px;font-weight:700;margin:4px 0">${esc(k.value)}</div><div class="mu" style="font-size:13.5px">${esc(k.sub || "")}</div>`)).join("");
    const series = (m.size?.series || []).filter(s => s.points?.length);
    const years = [...new Set(series.flatMap(s => s.points.map(p => String(p[0]))))].sort();
    const st = series.length ? tbl(`<th>구분</th>${years.map(y => `<th>${y}</th>`).join("")}`, series.map(s => `<tr><td>${esc(s.name)}${ref(s.s)}</td>${years.map(y => { const p = s.points.find(q => String(q[0]) === y); return `<td>${p ? nf(p[1], p[1] % 1 ? 1 : 0) : "–"}</td>`; }).join("")}</tr>`).join("")) : "";
    const ser0 = series[0];
    const trend = ser0?.points?.length > 1 ? colChart(ser0.points.map(p => p[1]), ser0.points.map(p => p[0]), { W: 1200, H: 260 }) : "";
    const ch = m.channels?.items?.length ? card(`<h2>${esc(m.channels.title)}${ref(m.channels.s)}</h2>${barChart(m.channels.items.map(([n, v]) => ({ label: n, color: /(기타|그 외|미공개)/.test(n) ? "#C3CEDF" : "#2B5CA8", v })), { row: 38, lab: 130, valW: 70, fmt: v => `${v.toFixed(1)}%` })}
      ${m.shift?.ticket ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #EEF1F6"><div class="mu" style="font-size:14px;margin-bottom:6px">${esc(m.shift.ticket.title)}${ref(m.shift.ticket.s)}</div><div style="display:flex;gap:24px;flex-wrap:wrap">${m.shift.ticket.items.map(([n, v]) => `<span><span class="mu" style="font-size:13.5px">${esc(n)}</span> <b style="font-size:19px">${v}</b><span class="mu">${esc(m.shift.ticket.unit)}</span></span>`).join("")}</div></div>` : ""}`) : "";
    const sh = m.share?.items?.length ? card(`<h2>${esc(m.share.title)}${ref(m.share.s)}</h2>${barChart(m.share.items.map((x, i) => ({ label: x.name.length > 14 ? x.name.slice(0, 13) + "…" : x.name, color: ["#A0522D", "#2B8A7E", "#C3CEDF"][i] || "#B4BFCF", v: x.pct })), { row: 38, lab: 170, valW: 70, fmt: v => `${v.toFixed(1)}%` })}
      ${m.share.rank ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #EEF1F6"><div class="mu" style="font-size:14px;margin-bottom:8px">${esc(m.share.rank.title)}</div>${barChart(m.share.rank.items.map(r => ({ label: r[0].replace(/\s*\(.*\)/, ""), color: "#7C97C2", v: r[1] })), { row: 32, lab: 150, valW: 80 })}<p class="note">${esc(m.share.rank.note || "")}</p></div>` : ""}`) : "";
    let br = "";
    if (m.brands?.rows?.length){
      if (m.brands.layout === "grouped"){
        const groups = []; m.brands.rows.forEach(r => { let g = groups.find(x => x[0] === r[0]); if (!g) groups.push(g = [r[0], []]); g[1].push(r); });
        br = card(`<h2>${esc(m.brands.title)}<small>점유율 순위 아님</small></h2><div class="g4" style="gap:0 24px">${groups.map(([k, rs]) => `<div style="padding:10px 0;border-top:1px solid #EEF1F6"><div style="font-size:13px;font-weight:700;color:#4A5568;margin-bottom:4px">${esc(k)}</div>${rs.map(r => `<div style="font-size:15px" title="${esc(r[3] || "")}"><b>${esc(r[1])}</b> <span class="mu">${esc(r[2])}</span>${ref(r[4])}</div>`).join("")}</div>`).join("")}</div>`);
      } else br = card(`<h2>${esc(m.brands.title)}</h2>${tbl(m.brands.cols.map((c, i) => `<th class="${i < 4 ? "l" : ""}">${esc(c)}</th>`).join(""), m.brands.rows.map(r => `<tr>${m.brands.cols.map((_, i) => `<td class="${i < 4 ? "wrap" : ""}">${i === 1 ? `<b>${esc(r[i])}</b>` : esc(r[i])}${i === m.brands.cols.length - 1 ? ref(r[i + 1]) : ""}</td>`).join("")}</tr>`).join(""))}${m.brands.note ? `<p class="note">${esc(m.brands.note)}</p>` : ""}`);
    }
    const tr = (m.trends || []).length ? card(`<h2>최근 동향</h2><div class="g3" style="gap:12px">${m.trends.map(t => `<div style="border:1px solid #EEF1F6;border-radius:12px;padding:12px 14px"><div style="font-size:15.5px;font-weight:700">${esc(t.h)}</div><p style="margin:6px 0;font-size:14px;line-height:1.6;color:#2D3748">${esc(t.d)}</p><div class="dim" style="font-size:13px">${esc(t.date)}${ref(t.s)}</div></div>`).join("")}</div>`) : "";
    const srcs = src.length ? card(`<h2>출처<small>${src.length}건</small></h2><ol style="margin:0;padding-left:22px;font-size:14px;line-height:1.8">${src.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="more" style="font-size:14px">${esc(s.t)}</a>` : esc(s.t)}</li>`).join("")}</ol>`) : "";
    return `<div class="ph"><h1>시장</h1><span class="m">${esc(m.label || "")} · 정리 ${md(D.market?.updatedAt)}</span><span class="r">${segBtns("reg", [["kr", "국내"], ["global", "해외"]].filter(([k]) => F.mk[k]), reg)}</span></div>
      ${m.def ? card(`<div class="g2" style="gap:14px 28px"><div><p style="margin:0 0 10px;font-size:15.5px;line-height:1.65">${esc(m.def.text || m.def)}</p>${(m.def.chain || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:14px">${m.def.chain.map(x => `<span class="tag" style="font-size:13.5px">${esc(x)}</span>`).join('<span class="dim">→</span>')}</div>` : ""}</div>
        <div style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;font-size:14px;background:#F6F8FB;border-radius:12px;padding:12px 14px">${(m.def.scope || []).map(([k, v]) => `<b>${esc(k)}</b><span class="mu">${esc(v)}</span>`).join("")}</div></div>`) : ""}
      ${kp ? `<div class="g4">${kp}</div>` : ""}
      ${st ? card(`<h2>규모 추이<small>${esc(m.size.unit || "")}</small></h2>${trend}${st}${m.size.note ? `<p class="note">${esc(m.size.note)}</p>` : ""}`) : ""}
      ${ch || sh ? `<div class="g2">${ch}${sh}</div>` : ""}${br}${tr}${srcs}`;
  },

  /* ---------- 공시·기사 ---------- */
  async news(F, ui){
    const tab = ui.tab || "news", ids = new Set(F.cos.filter(c => (c.country || "KR") === "KR" || isKR(c)).map(c => c.id));
    const coSel = ui.co || "", typeSel = ui.type || "", tierSel = ui.tier || "", lim = +(ui.lim || 40);
    const coOpts = `<select data-sel="co" style="height:34px;border:1px solid #D5DBE5;border-radius:8px;font:inherit;font-size:14px;padding:0 8px"><option value="">전체 회사</option>${F.cos.filter(c => ids.has(c.id)).map(c => `<option value="${c.id}"${c.id === coSel ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;
    const tabs = segBtns("tab", [["news", "기사"], ["filing", "공시"], ["report", "정기보고서"]], tab);
    const nameOf = id => F.cos.find(c => c.id === id);
    let body = "", count = "";
    if (tab === "news"){
      if (!D.__raw){ try { const t = await (await fetch(DATA + "news_raw.jsonl", { cache: "no-cache" })).text(); D.__raw = t.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { D.__raw = []; } }
      const [nc, mc] = await Promise.all([getJSON("news_cats", CONF), getJSON("media", CONF)]);
      const cats = (nc?.cats || []).map(c => ({ ...c, re: new RegExp(c.pattern, "i") })), norm = s => String(s || "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
      const alias = mc?.aliases || {}, tierOf = new Map(); (mc?.tiers || []).forEach(t => t.members.forEach(m => tierOf.set(norm(m), t)));
      const cat = t => (cats.find(c => c.re.test(t)) || { key: "etc", name: "기타" });
      const from = new Date(Date.now() - 270 * 864e5).toISOString().slice(0, 10);
      let rows = D.__raw.filter(x => ids.has(x.c) && x.d >= from && (!coSel || x.c === coSel)).map(x => { const by = alias[x.by] || x.by, t = tierOf.get(norm(by)), k = cat(x.title); return { ...x, by, tier: t?.name || "미분류", tk: t?.key || "etc", k: k.key, kn: k.name }; })
        .filter(x => x.k !== "market" && (!typeSel || x.k === typeSel) && (!tierSel || x.tk === tierSel)).sort((a, b) => b.d.localeCompare(a.d) || (b.t || "").localeCompare(a.t || ""));
      count = `${nf(rows.length)}건 · 최근 9개월 · 시세 기사 제외`;
      const t0 = todayKST(), mon = new Date(t0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const m0 = mon.toISOString().slice(0, 10), pm = new Date(mon - 7 * 864e5).toISOString().slice(0, 10);
      const grp = d => d === t0 ? "오늘" : d >= m0 ? "이번 주" : d >= pm ? "지난주" : d.slice(0, 7).replace("-", "년 ") + "월";
      let last = "";
      body = rows.slice(0, lim).map(x => { const g = grp(x.d), c = nameOf(x.c), h = g !== last ? `<tr class="grp"><td colspan="3">${esc(g)}</td></tr>` : ""; last = g;
        return h + `<tr><td style="width:180px">${coLabel(c)}<small class="dim" style="font-weight:400">${md(x.d)}</small></td><td class="wrap"><span class="tag" style="margin-right:8px">${esc(x.kn)}</span><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></td><td class="mu" style="width:220px;font-size:14px">${esc(x.by)}${x.tier !== x.by ? ` · ${esc(x.tier)}` : ""}</td></tr>`; }).join("");
      const typeOpts = `<select data-sel="type" style="height:34px;border:1px solid #D5DBE5;border-radius:8px;font:inherit;font-size:14px;padding:0 8px"><option value="">전체 유형</option>${cats.filter(c => c.key !== "market").map(c => `<option value="${c.key}"${c.key === typeSel ? " selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="etc"${typeSel === "etc" ? " selected" : ""}>기타</option></select>`;
      const tierOpts = `<select data-sel="tier" style="height:34px;border:1px solid #D5DBE5;border-radius:8px;font:inherit;font-size:14px;padding:0 8px"><option value="">전체 매체</option>${(mc?.tiers || []).map(t => `<option value="${t.key}"${t.key === tierSel ? " selected" : ""}>${esc(t.name)}</option>`).join("")}<option value="etc"${tierSel === "etc" ? " selected" : ""}>미분류</option></select>`;
      body = tbl('<th>회사</th><th class="l">기사</th><th class="l">매체</th>', body || '<tr><td colspan="3" class="empty">조건에 맞는 기사 없음</td></tr>') + (rows.length > lim ? `<div style="text-align:center;padding:12px 0 2px"><button data-ui="lim=${lim + 60}" class="more" style="border:0;background:none">더 보기 (${nf(rows.length - lim)}건 남음)</button></div>` : "");
      return `<div class="ph"><h1>공시·기사</h1><span class="m">기사 ${D.newsfx?.updatedAt ? mdh(D.newsfx.updatedAt) : "–"} · 공시 ${D.meta?.updatedAt ? mdh(D.meta.updatedAt) : "–"} · Google News, OpenDART</span></div>
        ${card(`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px">${tabs}<span class="mu" style="font-size:14px;margin-left:6px">${count}</span><span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${coOpts}${typeOpts}${tierOpts}</span></div>${body}`)}`;
    }
    // 공시 / 정기보고서
    const seen = new Set(), items = [];
    F.cos.filter(c => ids.has(c.id) && (!coSel || c.id === coSel)).forEach(c => {
      [...(c.activity || []).filter(x => x.src === "공시"), ...(c.filings || []), ...(c.disclosures || [])].forEach(x => { const k = c.id + x.date + x.title; if (!x.date || seen.has(k)) return; seen.add(k);
        const rep = /사업보고서|반기보고서|분기보고서|감사보고서/.test(x.title); if ((tab === "report") !== rep) return; items.push({ c, ...x }); });
    });
    items.sort((a, b) => b.date.localeCompare(a.date));
    count = `${nf(items.length)}건`;
    body = tbl('<th>접수일</th><th>회사</th><th class="l">공시명</th>', items.slice(0, lim).map(x => `<tr><td class="mu">${x.date.slice(2).replace(/-/g, ".")}</td><td>${coLabel(x.c)}</td><td class="wrap"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></td></tr>`).join("") || '<tr><td colspan="3" class="empty">공시 없음</td></tr>')
      + (items.length > lim ? `<div style="text-align:center;padding:12px 0 2px"><button data-ui="lim=${lim + 60}" class="more" style="border:0;background:none">더 보기</button></div>` : "");
    return `<div class="ph"><h1>공시·기사</h1><span class="m">공시 ${D.meta?.updatedAt ? mdh(D.meta.updatedAt) : "–"} · OpenDART</span></div>
      ${card(`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px">${tabs}<span class="mu" style="font-size:14px;margin-left:6px">${count}</span><span style="margin-left:auto">${coOpts}</span></div>${body}`)}`;
  },
};
start(DET);
