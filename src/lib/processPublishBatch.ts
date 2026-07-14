import { prisma } from "@/lib/prisma";
import { resolveWebflowTarget } from "@/lib/resolveWebflowTarget";
import {
  listAllPages,
  updatePageSeo,
  updateCollectionItemFields,
  publishCollectionItems,
  publishSite,
} from "@/lib/webflowClient";

const BATCH_SIZE = 5;

// "Eligible" = approved and not yet pushed for this action. Processed
// sequentially within a batch (not concurrently) — Webflow's rate limit
// (60 req/min) is easy to blow through, and small sequential batches called
// repeatedly by the agent keep each request short without needing to tune
// concurrency against a shared external limit.
//
// GO_LIVE additionally requires stagedAt to be set — otherwise a suggestion
// approved but never staged would get "published" as whatever content is
// already sitting in Webflow (the old, un-updated title/description), while
// our tracking marks it liveAt as if the new content actually went out.
export const eligibleSuggestionsWhere = (clientId: string, action: "STAGE" | "GO_LIVE") => ({
  status: "APPROVED" as const,
  page: { clientId },
  ...(action === "STAGE"
    ? { stagedAt: null }
    : { stagedAt: { not: null }, liveAt: null }),
});

export async function processPublishBatch(jobId: string) {
  const job = await prisma.publishJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { client: true },
  });

  if (!job.client.webflowSiteId) {
    throw new Error("client has no webflowSiteId set");
  }
  const webflowSiteId = job.client.webflowSiteId;

  // Webflow tokens are scoped per-site — fall back to the shared env var only
  // for clients set up before per-client tokens existed.
  const token = job.client.webflowApiToken ?? process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    throw new Error("client has no webflowApiToken set and WEBFLOW_API_TOKEN env var is unset");
  }

  const suggestions = await prisma.suggestion.findMany({
    where: eligibleSuggestionsWhere(job.clientId, job.action),
    include: { page: true },
    take: BATCH_SIZE,
  });

  // Fetched once per batch call (not once per suggestion) — the original bug
  // that caused the timeout was resolveWebflowTarget re-fetching this per call.
  const pages = suggestions.length > 0 ? await listAllPages(token, webflowSiteId) : [];

  for (const suggestion of suggestions) {
    if (job.action === "STAGE") {
      await stageOne(token, suggestion, pages);
    } else {
      await goLiveOne(token, suggestion, pages);
    }
  }

  const itemsProcessed = job.itemsProcessed + suggestions.length;
  const remaining = await prisma.suggestion.count({
    where: eligibleSuggestionsWhere(job.clientId, job.action),
  });
  const done = remaining === 0;

  if (done && job.action === "GO_LIVE") {
    // Finalize once, after every approved suggestion's CMS item (if any) has
    // been individually published — site publish isn't scoped to our changes,
    // so it only needs to run once at the end, not per suggestion.
    await publishSite(token, webflowSiteId);
  }

  await prisma.publishJob.update({
    where: { id: jobId },
    data: {
      itemsProcessed,
      status: done ? "COMPLETE" : "RUNNING",
      completedAt: done ? new Date() : null,
    },
  });

  return { done, itemsProcessed, itemsTotal: job.itemsTotal };
}

type SuggestionWithPage = Awaited<ReturnType<typeof prisma.suggestion.findMany>>[number] & {
  page: { url: string };
};

async function stageOne(
  token: string,
  suggestion: SuggestionWithPage,
  pages: Awaited<ReturnType<typeof listAllPages>>
) {
  const title = suggestion.editedTitle ?? suggestion.suggestedTitle;
  const description = suggestion.editedDescription ?? suggestion.suggestedDescription;

  if (!title || !description) {
    await logAndAdvance(suggestion.id, suggestion.pageId, "FAIL", "Missing title or description", "stagedAt");
    return;
  }

  try {
    const target = await resolveWebflowTarget(token, pages, suggestion.page.url);
    if (!target) {
      await logAndAdvance(
        suggestion.id,
        suggestion.pageId,
        "FAIL",
        "Could not match this URL to a Webflow page or CMS item",
        "stagedAt"
      );
      return;
    }

    if (target.type === "page") {
      await updatePageSeo(token, target.pageId, { title, description });
      await logAndAdvance(
        suggestion.id,
        suggestion.pageId,
        "SUCCESS",
        `Staged static page update (pageId ${target.pageId})`,
        "stagedAt"
      );
    } else {
      await updateCollectionItemFields(token, target.collectionId, target.itemId, {
        [target.titleField]: title,
        [target.descriptionField]: description,
      });
      await logAndAdvance(
        suggestion.id,
        suggestion.pageId,
        "SUCCESS",
        `Staged CMS item update (collection ${target.collectionId}, item ${target.itemId})`,
        "stagedAt"
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await logAndAdvance(suggestion.id, suggestion.pageId, "FAIL", message, "stagedAt");
  }
}

async function goLiveOne(
  token: string,
  suggestion: SuggestionWithPage,
  pages: Awaited<ReturnType<typeof listAllPages>>
) {
  try {
    const target = await resolveWebflowTarget(token, pages, suggestion.page.url);
    if (target?.type === "cmsItem") {
      await publishCollectionItems(token, target.collectionId, [target.itemId]);
      await logAndAdvance(
        suggestion.id,
        suggestion.pageId,
        "SUCCESS",
        `Published CMS item live (collection ${target.collectionId}, item ${target.itemId})`,
        "liveAt"
      );
    } else {
      // Static pages go live via the single site-wide publish at the end of
      // the job — nothing per-item to do here beyond marking it processed.
      await logAndAdvance(suggestion.id, suggestion.pageId, "SUCCESS", "Static page — goes live with site publish", "liveAt");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await logAndAdvance(suggestion.id, suggestion.pageId, "FAIL", message, "liveAt");
  }
}

// Every suggestion must unconditionally leave the eligible pool (success or
// fail) or a persistently-failing item would make the job loop forever —
// same anti-infinite-loop guard used for suggestion generation.
async function logAndAdvance(
  suggestionId: string,
  pageId: string,
  result: "SUCCESS" | "FAIL",
  details: string,
  timestampField: "stagedAt" | "liveAt"
) {
  await prisma.publishLog.create({ data: { pageId, result, details } });
  await prisma.suggestion.update({
    where: { id: suggestionId },
    data: { [timestampField]: new Date() },
  });
}
