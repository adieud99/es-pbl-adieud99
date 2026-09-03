import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(rootDirectory, "public");
const configDirectory = path.join(rootDirectory, "config");
const port = Number(process.env.PORT || 3000);
const maximumPageSize = 50;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function readJson(filename) {
  const content = await readFile(path.join(configDirectory, filename), "utf8");
  return JSON.parse(content);
}

function validateAppConfig(config) {
  if (!config || typeof config !== "object") throw new Error("app.config.json의 최상위 값은 객체여야 합니다.");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(config.index || "")) {
    throw new Error("app.config.json의 index가 비어 있거나 올바른 인덱스 이름이 아닙니다.");
  }
  if (!config.resultFields?.title) throw new Error("resultFields.title에 결과 제목 필드를 지정하세요.");
  const requestedSize = Number(config.pageSize || 12);
  config.pageSize = Math.max(1, Math.min(maximumPageSize, Number.isFinite(requestedSize) ? requestedSize : 12));
  return config;
}

function applySearchText(value, searchText) {
  if (Array.isArray(value)) return value.map((item) => applySearchText(item, searchText));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, applySearchText(item, searchText)]));
  }
  if (typeof value === "string") return value.replaceAll("{{searchText}}", searchText);
  return value;
}

function requestElasticsearch(index, body) {
  const baseUrl = new URL(process.env.ES_URL || "https://host.docker.internal:9200");
  const username = process.env.ES_USERNAME || "elastic";
  const password = process.env.ELASTIC_PASSWORD;
  if (!password) throw new Error("BE 환경변수 ELASTIC_PASSWORD가 설정되지 않았습니다.");

  const payload = JSON.stringify(body);
  const transport = baseUrl.protocol === "https:" ? https : http;
  const options = {
    protocol: baseUrl.protocol,
    hostname: baseUrl.hostname,
    port: baseUrl.port,
    method: "POST",
    path: `${baseUrl.pathname.replace(/\/$/, "")}/${encodeURIComponent(index)}/_search`,
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  };
  if (baseUrl.protocol === "https:") {
    options.rejectUnauthorized = process.env.ES_TLS_REJECT_UNAUTHORIZED !== "false";
  }

  return new Promise((resolve, reject) => {
    const request = transport.request(options, (response) => {
      let responseText = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseText += chunk; });
      response.on("end", () => {
        let data;
        try { data = JSON.parse(responseText); } catch { data = { message: responseText }; }
        if ((response.statusCode || 500) >= 400) {
          const reason = data?.error?.root_cause?.[0]?.reason || data?.error?.reason || data?.message || "ES 요청 실패";
          const error = new Error(reason);
          error.statusCode = response.statusCode;
          return reject(error);
        }
        resolve(data);
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error("ES 응답 시간이 10초를 초과했습니다.")));
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

async function serveStatic(requestPath, response) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(publicDirectory, relativePath);
  if (!filePath.startsWith(`${path.resolve(publicDirectory)}${path.sep}`) && filePath !== path.join(publicDirectory, "index.html")) {
    return sendJson(response, 403, { message: "허용되지 않은 경로입니다." });
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    sendJson(response, 404, { message: "파일을 찾을 수 없습니다." });
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      const config = validateAppConfig(await readJson("app.config.json"));
      return sendJson(response, 200, { status: "ok", index: config.index });
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/config") {
      const config = validateAppConfig(await readJson("app.config.json"));
      return sendJson(response, 200, config);
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/search") {
      const searchText = (requestUrl.searchParams.get("q") || "").trim();
      if (!searchText) return sendJson(response, 400, { message: "검색어를 입력하세요." });
      if (searchText.length > 100) return sendJson(response, 400, { message: "검색어는 100자 이하여야 합니다." });

      const config = validateAppConfig(await readJson("app.config.json"));
      const requestTemplate = await readJson("search-request.json");
      const body = applySearchText(requestTemplate, searchText);
      body.size = config.pageSize;
      const result = await requestElasticsearch(config.index, body);
      return sendJson(response, 200, {
        ...result,
        pblRequest: {
          method: "POST",
          path: `/${config.index}/_search`,
          body
        }
      });
    }
    if (request.method === "GET") return serveStatic(requestUrl.pathname, response);
    sendJson(response, 405, { message: "지원하지 않는 요청입니다." });
  } catch (error) {
    const isSyntaxError = error instanceof SyntaxError;
    const statusCode = isSyntaxError ? 500 : (error.statusCode || 500);
    const prefix = isSyntaxError ? "설정 JSON 문법 오류: " : "";
    sendJson(response, statusCode, { message: `${prefix}${error.message}` });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Search app is ready: http://localhost:${port}`);
});
