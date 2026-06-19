import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEnvFile } from "./env.js";

describe("loadEnvFile", () => {
  const touchedKeys = ["AUTOMODE_ENV_TEST_KEY", "AUTOMODE_EXISTING_KEY"];

  afterEach(() => {
    for (const key of touchedKeys) {
      delete process.env[key];
    }
  });

  test("loads key/value pairs from a .env file", () => {
    const dir = mkdtempSync(join(tmpdir(), "automode-env-"));
    const envPath = join(dir, ".env");

    writeFileSync(
      envPath,
      `
# ignored comment
AUTOMODE_ENV_TEST_KEY="loaded value"
`,
      "utf8",
    );

    try {
      loadEnvFile(envPath);
      assert.strictEqual(process.env["AUTOMODE_ENV_TEST_KEY"], "loaded value");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not overwrite existing environment variables", () => {
    const dir = mkdtempSync(join(tmpdir(), "automode-env-"));
    const envPath = join(dir, ".env");
    process.env["AUTOMODE_EXISTING_KEY"] = "already-set";
    writeFileSync(envPath, "AUTOMODE_EXISTING_KEY=from-file", "utf8");

    try {
      loadEnvFile(envPath);
      assert.strictEqual(process.env["AUTOMODE_EXISTING_KEY"], "already-set");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
