/* 경쟁사 모니터(메인): 데이터 읽기, 경로·메뉴·분야 라우팅, 헤더, 갱신 현황, 숫자·그래프 도우미
   경로: /#<메뉴>/<분야>   보관본 /v1/   월간 리포트 /report/
   메뉴: insight · quotes · finance · market · news   분야: core(핵심 경쟁사, biz) · hff · microbiome */
"use strict";
const VIEW = "summary";
// 사이트 뿌리 = 이 파일(assets/core.js)의 상위 폴더 — 어느 주소에서 열어도 같은 데이터
const SITE = new URL("..", document.currentScript.src).href;
const DATA = SITE + "data/", CONF = SITE + "config/";
const MENUS = [["insight", "홈"], ["quotes", "시세"], ["finance", "재무"], ["market", "시장"], ["news", "공시·기사"]];
const FIELDS = [["core", "핵심 경쟁사", "biz"], ["hff", "건강기능식품", "hff"], ["microbiome", "마이크로바이옴", "microbiome"]];
const MARKET_OF = { core: "hff", hff: "hff", microbiome: "microbiome" };
const LS = { view: "cm2-view", field: "cm2-field", ofs: "cm2-ofs" };
// 회사 색: assets/colors.js (기존 화면과 같은 색)
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
// 다음 갱신: 매시(평일 08:07~20:07) · 전체 수집(평일 08:30·16:40, 화~토 06:40)
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
  // 별도 재무제표(S.ofs): 별도 값(c.alt)이 있는 회사만 바꿈. 연결이 없는 회사는 본래 별도 그대로. 부문 주석은 연결 기준이라 뺌
  const cos = g.companies.map((c, i) => { const x = { ...c, listed: c.listed ?? !!c.ticker, color: coColor(c.id, i) }, A = S.ofs && c.alt?.annual ? c.alt : null;
    if (A){ x.annual = A.annual; if (A.quarterly !== undefined) x.quarterly = A.quarterly; x.sga = A.sga || null; x.segment = null; }
    return x; });
  return { id: f[0], name: f[1], gid: f[2], g, cos, mk: (D.market?.groups || {})[MARKET_OF[f[0]]] || {} };
}
const isKR = c => /\.(KQ|KS)$/.test(c.ticker || "");
const coLabel = (c, extra = "") => `<span class="co"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}${extra}</span>`;
// 오늘 등락: 장중이면 지연 시세, 아니면 최근 종가 기준
function quoteToday(c){
  const q = c.quote || {}, L = D.live?.quotes?.[c.id], t = todayKST();
  const live = !!(L && L.ts?.slice(0, 10) === t && t > (q.asOf || ""));
  // 현재가·전일 종가(숫자 확인용): 장중이면 실시간, 아니면 마지막 종가와 그 전날 종가
  const P = c.price || {}, k = (P.dates || []).lastIndexOf(q.asOf);
  const prev = live ? L.prev : k > 0 ? P.close[k - 1] : null;
  return { chg: live ? L.chg : q.change1d, cap: live && L.mcap ? L.mcap : q.marketCap, live, ts: live ? L.ts : null, asOf: q.asOf,
           price: live ? L.price : q.price, prev, cur: q.currency || "KRW" };
}
function marketChg(mk = "KQ"){
  const L = D.live?.index?.[mk];
  if (L && L.ts?.slice(0, 10) === todayKST()) return { chg: L.chg, live: true, ts: L.ts, close: L.close, prev: L.prev };
  const s = D.index?.[mk]; if (!s?.dates?.length) return { chg: null };
  const n = s.dates.length; return { chg: n > 1 ? (s.close[n - 1] / s.close[n - 2] - 1) * 100 : null, day: s.dates[n - 1], close: s.close[n - 1], prev: n > 1 ? s.close[n - 2] : null };
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
// 머리 아래 한 줄: 이용 안내 · 별도 재무제표 (기준 시각은 각 제목 옆에 표시)
function freshness(F){
  return `<div class="fresh"><span class="fr"><button type="button" class="ib" data-intro>이용 안내</button><button type="button" class="fsb" data-ofs aria-pressed="${S.ofs}" title="재무 숫자를 별도 재무제표로 (기본 연결)">별도 재무제표<i aria-hidden="true"></i></button></span></div>`;
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
const sgn = (v, d = 1, suf = "%") => v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}${suf}`;
const ymd = s => s ? s.slice(0, 10).replace(/-/g, ".") : "";
// 숫자 확인 칸: 그래프 위 투명 영역. 마우스를 올리거나 누르면 data-tip 내용이 뜸
// lines: 첫 줄 = 제목, 나머지 "이름\t값"
const tipA = lines => ` data-tip="${esc(lines.filter(x => x != null && x !== "").join("\n"))}"`;
const hit = (x, y, w, h, lines, gx) => `<rect class="hit" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, 1).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}"${tipA(lines)}${gx != null ? ` data-gx="${gx.toFixed(1)}"` : ""}/>`;

