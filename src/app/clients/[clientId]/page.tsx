"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, apiRequest } from "@/lib/apiClient";
import ReviewRow, { type ReviewRowData } from "./ReviewRow";

type Client = {
  id: string;
  name: string;
  domain: string | null;
  webflowSiteId: string | null;
  webflowApiToken: string | null;
};
type Job = { id: string; status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED"; errorMessage: string | null };
type PublishJob = Job & { action: "STAGE" | "GO_LIVE"; itemsTotal: number; itemsProcessed: number };

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);
const PAGE_SIZE = 25;

function latestJobStatusText(jobs: Job[] | undefined): string {
  if (!jobs || jobs.length === 0) return "never run";
  const latest = jobs[0];
  if (latest.status === "FAILED") return `failed: ${latest.errorMessage ?? "unknown error"}`;
  return latest.status.toLowerCase();
}

function pollWhileActive(jobs: Job[] | undefined): number {
  if (jobs && jobs.length > 0 && ACTIVE_STATUSES.has(jobs[0].status)) return 3000;
  return 0;
}

function latestPublishJob(jobs: PublishJob[] | undefined, action: "STAGE" | "GO_LIVE") {
  return jobs?.find((j) => j.action === action);
}

function publishJobStatusText(job: PublishJob | undefined): string | null {
  if (!job) return null;
  if (job.status === "FAILED") return `failed: ${job.errorMessage ?? "unknown error"} (${job.itemsProcessed}/${job.itemsTotal})`;
  if (job.status === "COMPLETE") return `done — ${job.itemsProcessed}/${job.itemsTotal} processed`;
  return `${job.status.toLowerCase()} — ${job.itemsProcessed}/${job.itemsTotal} processed`;
}

