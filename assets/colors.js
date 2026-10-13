/* 회사 색 — 기존 화면과 Beta가 함께 씀. 한 회사는 어느 화면·그래프에서나 같은 색 */
"use strict";
const CO_COLORS = {
  // 건강기능식품
  ckdhealth: "#1F4E8C", hpo: "#2B8A7E", acebiome: "#B8892B", esther: "#7083B8", nutri: "#9A5A86", cjwellcare: "#6E8F3A",
  kolmarbnh: "#C0573E", cosmaxnbt: "#C9668A", novarex: "#8C6D3F", suheung: "#5A6B7E", bioneer: "#3E8FB0", herbalife: "#4A3F8C", usana: "#2E9E5B",
  // 마이크로바이옴 (같은 화면에 함께 나오지 않는 회사와는 색이 겹칠 수 있음)
  genome: "#1F4E8C", kobiolabs: "#2B8A7E", hem: "#C9668A", cellbiotech: "#7083B8", cjbs: "#B8892B", bifido: "#6E8F3A", seres: "#C0573E", maat: "#5A6B7E",
};
const CO_PAL = ["#1F4E8C", "#B8892B", "#2B8A7E", "#9A5A86", "#7083B8", "#6E8F3A", "#C0573E", "#3E8FB0", "#8C6D3F", "#C9668A"];
// 어두운 화면에서는 흰색을 30% 섞어 밝게 (항상 #rrggbb 반환 — 뒤에 투명도 두 자리를 붙여 쓰는 곳이 있음)
function coMix(hex, t){
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * t));
  return "#" + ch.map(v => v.toString(16).padStart(2, "0")).join("");
}
function coColor(id, i = 0, dark = false){
  const h = CO_COLORS[id] || CO_PAL[i % CO_PAL.length];
  return dark ? coMix(h, .3) : h;
}
