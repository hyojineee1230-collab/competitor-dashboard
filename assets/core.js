/* 경쟁사 모니터 — 요약·상세 공통: 데이터 읽기, 경로·메뉴·분야 라우팅, 헤더, 갱신 현황, 숫자·그래프 도우미
   경로: /summary/#<메뉴>/<분야>  /detail/#<메뉴>/<분야>
   메뉴: insight · quotes · finance · market · news   분야: core(핵심 경쟁사, biz) · hff · microbiome */
"use strict";
const VIEW = /\/detail\/?/.test(location.pathname) ? "detail" : "summary";
const DATA = "../data/", CONF = "../config/";
const MENUS = [["insight", "인사이트"], ["quotes", "시세"], ["finance", "재무"], ["market", "시장"], ["news", "공시·기사"]];
const FIELDS = [["core", "핵심 경쟁사", "biz"], ["hff", "건강기능식품", "hff"], ["microbiome", "마이크로바이옴", "microbiome"]];
const MARKET_OF = { core: "hff", hff: "hff", microbiome: "microbiome" };
const LS = { view: "cm2-view", field: "cm2-field" };
// 회사 색: 모든 화면·그래프에서 같은 색
const COLORS = { ckdhealth: "#1F4E8C", acebiome: "#B8892B", esther: "#7083B8", hpo: "#2B8A7E", nutri: "#9A5A86", cjwellcare: "#6E8F3A",
  kolmarbnh: "#C0573E", suheung: "#5A6B7E", bioneer: "#3E8FB0", novarex: "#8C6D3F", cosmaxnbt: "#C9668A", herbalife: "#7C8A3A", usana: "#5F7FA8",
  hem: "#B07A2A", genome: "#1F4E8C", kobiolabs: "#2B8A7E", cellbiotech: "#7083B8", cjbs: "#9A5A86", bifido: "#6E8F3A", seres: "#C0573E", maat: "#5A6B7E" };
const PAL = ["#1F4E8C", "#B8892B", "#2B8A7E", "#9A5A86", "#7083B8", "#6E8F3A", "#C0573E", "#3E8FB0", "#8C6D3F", "#C9668A"];
const UP = "#D3433A", DN = "#2467C9", INK = "#121B2B", MU = "#6B778A", GR = "#E9EDF3";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

/* ---------- 데이터 ---------- */
const D = {};
async function getJSON(name, path = DATA){
  if (D[name] !== undefined) return D[name];
  try { const r = await fetch(path + name + ".json", { cache: "no-cache" }); D[name] = r.ok ? await r.json() : null; }
  catch (e) { D[name] = null; }
  return D[name];
}
async function loadBase(){
  await Promise.all(["meta", "biz", "hff", "microbiome", "live", "index", "newsfx", "market"].map(n => getJSON(n)));
  if (VIEW === "detail") await getJSON("summaries");
}

/* ---------- 날짜 (한국 시간) ---------- */
const KST = d => new Date(new Date(d).getTime() + 9 * 3600e3);
const todayKST = () => KST(Date.now()).toISOString().slice(0, 10);
const hm = d => KST(d).toISOString().slice(11, 16);
const mdh = d => { const s = KST(d).toISOString(); return (s.slice(0, 10) === todayKST() ? "" : `${s.slice(5, 7)}.${s.slice(8, 10)} `) + s.slice(11, 16); };
const md = s => s ? s.slice(5, 10).replace("-", ".") : "";
// 다음 갱신: 매시(평일 08:07~20:07) · 전체 수집(평일 16:40, 화~토 06:40)
function nextHourly(){
  const k = KST(Date.now()); let h = k.getUTCHours(), m = k.getUTCMinutes(), wd = k.getUTCDay();
  if (wd >= 1 && wd <= 5 && h < 20 + (m < 7 ? 1 : 0) && h >= 7) { const nh = m < 7 ? h : h + 1; if (nh >= 8 && nh <= 20) return `${String(nh).padStart(2, "0")}:07`; }
  return "다음 평일 08:07";
}

