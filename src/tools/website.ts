import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineTool } from "./tool.js";

const MAX_WEBSITE_FILE_BYTES = 512 * 1024;
const MAX_ARTICLES = 20;
const TEXT_FILE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".htm",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

function requiredString(value: unknown, name: string, maximumLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maximumLength) {
    throw new Error(`${name} must be a non-empty string of at most ${maximumLength} characters.`);
  }
  return value;
}

export async function getSiteWorkspaceRoot() {
  const configuredPath = process.env.AUTOMODE_SITE_WORKSPACE;
  if (!configuredPath?.trim()) {
    throw new Error("Set AUTOMODE_SITE_WORKSPACE to the dedicated directory for generated website files.");
  }

  const configuredRoot = path.resolve(configuredPath);
  if (configuredRoot === path.parse(configuredRoot).root) {
    throw new Error("AUTOMODE_SITE_WORKSPACE cannot be a filesystem root.");
  }
  await mkdir(configuredRoot, { recursive: true });
  return realpath(configuredRoot);
}

function parseWebsitePath(value: unknown) {
  const relativePath = requiredString(value, "path", 240);
  if (
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new Error("Website file paths must be relative paths using forward slashes.");
  }

  const segments = relativePath.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith(".")) ||
    segments.some((segment) => /^(node_modules|\.git|\.next|\.railway)$/i.test(segment)) ||
    segments.some((segment) => /^\.env/i.test(segment)) ||
    /^(dockerfile|.*\.dockerfile|package(?:-lock)?\.json)$/i.test(segments.at(-1) ?? "")
  ) {
    throw new Error("That path is not allowed in the website workspace.");
  }

  const extension = path.posix.extname(relativePath).toLowerCase();
  if (!TEXT_FILE_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported website file type "${extension || "(none)"}".`);
  }

  return { relativePath: segments.join(path.sep), segments };
}

async function ensureDirectory(root: string, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) {
        throw new Error("Website paths cannot pass through symbolic links or non-directory entries.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
  return current;
}

export async function writeWebsiteFile(relativePathInput: unknown, contentInput: unknown, overwriteInput?: unknown) {
  const { relativePath, segments } = parseWebsitePath(relativePathInput);
  const content = requiredString(contentInput, "content", MAX_WEBSITE_FILE_BYTES);
  if (Buffer.byteLength(content, "utf8") > MAX_WEBSITE_FILE_BYTES) {
    throw new Error(`Website files must be no larger than ${MAX_WEBSITE_FILE_BYTES} bytes.`);
  }
  if (overwriteInput !== undefined && typeof overwriteInput !== "boolean") {
    throw new Error("overwrite must be a boolean when provided.");
  }

  const root = await getSiteWorkspaceRoot();
  const directory = await ensureDirectory(root, segments.slice(0, -1));
  const filePath = path.join(directory, segments.at(-1)!);

  try {
    const details = await lstat(filePath);
    if (details.isSymbolicLink() || !details.isFile()) {
      throw new Error("Website files cannot replace symbolic links or non-file entries.");
    }
    const existing = await readFile(filePath, "utf8");
    if (existing === content) {
      return `Already present with identical content: ${relativePath}`;
    }
    if (overwriteInput !== true || process.env.AUTOMODE_ALLOW_FILE_OVERWRITE !== "true") {
      throw new Error(
        `Refusing to overwrite ${relativePath}. Set AUTOMODE_ALLOW_FILE_OVERWRITE=true to permit file updates.`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await writeFile(filePath, content, { encoding: "utf8", flag: overwriteInput === true ? "w" : "wx" });
  return `Wrote ${relativePath} (${Buffer.byteLength(content, "utf8")} bytes).`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function articlePage(title: string, excerpt: string, body: string) {
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(excerpt)}">
  <title>${escapeHtml(title)}</title>
  <style>body{font:1.05rem/1.7 system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1.25rem;color:#17212b}a{color:#075e54}header{margin-bottom:2rem}h1{line-height:1.15}</style>
</head>
<body>
  <header><a href="/content/index.html">All articles</a></header>
  <main><article><h1>${escapeHtml(title)}</h1><p>${escapeHtml(excerpt)}</p>${paragraphs}</article></main>
</body>
</html>
`;
}

