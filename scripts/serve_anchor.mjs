import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagePath = path.join(__dirname, "..", "assets", "window_letter_nings_anchor_1024.jpg");
const port = Number(process.env.PORT || 3011);

const server = http.createServer((request, response) => {
  if (request.url !== "/window_letter_nings_anchor_1024.jpg") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const stat = fs.statSync(imagePath);
  response.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Content-Length": stat.size,
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(imagePath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Anchor server listening on http://0.0.0.0:${port}/window_letter_nings_anchor_1024.jpg`);
});
