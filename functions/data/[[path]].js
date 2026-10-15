// Cloudflare Pages Function: /data/* 요청을 R2 보관함(바인딩 DATA)에서 꺼내 준다.
// 수집(Actions)이 끝날 때마다 JSON을 R2에 올리므로, 사이트를 다시 만들지 않아도 화면 숫자가 바로 바뀐다.
// R2에 없는 파일(월간 리포트 호 자료 등)이나 바인딩이 없을 때는 배포된 정적 파일을 그대로 준다.
const TYPES = { json: "application/json; charset=utf-8", jsonl: "application/x-ndjson; charset=utf-8", csv: "text/csv; charset=utf-8" };

export async function onRequestGet({ request, params, env }) {
  const rel = [].concat(params.path || []).join("/");
  if (env.DATA && rel && !rel.includes("..")) {
    const obj = await env.DATA.get("data/" + rel, { onlyIf: request.headers });
    if (obj) {
      const h = new Headers();
      obj.writeHttpMetadata(h);
      h.set("etag", obj.httpEtag);
      h.set("cache-control", "no-cache");   // 브라우저는 매번 확인(바뀌지 않았으면 304)
      h.set("content-type", TYPES[rel.split(".").pop()] || h.get("content-type") || "application/octet-stream");
      return "body" in obj && obj.body ? new Response(obj.body, { headers: h }) : new Response(null, { status: 304, headers: h });
    }
  }
  return env.ASSETS.fetch(request);
}
