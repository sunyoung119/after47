// 정적 서버 — 개발용.
//
// file:// 로 열면 fetch가 막혀 data/*.json을 못 읽는다. node 내장 모듈만
// 쓰므로 설치할 것이 없다(윈도우에서도 그대로 돈다).
//
//   node tools/serve.mjs          → http://localhost:5173
//   node tools/serve.mjs 8080     → 포트 지정
//
// 개발용이다. 배포에 쓰지 마라 — 경로 검사 외에 아무 보호도 없다.

import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join, normalize, extname, sep } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel.endsWith("/")) rel += "index.html";

    // 루트 밖으로 나가는 경로를 막는다.
    const abs = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    if (!abs.startsWith(ROOT + sep) && abs !== ROOT) {
      res.writeHead(403).end("403");
      return;
    }
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(`404 ${rel}`);
      console.log(`  404  ${rel}`);
      return;
    }
    const body = await readFile(abs);
    res.writeHead(200, {
      "content-type": MIME[extname(abs).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store", // 개발 중에는 항상 최신을 본다
    });
    res.end(body);
    console.log(`  200  ${rel}`);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(String(e?.message || e));
  }
});

server.listen(PORT, () => {
  console.log(`정적 서버: http://localhost:${PORT}`);
  console.log(`  QR 진입 흉내:  http://localhost:${PORT}/?d=mapo`);
  console.log("  Ctrl+C 로 종료");
});
