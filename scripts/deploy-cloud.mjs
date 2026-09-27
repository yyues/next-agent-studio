import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runtimeDir = resolve(root, "packages/mcp-runtime");
// This is the service currently linked to the Railway project. Override it
// with RAILWAY_SERVICE when deploying to a differently named service.
const runtimeService = process.env.RAILWAY_SERVICE ?? "ideal-education";
const runtimeToken = process.env.MCP_RUNTIME_TOKEN?.trim();
const envTargets = (process.env.VERCEL_ENV_TARGETS ?? "production")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function fail(message) {
  console.error(`[deploy] ${message}`);
  process.exitCode = 1;
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: process.env,
      stdio: options.input === undefined ? "inherit" : ["pipe", "pipe", "inherit"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      if (options.capture !== true) process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
        return;
      }
      resolvePromise(stdout);
    });
    if (options.input !== undefined) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

async function commandExists(command) {
  try {
    await run(command, ["--version"], { capture: true });
    return true;
  } catch {
    return false;
  }
}

function extractUrl(output) {
  const match = output.match(/https:\/\/[^\s'"`]+/);
  return match?.[0]?.replace(/[),.]+$/, "") ?? null;
}

async function setRailwayVariable(name, value) {
  await run("railway", ["variables", "--set", `${name}=${value}`], { cwd: runtimeDir });
}

async function setVercelVariable(name, value, target) {
  try {
    await run("vercel", ["env", "rm", name, target, "--yes"], { cwd: root });
  } catch {
    // The variable may not exist on the first deployment.
  }
  await run("vercel", ["env", "add", name, target], { cwd: root, input: `${value}\n` });
}

async function waitForHealth(url) {
  const healthUrl = `${url.replace(/\/$/, "")}/health`;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      // Railway may still be starting the container.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
    console.log(`[deploy] waiting for Runtime health (${attempt}/18)`);
  }
  throw new Error(`Runtime health check failed: ${healthUrl}`);
}

async function main() {
  if (!runtimeToken) throw new Error("MCP_RUNTIME_TOKEN is required.");
  if (!existsSync(resolve(runtimeDir, "Dockerfile"))) {
    throw new Error("packages/mcp-runtime/Dockerfile is missing.");
  }
  for (const command of ["railway", "vercel"]) {
    if (!(await commandExists(command))) throw new Error(`${command} CLI is not installed or not logged in.`);
  }

  console.log(`[deploy] deploying Railway service: ${runtimeService}`);
  await setRailwayVariable("MCP_RUNTIME_TOKEN", runtimeToken);
  await setRailwayVariable("MCP_RUNTIME_ALLOWED_COMMANDS", "npx,node,python,python3");
  await setRailwayVariable("NODE_ENV", "production");
  await run("railway", ["up", "--service", runtimeService, "--detach"], { cwd: runtimeDir });

  const domainOutput = await run("railway", ["domain"], { cwd: runtimeDir, capture: true });
  const runtimeUrl = extractUrl(domainOutput);
  if (!runtimeUrl) throw new Error("Could not find a public Railway URL in `railway domain` output.");
  console.log(`[deploy] Railway Runtime: ${runtimeUrl}`);
  await waitForHealth(runtimeUrl);

  for (const target of envTargets) {
    console.log(`[deploy] setting Vercel MCP_RUNTIME_URL (${target})`);
    await setVercelVariable("MCP_RUNTIME_URL", runtimeUrl, target);
    await setVercelVariable("MCP_RUNTIME_TOKEN", runtimeToken, target);
  }

  console.log("[deploy] deploying Next.js to Vercel");
  await run("vercel", ["deploy", "--prod", "--yes"], { cwd: root });
  console.log(`[deploy] completed: ${runtimeUrl}`);
}

main().catch(fail);