/* ---------- 숫자 ---------- */
const nf = (v, d = 0) => v == null || !isFinite(v) ? "–" : v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const eok = v => v == null ? "–" : nf(Math.round(v / 1e8));
function big(v, cur = "KRW"){
  if (v == null) return "–";
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (cur === "KRW") return s + (a >= 1e12 ? `${(a / 1e12).toFixed(2)}조` : `${nf(Math.round(a / 1e8))}억`);
  const sym = { USD: "$", EUR: "€" }[cur] || "";
  return s + sym + (a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : `${(a / 1e6).toFixed(1)}M`);
}
// 부호 있는 %: sig 를 넘을 때만 색
function pct(v, d = 1, sig = 0, suf = "%"){
  if (v == null || !isFinite(v)) return '<span class="dim">–</span>';
  const cls = sig == null || Math.abs(v) < sig ? "" : v > 0 ? "up" : "dn";
  return `<span class="${cls}">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}${suf}</span>`;
}
const arrow = v => v == null ? "–" : `${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(1)}%`;
const colOf = v => v > 0 ? UP : v < 0 ? DN : INK;
const mean = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; };
const growth = (a, b) => a != null && b > 0 ? (a / b - 1) * 100 : null;
const margin = (x, r) => r && x != null ? x / r * 100 : null;
const MCAP = 1000;   // ±1,000% 넘는 이익률은 '매출 미미'

/* ---------- 분야 · 회사 ---------- */
function fieldCtx(fid){
  const f = FIELDS.find(x => x[0] === fid) || FIELDS[1];
  const g = D[f[2]] || { companies: [] };
  const cos = g.companies.map((c, i) => ({ ...c, listed: c.listed ?? !!c.ticker, color: COLORS[c.id] || PAL[i % PAL.length] }));
  return { id: f[0], name: f[1], gid: f[2], g, cos, mk: (D.market?.groups || {})[MARKET_OF[f[0]]] || {} };
}
const isKR = c => /\.(KQ|KS)$/.test(c.ticker || "");
const coLabel = (c, extra = "") => `<span class="co"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}${extra}</span>`;
// 오늘 등락: 장중이면 지연 시세, 아니면 최근 종가 기준
function quoteToday(c){
  const q = c.quote || {}, L = D.live?.quotes?.[c.id], t = todayKST();
  const live = !!(L && L.ts?.slice(0, 10) === t && t > (q.asOf || ""));
  return { chg: live ? L.chg : q.change1d, cap: live && L.mcap ? L.mcap : q.marketCap, live, ts: live ? L.ts : null, asOf: q.asOf };
}
function marketChg(mk = "KQ"){
  const L = D.live?.index?.[mk];
  if (L && L.ts?.slice(0, 10) === todayKST()) return { chg: L.chg, live: true, ts: L.ts };
  const s = D.index?.[mk]; if (!s?.dates?.length) return { chg: null };
  const n = s.dates.length; return { chg: n > 1 ? (s.close[n - 1] / s.close[n - 2] - 1) * 100 : null, day: s.dates[n - 1] };
}
function annual(c, ofs){ return ofs && c.alt?.annual ? c.alt.annual : c.annual; }
function sgaOf(c, ofs){
  const d = ofs && c.alt ? c.alt.sga : c.sga; if (!d?.years?.length) return null;
  const i = d.total.map((v, k) => v ? k : -1).filter(k => k >= 0).at(-1); if (i == null || i < 0) return null;
  const items = d.itemsYear === d.years[i] ? d.items : null;
  // 판매수수료: 묶음 값이 있으면 그것, 없으면 계정 목록에서 — 해당 계정이 하나도 없으면 '–'
  const ci = items ? items.filter(x => /판매수수료|판매대행/.test(x[0])) : [];
  const comm = d.commission?.[i] ? d.commission[i] : ci.length ? ci.reduce((t, x) => t + x[1], 0) : null;
  const rev = d.revenue?.[i];
  return { y: d.years[i], rev, tot: d.total[i], labor: d.labor?.[i], adpromo: d.adpromo?.[i], rnd: d.rnd?.[i], comm, link: d.links?.[d.years[i]],
           mk: rev ? ((d.adpromo?.[i] || 0) + (comm || 0)) / rev * 100 : null };
}
// 이상 움직임 신호(분야 회사만, 회사당 가장 큰 것 하나)
function signalsOf(F){
  const ids = new Set(F.cos.map(c => c.id)), items = (D.newsfx?.signals?.items || []).filter(r => ids.has(r.c));
  const kept = []; items.slice().sort((a, b) => b.z - a.z).forEach(r => { const k = kept.find(x => x.c === r.c); if (k) k.more2 = (k.more2 || 0) + 1; else kept.push({ ...r }); });
  const sector = (D.newsfx?.signals?.sector || []).filter(s => s.g === F.gid || (F.id === "core" && s.g === "hff"));
  return { kept, sector };
}
// 최근 7일 / 그 전 7일 보도(같은 소식 1건, 시세 기사 제외)
function voiceOf(F){
  const ids = new Set(F.cos.map(c => c.id)), t = new Date(todayKST()), age = d => (t - new Date(d)) / 864e5;
  const ev = (D.newsfx?.recent || []).filter(e => ids.has(e.c) && e.cat !== "market");
  return { wk: ev.filter(e => age(e.d) < 7), pw: ev.filter(e => age(e.d) >= 7 && age(e.d) < 14) };
}
const catName = k => D.newsfx?.cats?.[k] || (k === "etc" ? "기타" : k);

