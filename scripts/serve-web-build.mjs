import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? "build/web-mobile-preview");
const port = Number.parseInt(process.env.WEB_PREVIEW_PORT ?? "4173", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("WEB_PREVIEW_PORT must be an integer from 1 to 65535");
}

const contentTypes = new Map([
  [".bin", "application/octet-stream"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".wasm", "application/wasm"],
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const relative = decodeURIComponent(
      requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname,
    );
    const file = path.resolve(root, `.${relative}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      respond(response, 403, "Forbidden");
      return;
    }
    const fileStat = await stat(file);
    if (!fileStat.isFile()) {
      respond(response, 404, "Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": fileStat.size,
      "Content-Type": contentTypes.get(path.extname(file)) ?? "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT") respond(response, 404, "Not found");
    else {
      console.error(error);
      respond(response, 500, "Internal server error");
    }
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function respond(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}