export default function ClientPage() {
  const { clientId } = useParams<{ clientId: string }>();

  const { data: client, mutate: mutateClient } = useSWR<Client>(`/api/clients/${clientId}`, fetcher);
  const { data: rows, mutate: mutateRows } = useSWR<ReviewRowData[]>(
    `/api/clients/${clientId}/review`,
    fetcher
  );
  const { data: crawlJobs, mutate: mutateCrawlJobs } = useSWR<Job[]>(
    `/api/clients/${clientId}/crawl-jobs`,
    fetcher,
    { refreshInterval: pollWhileActive }
  );
  const { data: suggestionJobs, mutate: mutateSuggestionJobs } = useSWR<Job[]>(
    `/api/clients/${clientId}/suggestion-jobs`,
    fetcher,
    { refreshInterval: pollWhileActive }
  );
  const { data: publishJobs, mutate: mutatePublishJobs } = useSWR<PublishJob[]>(
    `/api/clients/${clientId}/publish-jobs`,
    fetcher,
    { refreshInterval: pollWhileActive }
  );

  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [flagTypeFilter, setFlagTypeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"severity" | "url">("severity");
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDomain, setSettingsDomain] = useState("");
  const [settingsWebflowSiteId, setSettingsWebflowSiteId] = useState("");
  const [settingsWebflowApiToken, setSettingsWebflowApiToken] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const latestStageJob = latestPublishJob(publishJobs, "STAGE");
  const latestGoLiveJob = latestPublishJob(publishJobs, "GO_LIVE");
  const stagingActive = !!latestStageJob && ACTIVE_STATUSES.has(latestStageJob.status);
  const goingLiveActive = !!latestGoLiveJob && ACTIVE_STATUSES.has(latestGoLiveJob.status);

  const flagTypes = useMemo(() => {
    const set = new Set<string>();
    rows?.forEach((r) => r.flags.forEach((f) => set.add(f.flagType)));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const filtered = rows.filter((r) => {
      if (severityFilter !== "ALL" && r.maxSeverity !== severityFilter) return false;
      if (statusFilter !== "ALL") {
        const status = r.suggestion?.status ?? "NONE";
        if (status !== statusFilter) return false;
      }
      if (flagTypeFilter !== "ALL" && !r.flags.some((f) => f.flagType === flagTypeFilter)) return false;
      return true;
    });

    const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    if (sortBy === "severity") {
      return [...filtered].sort(
        (a, b) => (severityRank[a.maxSeverity ?? "LOW"] ?? 3) - (severityRank[b.maxSeverity ?? "LOW"] ?? 3)
      );
    }
    return [...filtered].sort((a, b) => a.url.localeCompare(b.url));
  }, [rows, severityFilter, statusFilter, flagTypeFilter, sortBy]);

  const approvedCount = useMemo(
    () => rows?.filter((r) => r.suggestion?.status === "APPROVED").length ?? 0,
    [rows]
  );

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  async function runCrawl() {
    setActionError(null);
    try {
      await apiRequest(`/api/clients/${clientId}/crawl-jobs`, "POST");
      mutateCrawlJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start crawl");
    }
  }

  async function generateSuggestions() {
    setActionError(null);
    try {
      await apiRequest(`/api/clients/${clientId}/suggestion-jobs`, "POST");
      mutateSuggestionJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start suggestion generation");
    }
  }

  async function bulkApprove(severity?: string) {
    const ids = filteredRows
      .filter(
        (r) =>
          (!severity || r.maxSeverity === severity) &&
          r.suggestion &&
          (r.suggestion.status === "PENDING" || r.suggestion.status === "EDITED")
      )
      .map((r) => r.suggestion!.id);
    if (ids.length === 0) return;

    setActionError(null);
    try {
      await apiRequest("/api/suggestions/bulk-action", "POST", { ids, action: "approve" });
      mutateRows();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk approve failed");
    }
  }

  async function stageChanges() {
    setActionError(null);
    try {
      await apiRequest(`/api/clients/${clientId}/publish-jobs`, "POST", { action: "STAGE" });
      mutatePublishJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start staging");
    }
  }

  async function goLive() {
    const confirmed = window.confirm(
      `This publishes the ENTIRE Webflow site live for ${client?.name ?? "this client"} — not just these ` +
        `${approvedCount} approved change(s). Anything else pending in the Designer goes live too. Continue?`
    );
    if (!confirmed) return;

    setActionError(null);
    try {
      await apiRequest(`/api/clients/${clientId}/publish-jobs`, "POST", { action: "GO_LIVE" });
      mutatePublishJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start go-live");
    }
  }

  function openSettings() {
    setSettingsDomain(client?.domain ?? "");
    setSettingsWebflowSiteId(client?.webflowSiteId ?? "");
    setSettingsWebflowApiToken(client?.webflowApiToken ?? "");
    setSettingsError(null);
    setSettingsOpen(true);
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError(null);
    setSavingSettings(true);
    try {
      await apiRequest(`/api/clients/${clientId}`, "PATCH", {
        domain: settingsDomain || null,
        webflowSiteId: settingsWebflowSiteId || null,
        webflowApiToken: settingsWebflowApiToken || null,
      });
      mutateClient();
      setSettingsOpen(false);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl w-full px-6 py-8">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← All clients
      </Link>

      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-semibold">{client?.name ?? "…"}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={runCrawl}
            className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Run Crawl
          </button>
          <span className="text-xs text-zinc-500 w-24">{latestJobStatusText(crawlJobs)}</span>
          <button
            onClick={generateSuggestions}
            className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Generate Suggestions
          </button>
          <span className="text-xs text-zinc-500 w-24">{latestJobStatusText(suggestionJobs)}</span>
          <button
            onClick={() => (settingsOpen ? setSettingsOpen(false) : openSettings())}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
          >
            {settingsOpen ? "Cancel" : "Settings"}
          </button>
        </div>
      </div>

      {settingsOpen && (
        <form onSubmit={saveSettings} className="mb-6 rounded border border-zinc-200 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Domain (crawl start URL)</label>
            <input
              value={settingsDomain}
              onChange={(e) => setSettingsDomain(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black"
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Webflow Site ID</label>
            <input
              value={settingsWebflowSiteId}
              onChange={(e) => setSettingsWebflowSiteId(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black"
              placeholder="Site Settings → General → Site ID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Webflow API Token</label>
            <input
              value={settingsWebflowApiToken}
              onChange={(e) => setSettingsWebflowApiToken(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black font-mono"
              placeholder="Site Settings → Apps & Integrations → API access"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Webflow tokens are scoped per-site — this client&apos;s token must be generated from this site&apos;s
              own Apps &amp; Integrations tab, not copied from another client.
            </p>
          </div>
          {settingsError && <p className="text-sm text-red-600">{settingsError}</p>}
          <button
            type="submit"
            disabled={savingSettings}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {savingSettings ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      <div className="mb-6 rounded border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={stageChanges}
            disabled={stagingActive || approvedCount === 0}
            className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            {stagingActive ? "Staging…" : `Stage Changes (${approvedCount} approved)`}
          </button>
          <span className="text-xs text-zinc-600">
            Writes approved changes into Webflow as drafts. Not live yet. Runs in the background via the local
            agent — hundreds of items are processed in small batches to stay under Webflow&apos;s rate limit.
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={goLive}
            disabled={goingLiveActive || approvedCount === 0}
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-40"
          >
            {goingLiveActive ? "Publishing…" : "Go Live"}
          </button>
          <span className="text-xs text-zinc-600">
            Publishes the entire site — including anything else pending in the Designer.
          </span>
        </div>

        {publishJobStatusText(latestStageJob) && (
          <p className="mt-2 text-sm">Stage: {publishJobStatusText(latestStageJob)}</p>
        )}
        {publishJobStatusText(latestGoLiveJob) && (
          <p className="mt-2 text-sm">Go live: {publishJobStatusText(latestGoLiveJob)}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <label className="flex items-center gap-1">
          Severity:
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-black"
          >
            <option value="ALL">All</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Status:
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-black"
          >
            <option value="ALL">All</option>
            <option value="NONE">No suggestion</option>
            <option value="PENDING">Pending</option>
            <option value="EDITED">Edited</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Flag type:
          <select
            value={flagTypeFilter}
            onChange={(e) => setFlagTypeFilter(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-black"
          >
            <option value="ALL">All</option>
            {flagTypes.map((ft) => (
              <option key={ft} value={ft}>
                {ft}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Sort:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "severity" | "url")}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-black"
          >
            <option value="severity">Severity</option>
            <option value="url">URL</option>
          </select>
        </label>

        <div className="ml-auto flex gap-2">
          {["HIGH", "MEDIUM", "LOW"].map((sev) => (
            <button
              key={sev}
              onClick={() => bulkApprove(sev)}
              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
            >
              Bulk approve {sev.toLowerCase()}
            </button>
          ))}
          <button
            onClick={() => bulkApprove()}
            className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50"
          >
            Bulk approve all
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">URL</th>
              <th className="px-3 py-2 font-medium">Current</th>
              <th className="px-3 py-2 font-medium">Flags</th>
              <th className="px-3 py-2 font-medium">Suggested</th>
              <th className="px-3 py-2 font-medium">Rationale</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pagedRows.map((row) => (
              <ReviewRow key={row.pageId} row={row} onChanged={() => mutateRows()} />
            ))}
          </tbody>
        </table>
        {rows && filteredRows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">No pages match the current filters.</p>
        )}
      </div>

      {filteredRows.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
          <span>
            {currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, filteredRows.length)} of{" "}
            {filteredRows.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
              className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