/* ---------- 갱신 현황 ---------- */
function freshness(F){
  const items = [];
  if (D.live?.updatedAt) items.push(["#2B6FD6", `시세 ${mdh(D.live.updatedAt)}`]);
  if (D.newsfx?.updatedAt) items.push(["#2B6FD6", `기사 ${mdh(D.newsfx.updatedAt)}`]);
  if (D.meta?.updatedAt) items.push(["#6B7A90", `공시·종가 ${mdh(D.meta.updatedAt)}`]);
  const qs = F.cos.flatMap(c => c.quarterly?.periods || []).sort().at(-1), ys = F.cos.map(c => c.annual?.years?.at(-1)).filter(Boolean).sort().at(-1);
  items.push(["#1F8A78", `재무 ${qs ? qs.slice(2, 4) + "년 " + qs.slice(5) + "Q" : ys ? ys + "년" : "–"}`]);
  const ser = F.mk.kr?.size?.series?.[0]?.points; items.push(["#C98A1B", `시장 ${ser?.length ? ser.at(-1)[0] + "년" : D.market?.updatedAt ? md(D.market.updatedAt) : "–"}`]);
  if (VIEW === "detail" && D.summaries?.updatedAt) items.push(["#7A5AD0", `AI 정리 ${md(D.summaries.updatedAt)}`]);
  return `<div class="fresh">${items.map(([c, s]) => `<span><i style="background:${c}"></i>${esc(s)}</span>`).join("")}<span style="margin-left:auto">다음 갱신 시세·기사 ${nextHourly()}</span></div>`;
}

