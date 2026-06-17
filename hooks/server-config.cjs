const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const CLAWD_SERVER_ID = "clawd-on-desk";
const CLAWD_SERVER_HEADER = "x-clawd-server";
const DEFAULT_SERVER_PORT = 23333;
const SERVER_PORTS = Array.from({ length: 5 }, (_, index) => DEFAULT_SERVER_PORT + index);
const STATE_PATH = "/state";
const RUNTIME_CONFIG_PATH = path.join(os.homedir(), ".clawd", "runtime.json");
const DEFAULT_HOOK_HTTP_TIMEOUT_MS = 100;

function normalizePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && SERVER_PORTS.includes(port) ? port : null;
}

function readRuntimePort() {
  try {
    const raw = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_PATH, "utf8"));
    return normalizePort(raw && raw.port);
  } catch {
    return null;
  }
}

function getPortCandidates(preferredPort) {
  const ports = [];
  const seen = new Set();
  const add = (value) => {
    const port = normalizePort(value);
    if (!port || seen.has(port)) return;
    seen.add(port);
    ports.push(port);
  };

  if (Array.isArray(preferredPort)) preferredPort.forEach(add);
  else add(preferredPort);
  add(readRuntimePort());
  SERVER_PORTS.forEach(add);
  return ports;
}

function readHeader(res, headerName) {
  const value = res.headers && res.headers[headerName];
  return Array.isArray(value) ? value[0] : value;
}

function isClawdResponse(res, body) {
  if (readHeader(res, CLAWD_SERVER_HEADER) === CLAWD_SERVER_ID) return true;
  if (!body) return false;
  try {
    const data = JSON.parse(body);
    return data && data.app === CLAWD_SERVER_ID;
  } catch {
    return false;
  }
}

function probePort(port, timeoutMs, callback) {
  const req = http.get(
    { hostname: "127.0.0.1", port, path: STATE_PATH, timeout: timeoutMs },
    (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        if (body.length < 256) body += chunk;
      });
      res.on("end", () => callback(isClawdResponse(res, body)));
    },
  );

  req.on("error", () => callback(false));
  req.on("timeout", () => {
    req.destroy();
    callback(false);
  });
}

function postStateToPort(port, payload, timeoutMs, callback) {
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path: STATE_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    },
    (res) => {
      if (readHeader(res, CLAWD_SERVER_HEADER) === CLAWD_SERVER_ID) {
        res.resume();
        callback(true, port);
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        if (body.length < 256) body += chunk;
      });
      res.on("end", () => callback(isClawdResponse(res, body), port));
    },
  );

  req.on("error", () => callback(false, port));
  req.on("timeout", () => {
    req.destroy();
    callback(false, port);
  });
  req.end(payload);
}

function postStateToRunningServer(body, options = {}, callback = () => {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_HOOK_HTTP_TIMEOUT_MS;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const ports = getPortCandidates(options.preferredPort);
  let index = 0;

  const tryNext = () => {
    if (index >= ports.length) {
      callback(false, null);
      return;
    }

    const port = ports[index++];
    postStateToPort(port, payload, timeoutMs, (posted, confirmedPort) => {
      if (posted) {
        callback(true, confirmedPort);
        return;
      }
      probePort(port, timeoutMs, (ok) => {
        if (!ok) {
          tryNext();
          return;
        }
        postStateToPort(port, payload, timeoutMs, (retried, retriedPort) => {
          if (retried) callback(true, retriedPort);
          else tryNext();
        });
      });
    });
  };

  tryNext();
}

module.exports = {
  CLAWD_SERVER_ID,
  CLAWD_SERVER_HEADER,
  DEFAULT_SERVER_PORT,
  SERVER_PORTS,
  STATE_PATH,
  RUNTIME_CONFIG_PATH,
  postStateToRunningServer,
};
