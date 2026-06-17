#!/usr/bin/env node
// foglamp CLI — `npx foglamp login`.
//
// Runs the OAuth 2.0 device authorization grant against a Foglamp server:
// requests a code, prints a URL for the user to approve in their browser, polls
// until approved, then mints an API key and writes FOGLAMP_API_KEY to .env.
//
// Designed to be driven by a coding agent: it prints the verification URL (so
// the agent can relay it), blocks until the user approves, and on success
// writes the key and prints where it went. Zero runtime dependencies — Node 18+
// built-ins only (global fetch, node:fs, node:util).

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_API_URL = "https://api.foglamp.dev";
const CLIENT_ID = "foglamp-cli";
const ENV_VAR = "FOGLAMP_API_KEY";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

type Json = Record<string, unknown>;

function log(msg = ""): void {
  process.stdout.write(`${msg}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`\nfoglamp: ${msg}\n`);
  process.exit(1);
}

function printHelp(): void {
  log(`foglamp — observability for the Vercel AI SDK

Usage:
  npx foglamp login [options]

Commands:
  login            Authenticate and write ${ENV_VAR} to your .env (default)

Options:
  --api-url <url>  Foglamp server URL (default: ${DEFAULT_API_URL},
                   or the FOGLAMP_API_URL env var)
  --env-file <p>   Env file to write (default: ./.env)
  --no-open        Don't try to open the browser automatically
  -h, --help       Show this help`);
}

async function postJson(
  url: string,
  body: Json,
): Promise<{ status: number; ok: boolean; data: Json }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    fail(
      `couldn't reach ${url} — is the server up and --api-url correct?\n        (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  let data: Json = {};
  try {
    data = (await res.json()) as Json;
  } catch {
    // non-JSON body (e.g. an HTML error page) — leave data empty
  }
  return { status: res.status, ok: res.ok, data };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tryOpenBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Best effort — printing the URL is the contract.
  }
}

// Upsert KEY=value in an env file, replacing an existing line for KEY rather
// than duplicating it. Creates the file if it doesn't exist.
function writeEnvVar(filePath: string, key: string, value: string): void {
  let content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += `${line}\n`;
  }
  writeFileSync(filePath, content);
}

async function login(opts: {
  apiUrl: string;
  envFile: string;
  open: boolean;
}): Promise<void> {
  const { apiUrl } = opts;

  // 1. Request a device code.
  const code = await postJson(`${apiUrl}/api/auth/device/code`, {
    client_id: CLIENT_ID,
  });
  if (!code.ok) {
    fail(
      `couldn't start login (${code.status}): ${
        (code.data.error_description as string) ??
        (code.data.error as string) ??
        "unexpected response"
      }`,
    );
  }
  const userCode = String(code.data.user_code ?? "");
  const verifyUrl = String(code.data.verification_uri ?? "");
  const verifyComplete = String(
    code.data.verification_uri_complete ?? verifyUrl,
  );
  let intervalMs = Math.max(1, Number(code.data.interval) || 5) * 1000;
  const expiresMs = (Number(code.data.expires_in) || 900) * 1000;

  // 2. Tell the user where to go.
  log();
  log("  Connect this app to Foglamp:");
  log();
  log(`    1. Open:  ${verifyComplete}`);
  log(`    2. Confirm the code:  ${userCode}`);
  log();
  log("  Waiting for you to approve in the browser…");
  if (opts.open) tryOpenBrowser(verifyComplete);

  // 3. Poll for the token until approved, denied, or expired.
  const deadline = Date.now() + expiresMs;
  let accessToken = "";
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const tok = await postJson(`${apiUrl}/api/auth/device/token`, {
      grant_type: DEVICE_GRANT,
      device_code: String(code.data.device_code ?? ""),
      client_id: CLIENT_ID,
    });
    if (tok.ok && tok.data.access_token) {
      accessToken = String(tok.data.access_token);
      break;
    }
    const err = String(tok.data.error ?? "");
    if (err === "authorization_pending") continue;
    if (err === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    if (err === "access_denied") fail("the request was denied in the browser.");
    if (err === "expired_token")
      fail("the code expired before it was approved — run `foglamp login` again.");
    fail(
      `login failed: ${(tok.data.error_description as string) ?? (err || "unexpected response")}`,
    );
  }
  if (!accessToken) {
    fail("timed out waiting for approval — run `foglamp login` again.");
  }

  // 4. Exchange the session token for a project API key.
  let keyRes: { status: number; ok: boolean; data: Json };
  try {
    const res = await fetch(`${apiUrl}/api/cli/provision-key`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    keyRes = {
      status: res.status,
      ok: res.ok,
      data: (await res.json().catch(() => ({}))) as Json,
    };
  } catch (err) {
    fail(
      `couldn't create an API key: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!keyRes.ok || !keyRes.data.key) {
    fail(
      `couldn't create an API key (${keyRes.status}): ${
        (keyRes.data.error as string) ?? "unexpected response"
      }`,
    );
  }
  const apiKey = String(keyRes.data.key);
  const projectName = String(keyRes.data.projectName ?? "your project");

  // 5. Write it to the env file.
  writeEnvVar(opts.envFile, ENV_VAR, apiKey);

  log();
  log(`  ✓ Connected to Foglamp (project: ${projectName}).`);
  log(`  ✓ Wrote ${ENV_VAR} to ${opts.envFile}`);
  log();
  log(`    ${ENV_VAR}=${apiKey}`);
  log();
  log(
    "  Next: install the `foglamp` package and instrument your AI SDK calls.",
  );
  log("  Docs: https://docs.foglamp.dev/ai-instrument.md");
}

async function main(): Promise<void> {
  if (typeof fetch !== "function") {
    fail("this CLI needs Node 18+ (global fetch is unavailable).");
  }
  const { values, positionals } = parseArgs({
    options: {
      "api-url": { type: "string" },
      "env-file": { type: "string" },
      "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  const command = positionals[0] ?? "login";
  if (values.help || command === "help") {
    printHelp();
    return;
  }
  if (command !== "login") {
    process.stderr.write(`foglamp: unknown command "${command}"\n\n`);
    printHelp();
    process.exit(1);
  }

  const apiUrl = (
    values["api-url"] ??
    process.env.FOGLAMP_API_URL ??
    DEFAULT_API_URL
  ).replace(/\/+$/, "");
  const envFile = resolve(process.cwd(), values["env-file"] ?? ".env");

  await login({ apiUrl, envFile, open: !values["no-open"] });
}

void main();
