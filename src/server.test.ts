import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createApp } from "./server.js";

const serverEnvironmentVariables = ["AUTOMODE_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"];

describe("AutoMode AI HTTP server", () => {
  let server: ReturnType<typeof createApp>;
  let baseUrl: string;
  let originalEnvironment: Record<string, string | undefined>;

  beforeEach(async () => {
    originalEnvironment = Object.fromEntries(
      serverEnvironmentVariables.map((name) => [name, process.env[name]]),
    );
    process.env.AUTOMODE_API_KEY = "test-api-key";
    // Neither provider key is configured — a /run request should fail fast
    // (before any network call) with a clear error, never silently spend
    // real API credit during tests.
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    server = createApp();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const name of serverEnvironmentVariables) {
      const value = originalEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("GET /health requires no auth and reports ok", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  test("GET / serves the interactive web UI instead of 404ing", async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const body = await response.text();
    assert.match(body, /AutoMode AI/);
    assert.match(body, /<form|<button/);
  });

  test("GET /api describes the service instead of 404ing", async () => {
    const response = await fetch(`${baseUrl}/api`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { service: string; endpoints: Record<string, string> };
    assert.match(body.service, /AutoMode AI/);
    assert.ok(body.endpoints["POST /run"]);
  });

  test("GET /swarms lists every registered swarm without auth", async () => {
    const response = await fetch(`${baseUrl}/swarms`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { swarms: { key: string }[] };
    const keys = body.swarms.map((s) => s.key).sort();
    assert.deepEqual(keys, ["bizanalyst", "contentops", "edunet", "outreach", "sitegen", "supportops"]);
  });

  test("POST /run rejects requests with neither an admin key nor a bring-your-own key", async () => {
    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swarm: "supportops", input: "A customer says the app is slow." }),
    });
    assert.equal(response.status, 401);
  });

  test("POST /run rejects the wrong admin key when no bring-your-own key is supplied either", async () => {
    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-key" },
      body: JSON.stringify({ swarm: "supportops", input: "A customer says the app is slow." }),
    });
    assert.equal(response.status, 401);
  });

  test("POST /run rejects a malformed anthropicApiKey before it would ever reach the network", async () => {
    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swarm: "supportops", input: "Hello", anthropicApiKey: "not-a-real-key" }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /doesn't look like an Anthropic API key/);
  });

  test("a bring-your-own anthropicApiKey bypasses the admin-key requirement", async () => {
    // Pairs a well-formed BYOK key with an invalid swarm name, so this
    // proves the request got past the auth gate (a 400, not a 401)
    // without ever starting a job or touching the network.
    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swarm: "not-a-real-swarm", input: "hello", anthropicApiKey: "sk-ant-test-byok-key" }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Unknown swarm/);
  });

  test("POST /run rejects an unknown swarm (admin path)", async () => {
    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-api-key" },
      body: JSON.stringify({ swarm: "not-a-real-swarm", input: "hello" }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Unknown swarm/);
  });

  test("POST /run rejects empty input (admin path)", async () => {
    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-api-key" },
      body: JSON.stringify({ swarm: "supportops", input: "   " }),
    });
    assert.equal(response.status, 400);
  });

  test("GET /jobs/:id needs no auth (the jobId is its own capability token) and 404s on an unknown job", async () => {
    const response = await fetch(`${baseUrl}/jobs/does-not-exist`);
    assert.equal(response.status, 404);
  });

  test("an admin /run request starts a job that fails fast without a configured provider key, never reaching the network", async () => {
    const runResponse = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-api-key" },
      body: JSON.stringify({ swarm: "supportops", input: "A customer says the app is slow." }),
    });
    assert.equal(runResponse.status, 202);
    const { jobId } = (await runResponse.json()) as { jobId: string };
    assert.ok(jobId);

    let job: { status: string; error?: string } | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      const jobResponse = await fetch(`${baseUrl}/jobs/${jobId}`);
      assert.equal(jobResponse.status, 200);
      job = await jobResponse.json();
      if (job!.status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(job?.status, "failed");
    assert.match(job?.error ?? "", /ANTHROPIC_API_KEY/);
  });
});