/* ---------- 그래프 (SVG 문자열) ---------- */
// 휴대폰에서는 좌표 폭을 화면 폭에 맞춰 글자가 줄어들지 않게
const PHONE = () => innerWidth <= 760;
const fitW = W => PHONE() ? Math.min(W, Math.max(300, innerWidth - 62)) : W;
const T = (x, y, s, size = 13, fill = MU, anchor = "start", w = 400) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${w}">${s}</text>`;
function niceTicks(lo, hi, n = 5){
  const raw = (hi - lo) / n || 1, m = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(k => k * m).find(s => s >= raw);
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6)); return out;
}
const fmtPctTick = v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(0)}%`;
// 여러 선: series [{name,color,vals}] (같은 길이), 오른쪽 끝에 이름·값
function lineChart(series, { W = 1200, H = 360, fmt = fmtPctTick, zero = true, labels = true, labelW = 180 } = {}){
  W = fitW(W); if (PHONE()){ labelW = Math.min(labelW, 118); H = Math.min(H, labels ? 300 : 150); }
  const L = 52, R = labels ? labelW : 12, Tp = 10, B = 24;
  const all = series.flatMap(s => s.vals).filter(v => v != null); if (!all.length) return '<p class="empty">데이터 없음</p>';
  let lo = Math.min(...all, zero ? 0 : Infinity), hi = Math.max(...all, zero ? 0 : -Infinity); const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
  const n = Math.max(...series.map(s => s.vals.length)), X = i => L + i * (W - L - R) / Math.max(1, n - 1), Y = v => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
  let g = niceTicks(lo, hi).map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${v === 0 && zero ? "#9AA5B5" : GR}"/>` + T(L - 8, Y(v) + 4, fmt(v), 12.5, MU, "end")).join("");
  const ends = [];
  series.forEach(s => {
    const pts = s.vals.map((v, i) => v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean).join(" ");
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round"/>`;
    const last = [...s.vals].reverse().find(v => v != null); if (last != null) ends.push({ y: Y(last), yy: Y(last), s, v: last });
  });
  if (labels){
    // 이름표 겹침 방지: 위→아래로 밀고, 아래로 넘치면 위로 되밀기
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 19) ends[k].y = ends[k - 1].y + 19;
    const maxY = H - 6; if (ends.length && ends.at(-1).y > maxY){ ends.at(-1).y = maxY; for (let k = ends.length - 2; k >= 0; k--) if (ends[k + 1].y - ends[k].y < 19) ends[k].y = ends[k + 1].y - 19; }
    ends.forEach(e => { g += `<circle cx="${W - R}" cy="${e.yy.toFixed(1)}" r="3.5" fill="${e.s.color}"/>` + T(W - R + 10, e.y + 5, `${esc(e.s.name.length > 11 ? e.s.name.slice(0, 10) + "…" : e.s.name)} <tspan font-weight="700" fill="${e.s.color}">${fmt(e.v)}</tspan>`, 14, INK); });
  }
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
// 가로 막대: items [{label,color,v}], 값은 오른쪽 고정 열, 음수가 있으면 0을 축으로
function barChart(items, { W = 580, row = 36, lab = 140, valW = 84, fmt = v => nf(v), colorFn = null } = {}){
  W = fitW(W); if (PHONE()){ lab = Math.min(lab, 104); valW = Math.min(valW, 66); row = Math.min(row, 32); }
  if (!items.length) return '<p class="empty">데이터 없음</p>';
  const vs = items.map(x => x.v), lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), span = (hi - lo) || 1, A = W - lab - valW - 10;
  const x0 = lab + (0 - lo) / span * A;
  let g = `<line x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="2" y2="${row * items.length - 2}" stroke="#B4BFCF"/>`;
  items.forEach((it, i) => {
    const y = i * row, x1 = lab + (Math.min(it.v, 0) - lo) / span * A, w = Math.abs(it.v) / span * A, c = colorFn ? colorFn(it.v) : it.color;
    const lb = PHONE() && it.label.length > 7 ? it.label.slice(0, 6) + "…" : it.label;
    g += T(0, y + row / 2 + 5, esc(lb), PHONE() ? 13.5 : 15, INK) + `<rect x="${x1.toFixed(1)}" y="${y + 8}" width="${Math.max(w, 2).toFixed(1)}" height="${row - 16}" rx="3" fill="${c}"/>` + T(W - 2, y + row / 2 + 5, fmt(it.v), 15, colorFn ? c : INK, "end", 700);
  });
  return `<svg width="100%" viewBox="0 0 ${W} ${row * items.length}" role="img">${g}</svg>`;
}
// 세로 막대: vals, labels, 마지막 막대 강조
function colChart(vals, labels, { W = 580, H = 220, colors = null, fmt = v => nf(v), subs = null, hi = null } = {}){
  W = fitW(W); if (PHONE()) H = Math.min(H, 200);
  if (PHONE() && vals.length > 8) labels = labels.map((l, i) => i % 2 === (vals.length - 1) % 2 ? l : "");
  const n = vals.length; if (!n) return '<p class="empty">데이터 없음</p>';
  const top = Math.max(...vals.map(v => Math.abs(v || 0))) || 1, bw = W / n * .6, base = H - (subs ? 46 : 28);
  let g = "";
  vals.forEach((v, i) => {
    const cx = W / n * (i + .5), h = Math.abs(v || 0) / top * (base - 28), c = colors ? colors[i] : (i === n - 1 ? "#2B5CA8" : "#C3CEDF");
    g += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${c}"/>`;
    g += T(cx, base - h - 7, fmt(v), 14, INK, "middle", i === (hi ?? n - 1) ? 700 : 400) + T(cx, base + 18, esc(labels[i]), 13, MU, "middle");
    if (subs) g += T(cx, base + 38, subs[i] ?? "", 13.5, subs[i]?.startsWith?.("+") ? UP : subs[i]?.startsWith?.("−") ? DN : MU, "middle", 600);
  });
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
// 작은 추이선
function spark(vals, color, { W = 120, H = 30, dots = false } = {}){
  const v = vals.filter(x => x != null); if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), sp = (hi - lo) || 1;
  const pts = v.map((x, i) => [3 + i * (W - 6) / (v.length - 1), H - 4 - (x - lo) / sp * (H - 8)]);
  const d = dots ? pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}"/>`).join("") : `<circle cx="${pts.at(-1)[0].toFixed(1)}" cy="${pts.at(-1)[1].toFixed(1)}" r="2.6" fill="${color}"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="vertical-align:middle" aria-hidden="true"><polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>${d}</svg>`;
}
// 산점도: pts [{label,color,x,y,r,sub}]
function scatter(pts, { W = 1200, H = 380, xl = "", yl = "", xMax = null } = {}){
  W = fitW(W); if (PHONE()) H = 320;
  if (pts.length < 2) return '<p class="empty">비교할 회사가 부족합니다</p>';
  const L = 60, B = 58, Tp = 24, R = 30;
  const xm = xMax || Math.ceil(Math.max(...pts.map(p => p.x)) / 10) * 10 + 5;
  const yv = pts.map(p => p.y), ylo = Math.min(-10, Math.floor(Math.min(...yv) / 10) * 10), yhi = Math.max(10, Math.ceil(Math.max(...yv) / 10) * 10);
  const X = v => L + v / xm * (W - L - R), Y = v => Tp + (yhi - v) / (yhi - ylo) * (H - Tp - B);
  let g = niceTicks(ylo, yhi, 4).map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${v === 0 ? "#9AA5B5" : GR}"/>` + T(L - 10, Y(v) + 4, fmtPctTick(v), 13, MU, "end")).join("");
  g += niceTicks(0, xm, 6).map(v => T(X(v), H - 32, `${v}%`, 13, MU, "middle")).join("");
  pts.forEach(p => {
    const right = X(p.x) > W * .7, lx = right ? X(p.x) - p.r - 8 : X(p.x) + p.r + 8, an = right ? "end" : "start";
    g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.r.toFixed(1)}" fill="${p.color}" fill-opacity=".85"/>` + T(lx, Y(p.y) - 2, esc(p.label), 15, INK, an, 700) + (p.sub && !PHONE() ? T(lx, Y(p.y) + 16, esc(p.sub), 13, MU, an) : "");
  });
  g += T((W + L) / 2, H - 6, xl, 13.5, MU, "middle") + T(L, 14, yl, 13, MU);
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/* ---------- 라우팅 · 헤더 ---------- */
const S = { menu: "insight", field: lsGet(LS.field) || "hff", ui: {} };
function parseHash(){
  const [m, f] = location.hash.replace(/^#\/?/, "").split("/");
  if (MENUS.some(x => x[0] === m)) S.menu = m;
  if (FIELDS.some(x => x[0] === f)) S.field = f;
}
const href = (menu, field, view = VIEW) => `${view === VIEW ? "" : `../${view}/`}#${menu}/${field}`;
function header(){
  const nav = MENUS.map(([k, l]) => `<a href="${href(k, S.field)}"${k === S.menu ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const fsw = FIELDS.map(([k, l]) => `<a href="${href(S.menu, k)}"${k === S.field ? ' aria-current="true"' : ""}>${l}</a>`).join("");
  const vw = [["summary", "요약"], ["detail", "상세"]].map(([k, l]) => `<a href="${href(S.menu, S.field, k)}"${k === VIEW ? ' aria-current="true"' : ""} data-view="${k}">${l}</a>`).join("");
  return `<div class="hd"><span class="brand">경쟁사 모니터</span><nav class="nav" aria-label="메뉴">${nav}</nav>
    <div class="sw fsw" role="group" aria-label="분야">${fsw}</div><div class="hd-r"><div class="sw view" role="group" aria-label="보기">${vw}</div></div></div>`;
}
let PAGES = {};
async function render(){
  parseHash(); lsSet(LS.field, S.field); lsSet(LS.view, VIEW);
  $("hdr").innerHTML = header();
  const F = fieldCtx(S.field);
  document.title = `${MENUS.find(m => m[0] === S.menu)[1]} · ${F.name} — 경쟁사 모니터`;
  let body;
  try { body = await PAGES[S.menu](F, S.ui); } catch (e) { console.error(e); body = `<div class="card empty">화면을 그리지 못했습니다</div>`; }
  $("main").innerHTML = freshness(F) + body;
}
// 화면 안 전환 버튼: <button data-ui="key=value">
document.addEventListener("click", e => {
  const b = e.target.closest("[data-ui]"); if (!b) return;
  const [k, v] = b.dataset.ui.split("="); S.ui[k] = v; render();
});
async function start(pages){
  PAGES = pages;
  $("main").innerHTML = '<div class="empty">불러오는 중…</div>';
  await loadBase();
  addEventListener("hashchange", () => { S.ui = {}; render(); });
  let ph = PHONE(); addEventListener("resize", () => { if (PHONE() !== ph){ ph = PHONE(); render(); } });
  render();
}
