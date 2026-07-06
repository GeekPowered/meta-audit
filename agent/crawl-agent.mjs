import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, ".env") });

const API_BASE_URL = process.env.API_BASE_URL;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const SF_CLI_PATH = process.env.SF_CLI_PATH;
const SF_CONFIG_PATH = process.env.SF_CONFIG_PATH || null;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 15000;

for (const [key, value] of Object.entries({ API_BASE_URL, AGENT_TOKEN, SF_CLI_PATH })) {
  if (!value) {
    console.error(`Missing required env var ${key}. Copy agent/.env.example to agent/.env and fill it in.`);
    process.exit(1);
  }
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function authedFetch(url, options = {}) {
  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${AGENT_TOKEN}`,
    },
  });
}

async function claimNextJob() {
  const res = await authedFetch("/api/agent/crawl-jobs/next");
  if (!res.ok) {
    throw new Error(`GET /api/agent/crawl-jobs/next failed: ${res.status} ${await res.text()}`);
  }
  const { job } = await res.json();
  return job;
}

function runScreamingFrog(domain, outputFolder) {
  const args = [
    "--headless",
    "--crawl",
    domain,
    "--output-folder",
    outputFolder,
    "--export-format",
    "csv",
    "--export-tabs",
    "Internal:All",
    "--overwrite",
  ];
  if (SF_CONFIG_PATH) {
    args.push("--config", SF_CONFIG_PATH);
  }

  log(`Running: ${SF_CLI_PATH} ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(SF_CLI_PATH, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Screaming Frog exited with code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }
    });
  });
}

function findExportedCsv(outputFolder) {
  const csvFiles = fs.readdirSync(outputFolder).filter((f) => f.toLowerCase().endsWith(".csv"));
  if (csvFiles.length === 0) {
    throw new Error(`No CSV file found in ${outputFolder} after crawl. Check the --export-tabs name is exact.`);
  }
  return path.join(outputFolder, csvFiles[0]);
}

async function reportComplete(jobId, csvPath) {
  const buffer = fs.readFileSync(csvPath);
  const formData = new FormData();
  formData.append("csv", new Blob([buffer]), path.basename(csvPath));

  const res = await authedFetch(`/api/agent/crawl-jobs/${jobId}/complete`, {
    method: "POST",
    body: formData,
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`POST complete failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function reportFail(jobId, errorMessage) {
  try {
    await authedFetch(`/api/agent/crawl-jobs/${jobId}/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorMessage }),
    });
  } catch (err) {
    log(`Failed to report failure for job ${jobId}: ${err.message}`);
  }
}

async function processJob(job) {
  log(`Claimed crawl job ${job.id} for ${job.domain}`);

  if (!job.domain) {
    await reportFail(job.id, "client has no domain configured");
    return;
  }

  const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), "meta-audit-crawl-"));

  try {
    await runScreamingFrog(job.domain, outputFolder);
    const csvPath = findExportedCsv(outputFolder);
    const result = await reportComplete(job.id, csvPath);
    log(`Job ${job.id} complete — ${result.pagesFound} pages ingested`);
  } catch (err) {
    log(`Job ${job.id} failed: ${err.message}`);
    await reportFail(job.id, err.message);
  } finally {
    fs.rmSync(outputFolder, { recursive: true, force: true });
  }
}

async function claimNextSuggestionJob() {
  const res = await authedFetch("/api/agent/suggestion-jobs/next");
  if (!res.ok) {
    throw new Error(`GET /api/agent/suggestion-jobs/next failed: ${res.status} ${await res.text()}`);
  }
  const { job } = await res.json();
  return job;
}

async function processSuggestionJob(job) {
  log(`Claimed suggestion job ${job.id} for client ${job.clientId}`);

  let done = false;
  while (!done) {
    const res = await authedFetch(`/api/agent/suggestion-jobs/${job.id}/process-batch`, {
      method: "POST",
    });
    const body = await res.json();

    if (!res.ok) {
      log(`Suggestion job ${job.id} failed: ${JSON.stringify(body)}`);
      return;
    }

    done = body.done;
    log(`Suggestion job ${job.id}: ${body.pagesProcessed}/${body.pagesTotal} processed`);
  }

  log(`Suggestion job ${job.id} complete`);
}

async function claimNextPublishJob() {
  const res = await authedFetch("/api/agent/publish-jobs/next");
  if (!res.ok) {
    throw new Error(`GET /api/agent/publish-jobs/next failed: ${res.status} ${await res.text()}`);
  }
  const { job } = await res.json();
  return job;
}

async function processPublishJob(job) {
  log(`Claimed publish job ${job.id} (${job.action}) for client ${job.clientId}`);

  let done = false;
  while (!done) {
    const res = await authedFetch(`/api/agent/publish-jobs/${job.id}/process-batch`, {
      method: "POST",
    });
    const body = await res.json();

    if (!res.ok) {
      log(`Publish job ${job.id} failed: ${JSON.stringify(body)}`);
      return;
    }

    done = body.done;
    log(`Publish job ${job.id}: ${body.itemsProcessed}/${body.itemsTotal} processed`);
  }

  log(`Publish job ${job.id} complete`);
}

async function pollOnce() {
  const crawlJob = await claimNextJob();
  if (crawlJob) {
    await processJob(crawlJob);
    return;
  }

  const suggestionJob = await claimNextSuggestionJob();
  if (suggestionJob) {
    await processSuggestionJob(suggestionJob);
    return;
  }

  const publishJob = await claimNextPublishJob();
  if (publishJob) {
    await processPublishJob(publishJob);
  }
}

async function loop() {
  try {
    await pollOnce();
  } catch (err) {
    log(`Poll error: ${err.message}`);
  }
  setTimeout(loop, POLL_INTERVAL_MS);
}

log(`Meta Audit agent started. Polling ${API_BASE_URL} every ${POLL_INTERVAL_MS}ms for crawl, suggestion, and publish jobs.`);
loop();
