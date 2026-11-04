import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Swarm } from "./core/swarm.js";
import { sitegenSwarm } from "./examples/sitegen.js";
import { edunetSwarm } from "./examples/edunet.js";
import { contentopsSwarm } from "./examples/contentops.js";
import { bizanalystSwarm } from "./examples/bizanalyst.js";
import { outreachSwarm } from "./examples/outreach.js";
import { supportopsSwarm } from "./examples/supportops.js";
import type { SwarmConfig, SwarmResult } from "./core/types.js";

const swarms: Record<string, SwarmConfig> = {
  sitegen: sitegenSwarm,
  edunet: edunetSwarm,
  contentops: contentopsSwarm,
  bizanalyst: bizanalystSwarm,
  outreach: outreachSwarm,
  supportops: supportopsSwarm,
};

const MAX_BODY_BYTES = 64 * 1024;
const MAX_INPUT_LENGTH = 8_000;
// In-memory only — a single-instance deployment's job history is lost on
// restart/redeploy, and this never shrinks on its own. Acceptable for this
// scope (no DB, no persistence requirement), but worth knowing if the
// service runs for a long time under heavy use.
const MAX_JOBS_RETAINED = 500;

type Job =
  | { status: "running"; swarm: string; startedAt: number }
  | { status: "completed"; swarm: string; startedAt: number; finishedAt: number; result: SwarmResult }
  | { status: "failed"; swarm: string; startedAt: number; finishedAt: number; error: string };

const jobs = new Map<string, Job>();

function pruneJobsIfNeeded() {
  if (jobs.size <= MAX_JOBS_RETAINED) return;
  const oldestFirst = [...jobs.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
  for (const [id] of oldestFirst.slice(0, jobs.size - MAX_JOBS_RETAINED)) {
    jobs.delete(id);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

function isAuthorized(req: IncomingMessage): boolean {
  const configuredKey = process.env.AUTOMODE_API_KEY;
  if (!configuredKey) return false;

  const header = req.headers.authorization ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length);

  const expected = Buffer.from(configuredKey);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
    }
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function listSwarmsPayload() {
  return Object.entries(swarms).map(([key, config]) => ({
    key,
    name: config.name,
    description: config.description,
    phases: config.phases.length,
    agents: config.phases.reduce((sum, p) => sum + p.agents.length, 0),
  }));
}

function runJobInBackground(jobId: string, swarmKey: string, input: string) {
  const config = swarms[swarmKey];
  const swarm = new Swarm(config);
  const startedAt = Date.now();
  jobs.set(jobId, { status: "running", swarm: swarmKey, startedAt });

  swarm
    .run(input)
    .then((result) => {
      jobs.set(jobId, { status: "completed", swarm: swarmKey, startedAt, finishedAt: Date.now(), result });
      pruneJobsIfNeeded();
    })
    .catch((error: unknown) => {
      jobs.set(jobId, {
        status: "failed",
        swarm: swarmKey,
        startedAt,
        finishedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      pruneJobsIfNeeded();
    });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/swarms") {
    sendJson(res, 200, { swarms: listSwarmsPayload() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/run") {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: "A valid Authorization: Bearer <AUTOMODE_API_KEY> header is required." });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 413, { error: error instanceof Error ? error.message : "Invalid request body." });
      return;
    }

    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "A JSON body with swarm and input is required." });
      return;
    }
    const data = body as Record<string, unknown>;
    const swarmKey = typeof data.swarm === "string" ? data.swarm : "";
    const input = typeof data.input === "string" ? data.input.trim() : "";

    if (!swarms[swarmKey]) {
      sendJson(res, 400, { error: `Unknown swarm "${swarmKey}". Available: ${Object.keys(swarms).join(", ")}` });
      return;
    }
    if (!input) {
      sendJson(res, 400, { error: "input must be a non-empty string." });
      return;
    }
    if (input.length > MAX_INPUT_LENGTH) {
      sendJson(res, 400, { error: `input must be at most ${MAX_INPUT_LENGTH} characters.` });
      return;
    }

    const jobId = randomUUID();
    runJobInBackground(jobId, swarmKey, input);
    sendJson(res, 202, { jobId, status: "running" });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: "A valid Authorization: Bearer <AUTOMODE_API_KEY> header is required." });
      return;
    }

    const jobId = url.pathname.slice("/jobs/".length);
    const job = jobs.get(jobId);
    if (!job) {
      sendJson(res, 404, { error: "Job not found. It may have finished and been pruned, or the id is wrong." });
      return;
    }
    sendJson(res, 200, { jobId, ...job });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

const port = Number(process.env.PORT) || 3000;

if (!process.env.AUTOMODE_API_KEY) {
  console.warn(
    "Warning: AUTOMODE_API_KEY is not set. POST /run and GET /jobs/:id will reject every request until it's configured.",
  );
}

export function createApp() {
  return createServer((req, res) => {
    handleRequest(req, res).catch((error: unknown) => {
      console.error("Unhandled request error:", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error." });
      }
    });
  });
}

// Only start listening when this file is run directly (`npm start`/`npm run
// serve`) — not when imported, e.g. by server.test.ts, which starts its own
// instance on an ephemeral port instead.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.listen(port, () => {
    console.log(`AutoMode AI server listening on port ${port}`);
    console.log(`Swarms available: ${Object.keys(swarms).join(", ")}`);
  });
}
