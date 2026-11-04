import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { sitegenSwarm } from "../examples/sitegen.js";
import { publishWebsiteArticles, writeWebsiteFile } from "./website.js";

describe("website file tools", () => {
  let workspace: string;
  let originalWorkspace: string | undefined;
  let originalOverwrite: string | undefined;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), "automode-site-test-"));
    originalWorkspace = process.env.AUTOMODE_SITE_WORKSPACE;
    originalOverwrite = process.env.AUTOMODE_ALLOW_FILE_OVERWRITE;
    process.env.AUTOMODE_SITE_WORKSPACE = workspace;
    delete process.env.AUTOMODE_ALLOW_FILE_OVERWRITE;
  });

  afterEach(async () => {
    if (originalWorkspace === undefined) delete process.env.AUTOMODE_SITE_WORKSPACE;
    else process.env.AUTOMODE_SITE_WORKSPACE = originalWorkspace;
    if (originalOverwrite === undefined) delete process.env.AUTOMODE_ALLOW_FILE_OVERWRITE;
    else process.env.AUTOMODE_ALLOW_FILE_OVERWRITE = originalOverwrite;
    await rm(workspace, { recursive: true, force: true });
  });

  test("writes relative text files and treats identical writes as idempotent", async () => {
    const result = await writeWebsiteFile("assets/site.css", "body { color: teal; }");
    assert.match(result, /Wrote assets\/site\.css/);
    assert.match(await writeWebsiteFile("assets/site.css", "body { color: teal; }"), /identical content/);
    assert.equal(await readFile(path.join(workspace, "assets/site.css"), "utf8"), "body { color: teal; }");
  });

  test("rejects traversal, private paths, unsupported types, and unapproved overwrites", async () => {
    await assert.rejects(writeWebsiteFile("../outside.html", "bad"), /relative|allowed/i);
    await assert.rejects(writeWebsiteFile(".env", "secret"), /allowed/i);
    await assert.rejects(writeWebsiteFile("Dockerfile", "FROM scratch"), /allowed/i);
    await assert.rejects(writeWebsiteFile("package.json", '{"scripts":{}}'), /allowed/i);
    await assert.rejects(writeWebsiteFile("image.png", "not an image"), /Unsupported website file type/);

    await writeWebsiteFile("index.html", "first");
    await assert.rejects(writeWebsiteFile("index.html", "second", true), /Refusing to overwrite/);
    assert.equal(await readFile(path.join(workspace, "index.html"), "utf8"), "first");
  });

  test("permits an overwrite only when explicitly enabled by the operator", async () => {
    await writeWebsiteFile("index.html", "first");
    process.env.AUTOMODE_ALLOW_FILE_OVERWRITE = "true";
    await writeWebsiteFile("index.html", "second", true);
    assert.equal(await readFile(path.join(workspace, "index.html"), "utf8"), "second");
  });

  test("blocks writes through symbolic links", async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), "automode-outside-test-"));
    try {
      await symlink(outside, path.join(workspace, "linked"));
      await assert.rejects(writeWebsiteFile("linked/page.html", "must not escape"), /symbolic links/);
      await assert.rejects(readFile(path.join(outside, "page.html"), "utf8"));
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("publishes escaped article pages and a linked content index", async () => {
    const result = await publishWebsiteArticles({
      articles: [{
        slug: "launch-news",
        title: "<Launch>",
        excerpt: "An & update",
        body: "First paragraph.\n\n<script>alert(1)</script>",
      }],
    });
    const article = await readFile(path.join(workspace, "content/launch-news/index.html"), "utf8");
    const index = await readFile(path.join(workspace, "content/index.html"), "utf8");
    assert.match(result, /Published 1 article/);
    assert.match(article, /&lt;Launch&gt;/);
    assert.match(article, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(article, /<script>/);
    assert.match(index, /\/content\/launch-news\/index\.html/);
  });

  test("rejects invalid and duplicate article slugs", async () => {
    await assert.rejects(
      publishWebsiteArticles({
        articles: [{ slug: "../bad", title: "Title", excerpt: "Summary", body: "Body" }],
      }),
      /slug/,
    );
    await assert.rejects(
      publishWebsiteArticles({
        articles: [
          { slug: "same", title: "One", excerpt: "Summary", body: "Body" },
          { slug: "same", title: "Two", excerpt: "Summary", body: "Body" },
        ],
      }),
      /unique/,
    );
  });

  test("wires file and publishing tools to SiteGen development and deployment to launch", () => {
    const developmentTools = sitegenSwarm.phases[1].agents[0].tools?.map((tool) => tool.name);
    const launchTools = sitegenSwarm.phases[2].agents[0].tools?.map((tool) => tool.name);
    assert.deepEqual(developmentTools, ["write_website_file", "publish_website_content"]);
    assert.deepEqual(launchTools, ["deploy_railway_site"]);
  });
});
