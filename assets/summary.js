/* 요약 보기: 그래프 중심, 핵심 숫자만, AI 정리 문장 없음 */
"use strict";
const card = (inner, cls = "", tag = "div", attr = "") => `<${tag} class="card ${cls}"${attr}>${inner}</${tag}>`;
const icard = (meta, num, numCol, head, chart, { isNew = false, sub = "", link = "" } = {}) =>
  card(`<div class="meta">${meta}${isNew ? '<span class="new" aria-label="새 소식"></span>' : ""}</div>
  <div class="big"><b style="color:${numCol}">${num}</b><span>${head}</span></div>${sub ? `<div class="sub">${sub}</div>` : ""}${chart}`, "ic", link ? "a" : "div", link ? ` href="${link}"` : "");
const moreLink = (menu, label) => `<div class="right"><a class="more" href="${href(menu, S.field, "detail")}">${label} ›</a></div>`;

function todayRows(F){
  const mk = marketChg("KQ"), out = [];
  F.cos.filter(c => isKR(c) && c.quote).forEach(c => { const q = quoteToday(c); out.push({ c, chg: q.chg, cap: q.cap, rel: c.ticker.endsWith(".KS") || q.chg == null || mk.chg == null ? null : q.chg - mk.chg, live: q.live, ts: q.ts }); });
  return { rows: out, mk };
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
        barChart(rel.map(r => ({ label: r.c.name, color: r.c.color, v: r.rel })), { W: 560, row: 30, lab: 130, valW: 56, fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}`, colorFn: v => v >= 1.5 ? UP : v <= -1.5 ? DN : "#A9B4C4" }),
        { isNew: !!tsLive, link: href("quotes", S.field) });
    }
    const { kept } = signalsOf(F);
    let c2;
    if (kept.length){
      const s = kept[0], c = F.cos.find(x => x.id === s.c), cl = (c.price?.close || []).slice(-40), b = cl[0];
      const why = !s.why ? "사유 미확인" : s.why.type === "filing" ? "공시 뒤" : `${catName(s.why.cat)} 보도 뒤`;
      c2 = icard(`평소와 다른 움직임 · 최근 2주${kept.length > 1 ? ` · 외 ${kept.length - 1}곳` : ""}`, arrow(s.idio), colOf(s.idio), esc(c.name),
        lineChart([{ name: c.name, color: c.color, vals: cl.map(x => x && b ? (x / b - 1) * 100 : null) }], { W: 560, H: 130, labels: false }),
        { sub: `${md(s.d)} · 평소의 ${s.z.toFixed(1)}배 · ${why}`, link: href("quotes", S.field) });
    } else c2 = icard("평소와 다른 움직임 · 최근 2주", "없음", INK, "평소 변동폭 안에서 움직였습니다", "", { link: href("quotes", S.field) });
    const { wk, pw } = voiceOf(F), byC = {};
    wk.forEach(e => byC[e.c] = (byC[e.c] || 0) + 1);
    const top = Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const c3 = icard("보도 · 최근 7일(같은 소식은 1건)", `${wk.length}건`, INK, wk.length > pw.length ? `지난 7일 ${pw.length}건보다 늘어남` : wk.length < pw.length ? `지난 7일 ${pw.length}건보다 줄어듦` : "지난 7일과 같음",
      top.length ? barChart(top.map(([id, n]) => { const c = F.cos.find(x => x.id === id); return { label: c.name, color: c.color, v: n }; }), { W: 560, row: 30, lab: 130, valW: 50, fmt: v => `${v}건` }) : "",
      { isNew: wk.some(e => e.d === todayKST()), link: href("news", S.field) });
    const fin = F.cos.filter(c => c.annual?.revenue?.length && (c.annual.currency || "KRW") === "KRW").map(c => ({ c, v: c.annual.revenue.at(-1), y: c.annual.years.at(-1) })).sort((a, b) => b.v - a.v);
    const c4 = fin.length ? icard(`실적 · ${fin[0].y} 매출(억원)`, `${eok(fin[0].v)}억`, INK, `1위 ${esc(fin[0].c.name)}`,
      barChart(fin.slice(0, 8).map(x => ({ label: x.c.name, color: x.c.color, v: x.v / 1e8 })), { W: 560, row: 30, lab: 120, valW: 70 }), { link: href("finance", S.field) }) : "";
    const m = F.mk.kr, ser = m?.size?.series?.[0]?.points;
    let c5 = "";
    if (ser?.length){
      const v = ser.map(p => p[1]), g = growth(v.at(-1), v.at(-2));
      c5 = icard(`시장 · ${esc(m.size.series[0].name.split("(")[0].trim())} (${esc(m.size.unit || "")})`, pct(g, 1, 0).replace(/<[^>]+>/g, ""), colOf(g), `${esc(m.size.kpis?.[0]?.value || "")}`,
        colChart(v, ser.map(p => p[0]), { W: 560, H: 160 }), { link: href("market", S.field) });
    } else if (m?.size?.kpis?.length){
      c5 = icard(`시장 · ${esc(m.label || "")}`, esc(m.size.kpis[0].value), INK, esc(m.size.kpis[0].label), "", { sub: esc(m.size.kpis[0].sub || ""), link: href("market", S.field) });
    }
    return `<div class="g2"><div class="col">${c1}${c2}${c3}</div><div class="col">${c4}${c5}</div></div>`;
  },

  /* ---------- 시세 ---------- */
  async quotes(F, ui){
    const per = ui.per || "1Y", N = { "1Y": 250, "3M": 63, "1M": 21 }[per];
    const listed = F.cos.filter(c => c.listed && c.price?.close?.length > 20);
    const step = per === "1Y" ? 3 : 1;
    const ser = listed.map(c => { const cl = c.price.close.slice(-N), b = cl.find(x => x); return { name: c.name, color: c.color, vals: cl.filter((_, i) => i % step === 0 || i === cl.length - 1).map(x => x && b ? (x / b - 1) * 100 : null) }; });
    const { rows, mk } = todayRows(F), tsLive = rows.find(r => r.ts)?.ts;
    const caps = rows.filter(r => r.cap).sort((a, b) => b.cap - a.cap);
    const seg = [["1Y", "1년"], ["3M", "3개월"], ["1M", "1개월"]].map(([k, l]) => `<button data-ui="per=${k}" aria-pressed="${k === per}">${l}</button>`).join("");
    return `<div class="ph"><h1>시세</h1><span class="m">${tsLive ? `장중 ${tsLive.slice(11, 16)}(15~20분 지연)` : `종가 ${md(rows[0]?.c.quote?.asOf)}`} · 종가 확정 16:40 · KRX, Yahoo</span><span class="r"><span class="seg">${seg}</span></span></div>
      ${card(`<h2>${{ "1Y": "1년", "3M": "3개월", "1M": "1개월" }[per]} 주가 흐름<small>시작일 = 0%</small></h2>${lineChart(ser, { W: 1200, H: 400 })}`)}
      <div class="g2">${card(`<h2>오늘 등락<small>코스닥 ${pct(mk.chg, 2, null)}</small></h2>${barChart(rows.slice().sort((a, b) => (b.chg ?? -99) - (a.chg ?? -99)).map(r => ({ label: r.c.name, v: r.chg ?? 0 })), { fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, colorFn: v => v > 0 ? UP : v < 0 ? DN : "#A9B4C4" })}`)}
      ${card(`<h2>시가총액<small>억원 · 국내 상장 ${caps.length}곳</small></h2>${barChart(caps.map(r => ({ label: r.c.name, color: r.c.color, v: r.cap / 1e8 })))}`)}</div>
      ${moreLink("quotes", "기업가치 표(PSR·PER·PBR) · 오늘 등락 표")}`;
  },

  /* ---------- 재무 ---------- */
  async finance(F, ui){
    const segs = F.g.segments || [], seg = ui.seg || segs[0]?.key || "all";
    const pick = seg === "all" || !segs.length ? F.cos : F.cos.filter(c => segs.find(s => s.key === seg)?.members.includes(c.id));
    const cos = pick.filter(c => c.annual?.revenue?.length).sort((a, b) => (b.annual.currency === "KRW") - (a.annual.currency === "KRW") || b.annual.revenue.at(-1) - a.annual.revenue.at(-1));
    const segBtn = segs.length ? `<span class="seg">${[...segs.map(s => [s.key, s.title]), ["all", "전체"]].map(([k, l]) => `<button data-ui="seg=${k}" aria-pressed="${k === seg}">${esc(l)}</button>`).join("")}</span>` : "";
    const cards = cos.map(c => {
      const a = c.annual, cur = a.currency || "KRW", rv = a.revenue, n = rv.length, g = growth(rv[n - 1], rv[n - 2]);
      const opm = a.operatingIncome.map((o, i) => margin(o, rv[i])), cap = v => v == null ? null : Math.abs(v) > MCAP ? null : v;
      const ys = a.years.slice(-3), vals = rv.slice(-3).map(v => cur === "KRW" ? Math.round(v / 1e8) : +(v / 1e6).toFixed(1));
      return card(`<div style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 4px"><span style="font-size:28px;font-weight:700">${big(rv[n - 1], cur)}</span><span style="font-size:17px;font-weight:700">${pct(g, 1, 0)}</span></div>
        ${colChart(vals, ys, { W: 360, H: 130, colors: ys.map((_, i) => i === ys.length - 1 ? c.color : "#D5DCE7"), fmt: v => cur === "KRW" ? nf(v) : (Math.abs(v) < 10 ? v.toFixed(1) : nf(v)) + "M" })}
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:15px;margin-top:6px;color:${MU}"><span>영업이익률</span><span>${opm.slice(-3).map(v => cap(v) == null ? (v == null ? "–" : "매출 미미") : `<b style="color:${v < 0 ? DN : INK}">${v.toFixed(1)}%</b>`).join(" → ")}</span></div>`);
    }).join("");
    const pts = cos.map(c => { const s = sgaOf(c), a = c.annual, n = a.revenue.length; if (!s?.mk || a.currency !== "KRW") return null;
      const g = growth(a.revenue[n - 1], a.revenue[n - 2]), om = margin(a.operatingIncome[n - 1], a.revenue[n - 1]);
      return g == null ? null : { label: c.name, color: c.color, x: s.mk, y: g, r: Math.max(8, Math.sqrt(a.revenue[n - 1] / 1e8) / 2.2), sub: om == null ? "" : `영업이익률 ${om.toFixed(1)}%` }; }).filter(Boolean);
    const yr = cos[0]?.annual?.years?.at(-1) || "";
    return `<div class="ph"><h1>재무</h1><span class="m">${yr} 사업연도 · 연결 기준 · OpenDART</span><span class="r">${segBtn}</span></div>
      <div class="g3">${cards || '<div class="card empty">재무 데이터 없음</div>'}</div>
      ${pts.length >= 2 ? card(`<h2>성장 vs 마케팅 강도<small>${yr} · 원 크기 = 매출</small></h2>${scatter(pts, { xl: "마케팅 강도 (광고·판촉 + 판매수수료) ÷ 매출 →", yl: "↑ 매출 성장률" })}`) : ""}
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
      const v = ser.points.map(p => p[1]);
      trend = card(`<h2>시장 규모 추이<small>${esc(m.size.unit || "")} · ${esc(ser.name)}</small></h2>${colChart(v, ser.points.map(p => p[0]), { H: 300, subs: v.map((x, i) => i ? (() => { const g = growth(x, v[i - 1]); return `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(g).toFixed(1)}%`; })() : "") })}`);
    }
    const chs = m.channels?.items?.length ? card(`<h2>어디서 사나<small>${esc(m.channels.title || "")}</small></h2>${barChart(m.channels.items.slice().sort((a, b) => (/(기타|그 외|미공개)/.test(a[0])) - (/(기타|그 외|미공개)/.test(b[0])) || b[1] - a[1]).map(([n, v]) => ({ label: n.replace(/\(.*\)/, ""), color: /(기타|그 외|미공개)/.test(n) ? "#C3CEDF" : v > 50 ? "#2B5CA8" : "#7C97C2", v })), { row: 42, lab: 120, valW: 70, fmt: v => `${v.toFixed(1)}%` })}`) : "";
    const sh = m.share?.items?.length ? card(`<h2>무엇을 사나<small>${esc(m.share.title || "")}</small></h2><div style="display:flex;height:40px;border-radius:6px;overflow:hidden;font-size:15px;font-weight:700">${m.share.items.map((x, i) => `<span style="width:${x.pct}%;background:${["#A0522D", "#2B8A7E", "#D3DAE5"][i] || "#B4BFCF"};color:${i < 2 ? "#fff" : "#4A5568"};display:flex;align-items:center;padding:0 10px;white-space:nowrap;overflow:hidden">${esc(x.name.length > 22 ? x.name.slice(0, 20) + "…" : x.name)} ${x.pct}%</span>`).join("")}</div>`) : "";
    const pipe = !m.brands || m.brands.layout === "grouped" ? "" : card(`<h2>${esc(m.brands.title || "")}</h2><div style="display:flex;flex-direction:column">${m.brands.rows.slice(0, 7).map(r => `<div class="prow"><b>${esc(r[0])}</b><span>${esc(r[1])} <span class="mu">· ${esc(r[2])}</span></span><span style="text-align:right">${esc(r[3])}</span></div>`).join("")}</div>`);
    const upd = ser?.points?.length ? `${ser.points.at(-1)[0]}년 기준` : `${md(D.market?.updatedAt)} 정리`;
    return `<div class="ph"><h1>시장</h1><span class="m">${esc(m.label || F.name)} · ${upd}</span><span class="r">${regBtn}</span></div>
      ${kp ? `<div class="g3">${kp}</div>` : ""}${trend || chs ? `<div class="g2">${trend}${chs}</div>` : ""}${sh}${pipe}
      ${moreLink("market", "대표 브랜드 · 동향 · 출처")}`;
  },

  /* ---------- 공시·기사 ---------- */
  async news(F){
    const W = D.newsfx?.weekly, ids = F.cos.map(c => c.id);
    const wk = W ? W.weeks.map((_, i) => ids.reduce((t, id) => t + (W.counts[id]?.[i] || 0), 0)) : [];
    const lab = W ? W.weeks.map((d, i) => i === W.weeks.length - 1 ? "이번 주" : md(d)) : [];
    const { wk: w7 } = voiceOf(F), byCat = {};
    w7.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + 1);
    const cats = Object.entries(byCat).sort((a, b) => (a[0] === "etc") - (b[0] === "etc") || b[1] - a[1]);
    const recent = (D.newsfx?.recent || []).filter(e => ids.includes(e.c) && e.cat !== "market").slice(0, 6);
    const list = recent.map(e => { const c = F.cos.find(x => x.id === e.c);
      return `<a href="${esc(e.url)}" target="_blank" rel="noopener" class="nrow">
        <span class="mu" style="font-size:15px">${md(e.d)}</span><span class="co">${'<i class="dot" style="background:' + c.color + '"></i>' + esc(c.name)}</span>
        <span><span class="tag" style="margin-right:10px">${esc(catName(e.cat))}</span>${esc(e.title)}</span></a>`; }).join("");
    return `<div class="ph"><h1>공시·기사</h1><span class="m">기사 ${D.newsfx?.updatedAt ? mdh(D.newsfx.updatedAt) : "–"} · 공시 ${D.meta?.updatedAt ? mdh(D.meta.updatedAt) : "–"}</span></div>
      <div class="g2">${card(`<h2>주별 보도 수<small>최근 12주 · 같은 소식은 1건</small></h2>${wk.length ? colChart(wk, lab, { H: 240, fmt: v => String(v) }) : '<p class="empty">집계 준비 중</p>'}`)}
      ${card(`<h2>최근 7일 보도 유형<small>${w7.length}건</small></h2>${cats.length ? barChart(cats.map(([k, n]) => ({ label: catName(k), color: k === "etc" ? "#C3CEDF" : "#2B5CA8", v: n })), { row: 40, lab: 130, valW: 60, fmt: v => `${v}건` }) : '<p class="empty">최근 7일 보도 없음</p>'}`)}</div>
      ${card(`<h2>최근 보도</h2>${list || '<p class="empty">최근 2주 보도 없음</p>'}<div style="text-align:center;padding:12px 0 2px"><a class="more" href="${href("news", S.field, "detail")}">전체 기사·공시 · 회사·유형·매체로 찾기 ›</a></div>`)}`;
  },
};
start(SUM);