// 여러 선: series [{name,color,vals,raw?}] (같은 길이), 오른쪽 끝에 이름·값
// xs: 각 점의 날짜(YYYY-MM-DD) — 있으면 아래 날짜 눈금과 점마다 숫자 확인
// rawFmt: raw 값(예: 종가) 표시 형식
function lineChart(series, { W = 1200, H = 360, fmt = fmtPctTick, zero = true, labels = true, labelW = 180, xs = null, rawFmt = null, tipFmt = null } = {}){
  W = fitW(W); if (PHONE()){ labelW = Math.min(labelW, 118); H = Math.min(H, labels ? 300 : 150); }
  const L = 52, R = labels ? labelW : 12, Tp = 10, B = xs ? 28 : 24;
  const all = series.flatMap(s => s.vals).filter(v => v != null); if (!all.length) return '<p class="empty">데이터 없음</p>';
  let lo = Math.min(...all, zero ? 0 : Infinity), hi = Math.max(...all, zero ? 0 : -Infinity); const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
  const n = Math.max(...series.map(s => s.vals.length)), X = i => L + i * (W - L - R) / Math.max(1, n - 1), Y = v => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
  let g = niceTicks(lo, hi).map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${v === 0 && zero ? "#9AA5B5" : GR}"/>` + T(L - 8, Y(v) + 4, fmt(v), 12.5, MU, "end")).join("");
  if (xs?.length) [0, Math.floor((n - 1) / 2), n - 1].forEach((i, k) => { if (xs[i]) g += T(X(i), H - 8, md(xs[i]), 12.5, MU, ["start", "middle", "end"][k]); });
  g += `<line class="guide" x1="-9" x2="-9" y1="${Tp}" y2="${H - B}" stroke="#8C98AB" stroke-dasharray="3 3" style="display:none"/>`;
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
  if (xs?.length){
    const cw = (W - L - R) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++){
      const rows = series.filter(s => s.vals[i] != null).sort((a, b) => b.vals[i] - a.vals[i])
        .map(s => tipFmt ? tipFmt(s, i) : `${s.name}\t${s.raw && rawFmt ? rawFmt(s.raw[i]) + "  " : ""}${fmt(s.vals[i])}`);
      if (rows.length) g += hit(X(i) - cw / 2, Tp, cw, H - Tp - B, [ymd(xs[i]), ...rows], X(i));
    }
  }
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
// 가로 막대(HTML): items [{label,color,v,tip?}] — 회사명 · 막대 · 값(막대 끝에 붙임)
// 화면이 넓어도 막대가 늘어나지 않게 최대 폭(.hb max-width)을 둠. 음수가 있으면 0을 축으로
// dot: 막대 대신 점(같은 축 위 위치 비교), ref: {v, label} 기준선(예: 중앙값)
function barChart(items, { lab = 140, fmt = v => nf(v), colorFn = null, dot = false, ref = null } = {}){
  if (!items.length) return '<p class="empty">데이터 없음</p>';
  const vs = items.map(x => x.v).concat(ref ? [ref.v] : []), mn = Math.min(...vs), mx = Math.max(...vs), pd = (mx - mn) * .08 || Math.abs(mx) * .1 || 1;
  // 점 그래프는 0에서 시작하지 않고 값 범위만(위치 비교가 목적)
  const lo = dot ? mn - pd : Math.min(0, mn), hi = dot ? mx + pd : Math.max(0, mx), span = (hi - lo) || 1;
  const P = v => (v - lo) / span * 100, z = P(0), neg = lo < 0;
  const rows = items.map(it => {
    const c = colorFn ? colorFn(it.v) : it.color, a = P(Math.min(it.v, 0)), b = P(Math.max(it.v, 0)), e = P(it.v);
    const mark = dot ? `<i class="hb-d" style="left:${e.toFixed(2)}%;background:${c}"></i>` : `<i class="hb-b" style="left:${a.toFixed(2)}%;width:${Math.max(b - a, .6).toFixed(2)}%;background:${c}"></i>`;
    const vpos = it.v < 0 && !dot ? `right:calc(${(100 - a).toFixed(2)}% + 7px)` : `left:calc(${(dot ? e : b).toFixed(2)}% + ${dot ? 11 : 7}px)`;
    return `<div class="hb-r"${tipA(it.tip || [it.label, `값\t${fmt(it.v)}`])}><span class="hb-l">${esc(it.label)}</span><span class="hb-t">${mark}<b class="hb-v" style="${vpos};color:${colorFn ? c : "var(--ink)"}">${fmt(it.v)}</b></span></div>`;
  }).join("");
  const refL = ref ? `<span class="hb-ref" style="left:${P(ref.v).toFixed(2)}%"><em>${esc(ref.label)}</em></span>` : "";
  return `<div class="hb${neg ? " neg" : ""}${dot ? " hbdot" : ""}" style="--lab:${lab}px;--z:${z.toFixed(2)}%;--refh:${items.length * 34 + 4}px">${rows}${refL ? `<div class="hb-rr"><span></span><span class="hb-t">${refL}</span></div>` : ""}</div>`;
}
// 세로 막대: vals, labels, 마지막 막대 강조. tips: 막대별 확인 내용(없으면 값·직전 대비)
function colChart(vals, labels, { W = 580, H = 220, colors = null, fmt = v => nf(v), subs = null, hi = null, tips = null, unit = "" } = {}){
  W = fitW(W); if (PHONE()) H = Math.min(H, 200);
  const full = labels.slice();
  if (PHONE() && vals.length > 8) labels = labels.map((l, i) => i % 2 === (vals.length - 1) % 2 ? l : "");
  const n = vals.length; if (!n) return '<p class="empty">데이터 없음</p>';
  const top = Math.max(...vals.map(v => Math.abs(v || 0))) || 1, bw = W / n * .6, base = H - (subs ? 46 : 28);
  let g = "";
  vals.forEach((v, i) => {
    const cx = W / n * (i + .5), h = Math.abs(v || 0) / top * (base - 28), c = colors ? colors[i] : (i === n - 1 ? "#2B5CA8" : "#C3CEDF");
    g += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${c}"/>`;
    g += T(cx, base - h - 7, fmt(v), 14, INK, "middle", i === (hi ?? n - 1) ? 700 : 400) + T(cx, base + 18, esc(labels[i]), 13, MU, "middle");
    if (subs) g += T(cx, base + 38, subs[i] ?? "", 13.5, subs[i]?.startsWith?.("+") ? UP : subs[i]?.startsWith?.("−") ? DN : MU, "middle", 600);
    const pv = i ? vals[i - 1] : null;
    g += hit(W / n * i, 0, W / n, H, tips?.[i] || [full[i], `값\t${fmt(v)}${unit}`, pv != null && v != null ? `직전 ${full[i - 1]}\t${fmt(pv)}${unit} → ${sgn(growth(v, pv))}` : null]);
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
// 산점도: pts [{label,color,x,y,r,sub,tip?}]
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
    g += `<circle class="pt" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${Math.max(p.r, 12).toFixed(1)}" fill="${p.color}" fill-opacity="${p.r >= 12 ? .85 : 0}"${tipA(p.tip || [p.label, `x\t${p.x.toFixed(1)}%`, `y\t${sgn(p.y)}`])}/>`
      + (p.r < 12 ? `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.r.toFixed(1)}" fill="${p.color}" fill-opacity=".85" pointer-events="none"/>` : "")
      + T(lx, Y(p.y) - 2, esc(p.label), 15, INK, an, 700) + (p.sub && !PHONE() ? T(lx, Y(p.y) + 16, esc(p.sub), 13, MU, an) : "");
  });
  g += T((W + L) / 2, H - 6, xl, 13.5, MU, "middle") + T(L, 14, yl, 13, MU);
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/* ---------- 숫자 확인(툴팁) · 펼치는 표 ---------- */
let tipOn = null;
function showTip(el, x, y){
  const t = $("tip"); if (!t) return;
  const L = el.dataset.tip.split("\n");
  t.innerHTML = `<b class="tt">${esc(L[0])}</b>` + L.slice(1).map(l => { const [a, b] = l.split("\t"); return b == null ? `<div>${esc(a)}</div>` : `<div class="tr"><span>${esc(a)}</span><b>${esc(b)}</b></div>`; }).join("");
  t.hidden = false;
  const r = t.getBoundingClientRect(); let left = x + 14, top = y + 16;
  if (left + r.width > innerWidth - 8) left = Math.max(8, x - r.width - 14);
  if (top + r.height > innerHeight - 8) top = Math.max(8, y - r.height - 14);
  t.style.left = left + "px"; t.style.top = top + "px";
  if (tipOn && tipOn !== el) unmark(tipOn);
  tipOn = el; el.classList.add("on");
  const gl = el.ownerSVGElement?.querySelector(".guide");
  if (gl && el.dataset.gx){ gl.setAttribute("x1", el.dataset.gx); gl.setAttribute("x2", el.dataset.gx); gl.style.display = ""; }
}
function unmark(el){ el.classList.remove("on"); const gl = el.ownerSVGElement?.querySelector(".guide"); if (gl) gl.style.display = "none"; }
function hideTip(){ const t = $("tip"); if (t) t.hidden = true; if (tipOn) unmark(tipOn); tipOn = null; }
document.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest?.("[data-tip]");
  if (el) showTip(el, e.clientX, e.clientY); else if (tipOn) hideTip();
});
// 누르기(휴대폰): 그 자리에 고정, 다른 곳을 누르면 닫힘
document.addEventListener("click", e => {
  const el = e.target.closest("[data-tip]");
  if (el){ e.preventDefault(); showTip(el, e.clientX, e.clientY); }
  else if (!e.target.closest("#tip")) hideTip();
});
addEventListener("scroll", () => { if (tipOn) hideTip(); }, { passive: true });

