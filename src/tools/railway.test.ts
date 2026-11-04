import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { deployWebsiteToRailway } from "./railway.js";
import { writeWebsiteFile } from "./website.js";

const railwayEnvironmentVariables = [
  "AUTOMODE_SITE_WORKSPACE",
  "AUTOMODE_RAILWAY_AUTO_DEPLOY",
  "AUTOMODE_RAILWAY_PROJECT_ID",
  "AUTOMODE_RAILWAY_ENVIRONMENT_ID",
  "AUTOMODE_RAILWAY_SERVICE_ID",
  "RAILWAY_TOKEN",
  "ANTHROPIC_API_KEY",
  "PATH",
];

describe("Railway deployment tool", () => {
  let workspace: string;
  let originalEnvironment: Record<string, string | undefined>;

  beforeEach(async () => {
    originalEnvironment = Object.fromEntries(
      railwayEnvironmentVariables.map((name) => [name, process.env[name]]),
    );
    workspace = await mkdtemp(path.join(os.tmpdir(), "automode-railway-test-"));
    process.env.AUTOMODE_SITE_WORKSPACE = workspace;
    delete process.env.AUTOMODE_RAILWAY_AUTO_DEPLOY;
    delete process.env.AUTOMODE_RAILWAY_PROJECT_ID;
    delete process.env.AUTOMODE_RAILWAY_ENVIRONMENT_ID;
    delete process.env.AUTOMODE_RAILWAY_SERVICE_ID;
    delete process.env.RAILWAY_TOKEN;
    process.env.ANTHROPIC_API_KEY = "must-not-be-passed-to-the-cli";
  });

  afterEach(async () => {
    for (const name of railwayEnvironmentVariables) {
      const value = originalEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(workspace, { recursive: true, force: true });
  });

  test("requires explicit deployment opt-in and target settings", async () => {
    await assert.rejects(deployWebsiteToRailway(), /AUTOMODE_RAILWAY_AUTO_DEPLOY=true/);
    process.env.AUTOMODE_RAILWAY_AUTO_DEPLOY = "true";
    process.env.RAILWAY_TOKEN = "test-token";
    await assert.rejects(deployWebsiteToRailway(), /AUTOMODE_RAILWAY_PROJECT_ID/);
  });

  test("deploys only static assets to the configured Railway target", async () => {
    await writeWebsiteFile("index.html", "<h1>Welcome</h1>");
    await writeWebsiteFile("styles.css", "body { color: teal; }");
    await writeFile(path.join(workspace, ".env"), "SECRET=do-not-upload");
    await writeFile(path.join(workspace, "README.md"), "Do not publish this file.");

    process.env.AUTOMODE_RAILWAY_AUTO_DEPLOY = "true";
    process.env.RAILWAY_TOKEN = "project-token";
    process.env.AUTOMODE_RAILWAY_PROJECT_ID = "project-123";
    process.env.AUTOMODE_RAILWAY_ENVIRONMENT_ID = "environment-456";
    process.env.AUTOMODE_RAILWAY_SERVICE_ID = "service-789";

    const binDirectory = await mkdtemp(path.join(os.tmpdir(), "automode-fake-cli-"));
    const argumentLog = path.join(binDirectory, "arguments.txt");
    const railwayCommand = path.join(binDirectory, "railway");
    try {
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      await writeFile(
        railwayCommand,
        `#!/bin/sh
{
  printf '%s\\n' "$@"
  printf '%s\\n' '---FILES---'
  find "$2" -type f -print
  if [ -n "\${ANTHROPIC_API_KEY:-}" ]; then printf '%s\\n' 'ANTHROPIC_KEY_LEAKED'; fi
} > ${quote(argumentLog)}
printf '%s\\n' 'Mock Railway deployment succeeded'
`,
      );
      await chmod(railwayCommand, 0o755);
      const originalPath = process.env.PATH ?? "";
      process.env.PATH = `${binDirectory}:${originalPath}`;

      const result = await deployWebsiteToRailway();
      const log = await readFile(argumentLog, "utf8");
      assert.match(result, /deployment succeeded/i);
      assert.match(log, /^up\n/m);
      assert.match(log, /--path-as-root/);
      assert.match(log, /--ci/);
      assert.match(log, /--project\nproject-123/);
      assert.match(log, /--environment\nenvironment-456/);
      assert.match(log, /--service\nservice-789/);
      assert.match(log, /site\/index\.html/);
      assert.match(log, /site\/styles\.css/);
      assert.match(log, /Dockerfile/);
      assert.doesNotMatch(log, /\.env/);
      assert.doesNotMatch(log, /README\.md/);
      assert.doesNotMatch(log, /ANTHROPIC_KEY_LEAKED/);
      assert.doesNotMatch(log, /project-token/);
    } finally {
      await rm(binDirectory, { recursive: true, force: true });
    }
  });
});
