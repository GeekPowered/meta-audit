"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, apiRequest } from "@/lib/apiClient";

type Client = {
  id: string;
  name: string;
  domain: string | null;
  webflowSiteId: string | null;
};

export default function Home() {
  const { data: clients, mutate, isLoading } = useSWR<Client[]>("/api/clients", fetcher);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("/api/clients", "POST", { name, domain: domain || undefined });
      setName("");
      setDomain("");
      setShowForm(false);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl w-full px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Meta Audit</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {showForm ? "Cancel" : "+ Add client"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 rounded border border-zinc-200 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black"
              placeholder="Acme Roofing"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Domain (crawl start URL)</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black"
              placeholder="https://example.com"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create client"}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-zinc-500">Loading clients…</p>}
      {!isLoading && clients?.length === 0 && (
        <p className="text-sm text-zinc-500">No clients yet. Add one to get started.</p>
      )}

      <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
        {clients?.map((client) => (
          <li key={client.id}>
            <Link
              href={`/clients/${client.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
            >
              <span className="font-medium">{client.name}</span>
              <span className="text-sm text-zinc-500">{client.domain || "no domain set"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
