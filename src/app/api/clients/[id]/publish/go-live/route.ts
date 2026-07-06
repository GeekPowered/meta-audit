import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebflowTarget } from "@/lib/resolveWebflowTarget";
import { listAllPages, publishCollectionItems, publishSite } from "@/lib/webflowClient";
import { mapWithConcurrency } from "@/lib/concurrency";

type Params = { params: Promise<{ id: string }> };

// Vercel default (60s on most paid tiers) isn't enough for hundreds of
// suggestions even with concurrency — bump explicitly. Clamped/ignored on
// tiers that don't allow it.
export const maxDuration = 300;

// Actually makes staged changes live: publishes the specific CMS items touched
// by currently-approved suggestions, then publishes the site. Site publish is
// NOT scoped to our changes — anything else pending in the Designer goes live
// too. This is deliberately a separate call from /publish so staging (safe)
// and going live (shared, hard-to-reverse) require distinct confirmations.
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }
  if (!client.webflowSiteId) {
    return NextResponse.json({ error: "client has no webflowSiteId set" }, { status: 400 });
  }

  const approved = await prisma.suggestion.findMany({
    where: { status: "APPROVED", page: { clientId: id } },
    include: { page: true },
  });

  if (approved.length === 0) {
    return NextResponse.json({ error: "no approved suggestions to publish" }, { status: 400 });
  }

  // Fetch the site's page list ONCE and reuse it for every suggestion below.
  // resolveWebflowTarget used to fetch this internally per-call, which turned
  // into an N+1 (hundreds of full paginated re-fetches) and timed out the route.
  const pages = await listAllPages(client.webflowSiteId);

  const itemsByCollection = new Map<string, string[]>();

  const targets = await mapWithConcurrency(approved, 8, (suggestion) =>
    resolveWebflowTarget(pages, suggestion.page.url)
  );

  for (const target of targets) {
    if (target?.type === "cmsItem") {
      const ids = itemsByCollection.get(target.collectionId) ?? [];
      ids.push(target.itemId);
      itemsByCollection.set(target.collectionId, ids);
    }
  }

  for (const [collectionId, itemIds] of itemsByCollection) {
    await publishCollectionItems(collectionId, itemIds);
  }

  await publishSite(client.webflowSiteId);

  for (const suggestion of approved) {
    await prisma.publishLog.create({
      data: { pageId: suggestion.pageId, result: "SUCCESS", details: "Published live via site publish" },
    });
  }

  return NextResponse.json({
    collectionsPublished: itemsByCollection.size,
    pagesLive: approved.length,
  });
}