export async function publishWebsiteArticles(input: unknown) {
  if (!input || typeof input !== "object" || !("articles" in input) || !Array.isArray(input.articles)) {
    throw new Error("Provide an articles array to publish.");
  }
  if (input.articles.length < 1 || input.articles.length > MAX_ARTICLES) {
    throw new Error(`Publish between 1 and ${MAX_ARTICLES} articles at a time.`);
  }

  const articles = input.articles.map((item, index) => {
    if (!item || typeof item !== "object" || !("slug" in item)) {
      throw new Error(`Article ${index + 1} must include a slug, title, excerpt, and body.`);
    }
    const slug = requiredString(item.slug, `Article ${index + 1} slug`, 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`Article slug "${slug}" must use lowercase letters, numbers, and hyphens.`);
    }
    return {
      slug,
      title: requiredString("title" in item ? item.title : undefined, `Article ${slug} title`, 160),
      excerpt: requiredString("excerpt" in item ? item.excerpt : undefined, `Article ${slug} excerpt`, 500),
      body: requiredString("body" in item ? item.body : undefined, `Article ${slug} body`, 20_000),
    };
  });
  if (new Set(articles.map((article) => article.slug)).size !== articles.length) {
    throw new Error("Article slugs must be unique within a publishing request.");
  }

  const links = articles
    .map(({ slug, title, excerpt }) => `<li><h2><a href="/content/${slug}/index.html">${escapeHtml(title)}</a></h2><p>${escapeHtml(excerpt)}</p></li>`)
    .join("\n");
  const index = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Articles</title>
  <style>body{font:1.05rem/1.7 system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1.25rem;color:#17212b}a{color:#075e54}li{margin:2rem 0}</style>
</head>
<body><main><h1>Articles</h1><ul>${links}</ul></main></body>
</html>
`;

  const files = [
    { path: "content/index.html", content: index },
    ...articles.map((article) => ({
      path: `content/${article.slug}/index.html`,
      content: articlePage(article.title, article.excerpt, article.body),
    })),
  ];
  for (const file of files) {
    await writeWebsiteFile(
      file.path,
      file.content,
      process.env.AUTOMODE_ALLOW_FILE_OVERWRITE === "true",
    );
  }

  return `Published ${articles.length} article(s): ${files.map((file) => file.path).join(", ")}. Link to /content/index.html from the website navigation.`;
}

export function createWebsiteTools() {
  return [
    defineTool({
      name: "write_website_file",
      description:
        "Write a text website file under AUTOMODE_SITE_WORKSPACE. Paths are relative, traversal and private/config files are blocked, and overwrites require explicit opt-in.",
      parameters: {
        path: { type: "string", description: "Relative file path such as index.html or assets/site.css." },
        content: { type: "string", description: "Complete text contents of the website file." },
        overwrite: { type: "boolean", description: "Set true only when file overwrites are explicitly enabled in environment configuration." },
      },
      required: ["path", "content"],
      execute: async (input) => writeWebsiteFile(input.path, input.content, input.overwrite),
    }),
    defineTool({
      name: "publish_website_content",
      description:
        "Publish 1-20 plain-text articles into the generated static website, creating an article index and escaped HTML pages under /content/.",
      parameters: {
        articles: {
          type: "array",
          description: "Articles to publish to the generated website.",
          items: {
            type: "object",
            description: "One article with a unique URL slug, title, excerpt, and plain-text body.",
            properties: {
              slug: { type: "string", description: "Unique lowercase URL slug using letters, numbers, and hyphens." },
              title: { type: "string", description: "Article title." },
              excerpt: { type: "string", description: "Short plain-text summary." },
              body: { type: "string", description: "Plain-text article body; separate paragraphs with blank lines." },
            },
            required: ["slug", "title", "excerpt", "body"],
          },
        },
      },
      execute: publishWebsiteArticles,
    }),
  ];
}

export async function listWebsiteFiles(directory: string, relativeDirectory = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    const details = await lstat(fullPath);
    if (details.isSymbolicLink()) {
      throw new Error(`Railway deployment cannot include symbolic links (${relativePath}).`);
    }
    if (details.isDirectory()) {
      files.push(...(await listWebsiteFiles(fullPath, relativePath)));
    } else if (details.isFile()) {
      files.push(relativePath);
      if (files.length > 2_000) {
        throw new Error("The website workspace contains more than 2,000 files; reduce it before deployment.");
      }
    }
  }
  return files;
}
