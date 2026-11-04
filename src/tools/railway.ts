import { copyFile, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { defineTool } from "./tool.js";
import { getSiteWorkspaceRoot, listWebsiteFiles } from "./website.js";

const DEPLOY_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_DEPLOYMENT_BYTES = 100 * 1024 * 1024;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const DEPLOYABLE_EXTENSIONS = new Set([
  ".css",
  ".gif",
  ".html",
  ".htm",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mjs",
  ".otf",
  ".png",
  ".svg",
  ".txt",
  ".ttf",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

function requiredDeploymentSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured before deploying to Railway.`);
  }
  return value;
}

function railwayConfiguration() {
  if (process.env.AUTOMODE_RAILWAY_AUTO_DEPLOY !== "true") {
    throw new Error("Set AUTOMODE_RAILWAY_AUTO_DEPLOY=true to explicitly enable Railway deployments.");
  }
  const token = requiredDeploymentSetting("RAILWAY_TOKEN");
  const projectId = requiredDeploymentSetting("AUTOMODE_RAILWAY_PROJECT_ID");
  const environmentId = requiredDeploymentSetting("AUTOMODE_RAILWAY_ENVIRONMENT_ID");
  const serviceId = requiredDeploymentSetting("AUTOMODE_RAILWAY_SERVICE_ID");
  for (const [name, value] of [
    ["AUTOMODE_RAILWAY_PROJECT_ID", projectId],
    ["AUTOMODE_RAILWAY_ENVIRONMENT_ID", environmentId],
    ["AUTOMODE_RAILWAY_SERVICE_ID", serviceId],
  ]) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw new Error(`${name} must be a Railway ID containing only letters, numbers, underscores, or hyphens.`);
    }
  }
  return { token, projectId, environmentId, serviceId };
}

async function copySiteToDeploymentDirectory(sourceRoot: string, destinationRoot: string) {
  const files = await listWebsiteFiles(sourceRoot);
  const publicFiles = files.filter((file) => DEPLOYABLE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  if (!publicFiles.some((file) => file === "index.html" || file === "index.htm")) {
    throw new Error("The generated website must contain a root index.html or index.htm before deployment.");
  }

  let totalBytes = 0;
  for (const relativePath of publicFiles) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const details = await lstat(sourcePath);
    if (!details.isFile()) {
      throw new Error(`Website asset is not a regular file: ${relativePath}`);
    }
    if (details.size > MAX_ASSET_BYTES) {
      throw new Error(`Website asset exceeds ${MAX_ASSET_BYTES} bytes: ${relativePath}`);
    }
    totalBytes += details.size;
    if (totalBytes > MAX_DEPLOYMENT_BYTES) {
      throw new Error(`Website assets exceed the ${MAX_DEPLOYMENT_BYTES}-byte deployment limit.`);
    }

    const destinationPath = path.join(destinationRoot, relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
  return { files: publicFiles, totalBytes };
}

const railwayDockerfile = `FROM nginx:alpine
ENV NGINX_ENVSUBST_FILTER=^PORT$
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY site/ /usr/share/nginx/html/
`;

const nginxConfig = `server {
    listen \${PORT};
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
`;

async function runRailwayCli(args: string[], token: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "railway",
      args,
      {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          USERPROFILE: process.env.USERPROFILE ?? "",
          RAILWAY_TOKEN: token,
          CI: "1",
        },
      },
    );

    let output = "";
    let timedOut = false;
    const capture = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-64_000);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, DEPLOY_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Could not start the Railway CLI ("railway"): ${error.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const safeOutput = output.replaceAll(token, "[REDACTED]");
      if (timedOut) {
        reject(new Error(`Railway deployment timed out after ${DEPLOY_TIMEOUT_MS / 60_000} minutes.`));
      } else if (code !== 0) {
        reject(new Error(`Railway deployment failed (exit ${code ?? signal}).\n${safeOutput}`));
      } else {
        resolve(safeOutput.trim() || "Railway reported that the deployment completed successfully.");
      }
    });
  });
}

export async function deployWebsiteToRailway() {
  const config = railwayConfiguration();
  const sourceRoot = await getSiteWorkspaceRoot();
  const deploymentRoot = await mkdtemp(path.join(os.tmpdir(), "automode-railway-"));
  const siteRoot = path.join(deploymentRoot, "site");

  try {
    await mkdir(siteRoot);
    const { files, totalBytes } = await copySiteToDeploymentDirectory(sourceRoot, siteRoot);
    await writeFile(path.join(deploymentRoot, "Dockerfile"), railwayDockerfile, { flag: "wx" });
    await writeFile(path.join(deploymentRoot, "default.conf.template"), nginxConfig, { flag: "wx" });

    const output = await runRailwayCli(
      [
        "up",
        deploymentRoot,
        "--path-as-root",
        "--ci",
        "--project",
        config.projectId,
        "--environment",
        config.environmentId,
        "--service",
        config.serviceId,
      ],
      config.token,
    );
    return `Railway deployment succeeded for the configured service. Uploaded ${files.length} static asset(s) (${totalBytes} bytes).\n${output}`;
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
}

export function createRailwayDeploymentTool() {
  return defineTool({
    name: "deploy_railway_site",
    description:
      "Deploy the generated static website to the explicitly configured Railway project, environment, and service. Requires AUTOMODE_RAILWAY_AUTO_DEPLOY=true, a project-scoped RAILWAY_TOKEN, and all three Railway IDs. Deploys only static website assets with a fixed Nginx container; it does not run generated build scripts.",
    parameters: {},
    required: [],
    execute: async () => deployWebsiteToRailway(),
  });
}