// 숫자 표: heads [제목], rows [[칸]] — 휴대폰에서는 회사별 카드로 바뀜(data-l = 칸 이름). keep = 연도 열 표처럼 표 그대로
const plain = s => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function tbl(heads, rows, foot = "", keep = false){
  return `<div class="tw${keep ? " keep" : ""}"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
    rows.map(r => `<tr${r.cls ? ` class="${r.cls}"` : ""}>${r.map((c, i) => `<td data-l="${esc(plain(heads[i] || ""))}">${c ?? "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${foot ? `<p class="note">${foot}</p>` : ""}`;
}
// 카드 아래 '숫자 보기' 펼치기 — 펼친 상태는 화면을 다시 그려도 유지
const OPEN = new Set();
const fold = (key, label, inner) => `<details class="fold" data-fold="${esc(key)}"${OPEN.has(key) ? " open" : ""}><summary>${label}</summary><div class="fold-b">${inner}</div></details>`;
document.addEventListener("toggle", e => { const d = e.target; if (d.dataset?.fold) d.open ? OPEN.add(d.dataset.fold) : OPEN.delete(d.dataset.fold); }, true);

/* ---------- 라우팅 · 헤더 ---------- */
const S = { menu: "insight", field: lsGet(LS.field) || "hff", ui: {}, ofs: lsGet(LS.ofs) === "1" };
// 재무 기준 표시: 별도 스위치를 켜면 '별도', 아니면 '연결' (본래 별도만 있는 회사는 표·팝업에 따로 표시)
const basisLbl = () => S.ofs ? "별도" : "연결";
function parseHash(){
  const h = location.hash.replace(/^#\/?/, "");
  // 예전 메인(v1) 탭 주소: #biz · #biz-x · #hff · #microbiome → 같은 분야 인사이트
  const OLD = { "biz": "core", "biz-x": "core", "hff": "hff", "microbiome": "microbiome" };
  if (OLD[h]){ S.menu = "insight"; S.field = OLD[h]; history.replaceState(null, "", `#insight/${S.field}`); return; }
  const [m, f] = h.split("/");
  if (MENUS.some(x => x[0] === m)) S.menu = m;
  if (FIELDS.some(x => x[0] === f)) S.field = f;
}
// 상세 = v1 보관본의 맞는 탭 (아직 Beta에 없는 표: 판관비, 시장 세부)
const FIELD_TAB = { core: "biz", hff: "hff", microbiome: "microbiome" };
const LEGACY = (menu, field) => field === "core" ? (menu === "quotes" || menu === "news" ? "biz" : "biz-x") : field;
const href = (menu, field, view = VIEW) => view === "detail" ? `${SITE}v1/#${LEGACY(menu, field)}` : `#${menu}/${field}`;
function header(){
  const ICON = { insight: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>', quotes: '<path d="M4 19V5M4 19h16M7 15l4-4 3 3 5-6"/>',
    finance: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>', market: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>',
    news: '<path d="M5 5h11v14H6a2 2 0 0 1-2-2V8h1M16 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/>' };
  const SHORT = { insight: "홈", quotes: "주가", finance: "실적", market: "시장", news: "기사" };
  const nav = MENUS.map(([k, l]) => `<a href="${href(k, S.field)}"${k === S.menu ? ' aria-current="page"' : ""}><svg class="ni" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg><span class="nl">${l}</span><span class="ns">${SHORT[k]}</span></a>`).join("");
  const fsw = FIELDS.map(([k, l]) => `<a href="${href(S.menu, k)}"${k === S.field ? ' aria-current="true"' : ""}>${l}</a>`).join("");
  // 오른쪽: 경쟁사 실적 리포트(기존 보고서 화면, 분야에 맞는 탭)
  const rep = `<a class="rep" href="${SITE}report/" title="월간 경쟁사 리포트"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/></svg><span class="rl">경쟁사 실적 리포트</span><span class="rs">리포트</span></a>`;
  return `<div class="hd"><a class="brand" href="#insight/${S.field}">경쟁사 모니터</a><nav class="nav" aria-label="메뉴">${nav}</nav>
    <div class="sw fsw" role="group" aria-label="분야">${fsw}</div><div class="hd-r">${rep}</div></div>`;
}
let PAGES = {};
async function render(){
  parseHash(); lsSet(LS.field, S.field); lsSet(LS.view, VIEW);
  $("hdr").innerHTML = header();
  const F = fieldCtx(S.field);
  document.title = `${MENUS.find(m => m[0] === S.menu)[1]} · ${F.name} — 경쟁사 모니터`;
  let body;
  try { body = await PAGES[S.menu](F, S.ui); } catch (e) { console.error(e); body = `<div class="card empty">화면을 그리지 못했습니다</div>`; }
  hideTip(); $("main").innerHTML = freshness(F) + body;
  requestAnimationFrame(balanceCols);
}
/* ---------- 이용 안내: 처음 방문 때 한 번 자동, 이후 '이용 안내' 버튼 ---------- */
const INTRO_KEY = "cm2-intro-v1";
function openIntro(){
  let d = $("intro");
  if (!d){ d = document.createElement("dialog"); d.id = "intro"; d.setAttribute("aria-labelledby", "introTitle"); document.body.appendChild(d); }
  const upd = D.meta?.updatedAt ? (() => { const k = KST(D.meta.updatedAt).toISOString(); return `${k.slice(0, 10).replace(/-/g, ". ")} ${k.slice(11, 16)}`; })() : "–";
  // 숫자는 수집 데이터에서 바로 계산 (회사 수·기사 수·갱신 시각)
  const nCo = allCos().size, cov = D.newsfx?.coverage || {}, live = D.live?.updatedAt ? mdh(D.live.updatedAt) : upd;
  const ST = [[`${nCo}개사`, "모니터링 경쟁사"], ["3개 분야", "핵심·건기식·마이크로바이옴"], [cov.articles ? `${nf(cov.articles)}건` : "–", "기사 2년 누적"], [live, "최근 갱신"]];
  const FL = [["수집·분석", "KRX · OpenDART · 뉴스 · 시장 조사", "평일 매시 자동"]];
  d.innerHTML = `<div class="in-hero"><span class="in-k">COMPETITOR MONITOR</span><h2 id="introTitle">경쟁사 동향을 한 화면에서</h2><p>건강기능식품·마이크로바이옴 경쟁사의 주가·재무·시장·보도</p></div>
    <div class="in-in">
      <p class="in-sh">취합 데이터 현황</p>
      <div class="in-st">${ST.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <p class="in-sh">운영 방식</p>
      <div class="in-fl">${FL.map(([t, a, b], i) => `<div class="in-f"><i>${i + 1}</i><b>${t}</b><span>${a}</span><em>${b}</em></div>`).join('<span class="in-ar" aria-hidden="true"></span>')}<span class="in-ar" aria-hidden="true"></span>
        <div class="in-out"><div class="in-o"><i>2</i><b>대시보드</b><span>숫자 확인</span><em>상시 · 자동 갱신</em></div>
          <a class="in-o rp" href="${SITE}report/"><i>3</i><b>월간 리포트 ›</b><span>인사이트·해석</span><em>매월 · 기준일 고정</em></a></div></div>
      <div class="in-foot"><small>공개 자료 기반 · 투자 판단의 근거로 사용하지 마십시오</small><button type="button" class="in-go" data-intro-x>시작하기</button></div></div>`;
  d.showModal();
  lsSet(INTRO_KEY, "1");
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-intro]")){ openIntro(); return; }
  const d = $("intro"); if (d?.open && (e.target === d || e.target.closest("[data-intro-x]"))) d.close();
});

/* ---------- 좌우 열 끝 맞추기 (웹 화면 홈) ----------
   짧은 열 안의 늘릴 수 있는 그래프(data-grow, GROW[키] = 높이 → 그래프)를 모자란 만큼 키우고, 남는 차이는 마지막 카드가 늘어나 흡수 */
let GROW = {};
function balanceCols(){
  if (PHONE()) return;
  document.querySelectorAll(".g2.home").forEach(g => {
    const cols = [...g.children]; if (cols.length !== 2) return;
    const h = c => [...c.children].reduce((t, x) => t + x.offsetHeight, 0) + (c.children.length - 1) * 18;
    g.classList.add("measure");   // 늘어나기 전 원래 높이로 비교
    const [a, b] = cols.map(h), short = a < b ? cols[0] : cols[1], gap = Math.abs(a - b);
    g.classList.remove("measure");
    if (gap < 24) return;
    const el = [...short.querySelectorAll("[data-grow]")].find(x => GROW[x.dataset.grow]); if (!el) return;
    const f = GROW[el.dataset.grow], svg = el.querySelector("svg"); if (!svg) return;
    const vb = svg.viewBox.baseVal, scale = vb.width / svg.getBoundingClientRect().width || 1;
    el.innerHTML = f(Math.min(vb.height + gap * scale, vb.height + 320));
  });
}
addEventListener("toggle", e => { if (e.target.dataset?.fold) requestAnimationFrame(() => { GROW_RESET(); }); }, true);
function GROW_RESET(){ document.querySelectorAll(".g2.home [data-grow]").forEach(el => { const f = GROW[el.dataset.grow]; if (f && el.dataset.h0) el.innerHTML = f(+el.dataset.h0); }); requestAnimationFrame(balanceCols); }
// 화면 안 전환 버튼: <button data-ui="key=value">
document.addEventListener("click", e => {
  const b = e.target.closest("[data-ui]"); if (!b) return;
  const [k, v] = b.dataset.ui.split("="); S.ui[k] = v; if (k !== "lim") delete S.ui.lim; render();
});
// 연결 ↔ 별도 (모든 메뉴·분야 공통, 이 브라우저에 기억)
document.addEventListener("click", e => {
  if (!e.target.closest("[data-ofs]")) return;
  S.ofs = !S.ofs; lsSet(LS.ofs, S.ofs ? "1" : "0");
  const d = $("coPop"); if (d?.open) d.close();
  render();
});
// 화면 안 선택 상자: <select data-uisel="key"> — 회사·유형 등을 바꾸면 '더 보기'는 처음으로
document.addEventListener("change", e => {
  const t = e.target.closest?.("[data-uisel]"); if (!t) return;
  S.ui[t.dataset.uisel] = t.value; delete S.ui.lim; render();
});
async function start(pages){
  PAGES = pages;
  $("main").innerHTML = '<div class="empty">불러오는 중…</div>';
  await loadBase();
  addEventListener("hashchange", () => { S.ui = {}; render(); });
  if (!lsGet(INTRO_KEY)) setTimeout(openIntro, 400);
  let ph = PHONE(); addEventListener("resize", () => { if (PHONE() !== ph){ ph = PHONE(); render(); } });
  render();
}

/* ---------- 관리자 모드: 브랜드명을 길게 누르면 ----------
   일자별 시가총액(이 브라우저에 저장한 '시총 복사 목록' 기준, v1과 같은 계산) · v1 보관본 이동
   회사 목록은 localStorage(cm-labels-v2.cap)에만 — 저장소·사이트에는 올리지 않음 */
const SITE_ROOT = SITE;
const LABELS_KEY = "cm-labels-v2";
const readLabels = () => { try { return JSON.parse(localStorage.getItem(LABELS_KEY) || "{}") || {}; } catch (e) { return {}; } };
function allCos(){ const m = new Map(); ["biz", "hff", "microbiome"].forEach(g => (D[g]?.companies || []).forEach(c => { if (!m.has(c.id)) m.set(c.id, c); })); return m; }
function capSecs(L){ const all = allCos();
  return (L.cap || []).map(x => ({ title: x.title || "", items: (x.ids || []).map(id => all.get(id)).filter(c => c && c.ticker) })).filter(x => x.items.length); }
function capRows(day, secs){
  // day 당일 값이 없으면 그 이전 가장 가까운 거래일 (휴장·미반영 대비)
  const out = [];
  secs.forEach(sec => {
    if (sec.title || out.length) out.push({ title: sec.title, sec: true });
    sec.items.forEach(c => { const p = c.price; let i = -1;
      if (p?.mcap) for (let k = p.dates.length - 1; k >= 0; k--) if (p.dates[k] <= day){ i = k; break; }
      out.push({ c, code: c.ticker.slice(0, 6), mcap: i < 0 ? null : p.mcap[i], d: i < 0 ? null : p.dates[i] }); });
  });
  return out;
}
const capText = L => { const all = allCos(); return (L.cap || []).map(x => [x.title ? "# " + x.title : null, ...(x.ids || []).map(id => all.get(id)?.name || id)].filter(v => v != null).join("\n")).join("\n"); };
function parseCap(text){
  const listed = [...allCos().values()].filter(c => c.ticker), out = [], miss = [], norm = v => v.replace(/\s/g, "").toLowerCase();
  text.split("\n").map(v => v.trim()).filter(Boolean).forEach(v => {
    if (v.startsWith("#")){ out.push({ title: v.replace(/^#+\s*/, ""), ids: [] }); return; }
    const c = listed.find(x => norm(x.name) === norm(v) || x.ticker.slice(0, 6) === v.replace(/\D/g, ""));
    if (!c){ miss.push(v); return; }
    if (!out.length) out.push({ title: "", ids: [] });
    out.at(-1).ids.push(c.id);
  });
  return { cap: out.filter(x => x.ids.length), miss };
}
function admRender(day){
  const L = readLabels(), secs = capSecs(L), n = secs.reduce((t, x) => t + x.items.length, 0);
  const dates = [...new Set(secs.flatMap(x => x.items).filter(c => c.price?.mcap).flatMap(c => c.price.dates))].sort();
  const inp = $("admDate"); if (dates.length){ inp.min = dates[0]; inp.max = dates.at(-1); if (!day) inp.value = dates.at(-1); }
  $("admCopy").disabled = !dates.length;
  $("admHint").textContent = n ? `${n}개사 · 저장한 목록 기준 · 당일 값이 없으면 직전 거래일` : "";
  if (!n){ $("admCap").innerHTML = '<p class="empty">아래 목록을 저장하면 표시됩니다</p>'; return; }
  const out = []; capRows(inp.value, secs).forEach(r => { if (r.sec || !out.length) out.push({ title: r.sec ? r.title : "", rows: [] }); if (!r.sec) out.at(-1).rows.push(r); });
  $("admCap").innerHTML = out.filter(x => x.rows.length).map(x => `<div class="cap-sec">${x.title ? `<h3>${esc(x.title)}</h3>` : ""}<table><tbody>${x.rows.map(r =>
    `<tr><td>${esc(r.c.name)} <span class="dim">${esc(r.code)}</span></td><td>${r.mcap == null ? "–" : big(r.mcap)}</td><td class="dim">${r.d ? md(r.d) : "–"}</td></tr>`).join("")}</tbody></table></div>`).join("");
}
function openAdmin(){
  let d = $("adm");
  if (!d){ d = document.createElement("dialog"); d.id = "adm"; d.setAttribute("aria-labelledby", "admTitle"); document.body.appendChild(d); }
  d.innerHTML = `<div class="adm-in"><div class="adm-hd"><h2 id="admTitle">관리자</h2><button class="cp-x" type="button" data-adm-x aria-label="닫기">✕</button></div>
    <div class="adm-links"><a class="adm-go" href="${SITE_ROOT}v1/">v1 보관본 열기<small>Beta 전환 전 화면 그대로</small></a></div>
    <h3>일자별 시가총액 <small id="admHint"></small></h3>
    <div class="adm-tool"><input type="date" id="admDate" aria-label="기준일"><button type="button" class="morebtn" id="admCopy" title="종목(코드)과 시가총액(억원, 원 단위까지)을 엑셀에 붙여넣을 수 있게 복사">시총 복사</button><span class="mu" id="admToast" role="status"></span></div>
    <div class="cap-grid" id="admCap"></div>
    <details class="fold"><summary>목록 편집</summary><div class="fold-b">
      <p class="note" style="margin:0 0 8px">"# 섹션 이름" 줄은 섹션, 나머지는 상장사 이름 또는 6자리 종목코드. 이 브라우저에만 저장됩니다.</p>
      <textarea id="admList" rows="9" spellcheck="false">${esc(capText(readLabels()))}</textarea>
      <div class="adm-tool"><button type="button" class="morebtn" id="admSave">저장</button><span class="mu" id="admErr"></span></div></div></details></div>`;
  d.showModal(); admRender();
  $("admDate").onchange = () => admRender($("admDate").value);
  $("admCopy").onclick = async () => {
    const lines = [["name(ticker)", "market_cap_억원"]];
    capRows($("admDate").value, capSecs(readLabels())).forEach(r => { if (r.sec){ lines.push(["", ""]); if (r.title) lines.push(["▼" + r.title, ""]); return; }
      lines.push([`${r.c.name}(${r.code})`, r.mcap == null ? "" : r.mcap / 1e8]); });
    try { await navigator.clipboard.writeText(lines.map(r => r.join("\t")).join("\n")); $("admToast").textContent = "복사했습니다"; }
    catch (e) { $("admToast").textContent = "복사 실패 — 클립보드 권한을 확인하세요"; }
    setTimeout(() => $("admToast").textContent = "", 2000);
  };
  $("admSave").onclick = () => {
    const { cap, miss } = parseCap($("admList").value);
    if (miss.length){ $("admErr").textContent = `찾을 수 없음(상장사 이름·종목코드): ${miss.join(", ")}`; return; }
    const L = readLabels(); L.cap = cap;
    try { localStorage.setItem(LABELS_KEY, JSON.stringify(L)); $("admErr").textContent = "저장했습니다"; } catch (e) { $("admErr").textContent = "이 브라우저에서는 저장할 수 없습니다"; return; }
    admRender($("admDate").value);
  };
}
document.addEventListener("click", e => { const d = $("adm"); if (d?.open && (e.target === d || e.target.closest("[data-adm-x]"))) d.close(); });
// 길게 누르기(0.7초): 손가락·마우스 모두. 길게 누른 뒤의 클릭(이동)은 막음
(() => {
  let t = null, fired = false;
  const brand = e => e.target.closest?.(".brand");
  document.addEventListener("pointerdown", e => { if (!brand(e)) return; fired = false; clearTimeout(t); t = setTimeout(() => { fired = true; openAdmin(); }, 700); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => document.addEventListener(ev, e => { if (brand(e) || ev !== "pointerleave") clearTimeout(t); }, true));
  document.addEventListener("click", e => { if (brand(e) && fired){ e.preventDefault(); fired = false; } }, true);
  document.addEventListener("contextmenu", e => { if (brand(e)) e.preventDefault(); });
})();
