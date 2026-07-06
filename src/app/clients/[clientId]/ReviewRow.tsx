"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { TITLE_MIN, TITLE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX } from "@/lib/seoLimits";

function inRange(length: number, min: number, max: number) {
  return length >= min && length <= max;
}

type Flag = { id: string; flagType: string; severity: "HIGH" | "MEDIUM" | "LOW"; reason: string };
type Suggestion = {
  id: string;
  suggestedTitle: string | null;
  suggestedTitleLength: number;
  suggestedTitleInRange: boolean;
  suggestedDescription: string | null;
  suggestedDescriptionLength: number;
  suggestedDescriptionInRange: boolean;
  rationale: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EDITED";
  editedTitle: string | null;
  editedDescription: string | null;
};

export type ReviewRowData = {
  pageId: string;
  url: string;
  currentTitle: string | null;
  currentTitleLength: number;
  currentTitleInRange: boolean;
  currentDescription: string | null;
  currentDescriptionLength: number;
  currentDescriptionInRange: boolean;
  flags: Flag[];
  maxSeverity: "HIGH" | "MEDIUM" | "LOW" | null;
  suggestion: Suggestion | null;
};

const SEVERITY_STYLES: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-zinc-100 text-zinc-700",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  EDITED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

function LengthBadge({ length, inRange }: { length: number; inRange: boolean }) {
  return <span className={inRange ? "text-green-700" : "text-red-700"}>{length} chars</span>;
}

export default function ReviewRow({ row, onChanged }: { row: ReviewRowData; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(row.suggestion?.editedTitle ?? row.suggestion?.suggestedTitle ?? "");
  const [descDraft, setDescDraft] = useState(
    row.suggestion?.editedDescription ?? row.suggestion?.suggestedDescription ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestion = row.suggestion;
  const displayedTitle = suggestion?.editedTitle ?? suggestion?.suggestedTitle;
  const displayedDescription = suggestion?.editedDescription ?? suggestion?.suggestedDescription;
  const displayedTitleLength = suggestion?.editedTitle?.length ?? suggestion?.suggestedTitleLength ?? 0;
  const displayedTitleInRange = suggestion?.editedTitle
    ? inRange(suggestion.editedTitle.length, TITLE_MIN, TITLE_MAX)
    : (suggestion?.suggestedTitleInRange ?? false);
  const displayedDescriptionLength =
    suggestion?.editedDescription?.length ?? suggestion?.suggestedDescriptionLength ?? 0;
  const displayedDescriptionInRange = suggestion?.editedDescription
    ? inRange(suggestion.editedDescription.length, DESCRIPTION_MIN, DESCRIPTION_MAX)
    : (suggestion?.suggestedDescriptionInRange ?? false);

  async function saveEdit() {
    if (!suggestion) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}`, "PATCH", {
        editedTitle: titleDraft,
        editedDescription: descDraft,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!suggestion) return;
    setError(null);
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}/approve`, "POST");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function reject() {
    if (!suggestion) return;
    setError(null);
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}/reject`, "POST");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    }
  }

  return (
    <tr className="align-top">
      <td className="px-3 py-3 max-w-xs break-words text-zinc-600">{row.url}</td>

      <td className="px-3 py-3 max-w-xs">
        <div className="font-medium">{row.currentTitle || <span className="italic text-zinc-400">missing</span>}</div>
        <LengthBadge length={row.currentTitleLength} inRange={row.currentTitleInRange} />
        <div className="mt-1 text-zinc-600">
          {row.currentDescription || <span className="italic text-zinc-400">missing</span>}
        </div>
        <LengthBadge length={row.currentDescriptionLength} inRange={row.currentDescriptionInRange} />
      </td>

      <td className="px-3 py-3 max-w-[10rem]">
        <div className="flex flex-col gap-1">
          {row.flags.map((flag) => (
            <span
              key={flag.id}
              title={flag.reason}
              className={`rounded px-1.5 py-0.5 text-xs w-fit ${SEVERITY_STYLES[flag.severity]}`}
            >
              {flag.flagType}
            </span>
          ))}
        </div>
      </td>

      <td className="px-3 py-3 max-w-sm">
        {!suggestion && <span className="italic text-zinc-400">no suggestion yet</span>}
        {suggestion && !editing && (
          <>
            <div className="font-medium">{displayedTitle}</div>
            <LengthBadge length={displayedTitleLength} inRange={displayedTitleInRange} />
            <div className="mt-1 text-zinc-600">{displayedDescription}</div>
            <LengthBadge length={displayedDescriptionLength} inRange={displayedDescriptionInRange} />
            <button onClick={() => setEditing(true)} className="mt-1 block text-xs text-blue-600 hover:underline">
              Edit
            </button>
          </>
        )}
        {suggestion && editing && (
          <div className="space-y-2">
            <div>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-black"
              />
              <LengthBadge length={titleDraft.length} inRange={inRange(titleDraft.length, TITLE_MIN, TITLE_MAX)} />
            </div>
            <div>
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={3}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-black"
              />
              <LengthBadge
                length={descDraft.length}
                inRange={inRange(descDraft.length, DESCRIPTION_MIN, DESCRIPTION_MAX)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="rounded bg-black px-2 py-1 text-xs text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </td>

      <td className="px-3 py-3 max-w-xs text-zinc-600">{suggestion?.rationale}</td>

      <td className="px-3 py-3">
        {suggestion && (
          <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[suggestion.status]}`}>
            {suggestion.status}
          </span>
        )}
      </td>

      <td className="px-3 py-3">
        {suggestion && suggestion.status !== "APPROVED" && suggestion.status !== "REJECTED" && (
          <div className="flex flex-col gap-1">
            <button onClick={approve} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">
              Approve
            </button>
            <button onClick={reject} className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">
              Reject
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
