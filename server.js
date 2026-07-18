// 정적 파일 서버 (개발용)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3350;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let filePath = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // 확장자 없는 경로는 .html 파일로 폴백 (Cloudflare Pages의 clean URL 동작과 동일)
        if (!path.extname(filePath)) {
          return fs.readFile(filePath + ".html", (err2, data2) => {
            if (err2) {
              res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
              return res.end("Not Found");
            }
            res.writeHead(200, { "Content-Type": MIME[".html"] });
            res.end(data2);
          });
        }
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Not Found");
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
