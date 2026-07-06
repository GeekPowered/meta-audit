import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebflowTarget } from "@/lib/resolveWebflowTarget";
import { updatePageSeo, updateCollectionItemFields } from "@/lib/webflowClient";

type Params = { params: Promise<{ id: string }> };

// Stages approved suggestions into Webflow (page/CMS field updates) WITHOUT
// publishing the site live. Webflow's publish call isn't scoped to just our
// changes — it pushes everything pending in the Designer, so going live is a
// separate, explicit action (see the go-live route) rather than automatic here.
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

  const results = [];

  for (const suggestion of approved) {
    const title = suggestion.editedTitle ?? suggestion.suggestedTitle;
    const description = suggestion.editedDescription ?? suggestion.suggestedDescription;

    if (!title || !description) {
      await logPublish(suggestion.pageId, "FAIL", "Missing title or description on the approved suggestion");
      results.push({ pageId: suggestion.pageId, url: suggestion.page.url, result: "FAIL" });
      continue;
    }

    try {
      const target = await resolveWebflowTarget(client.webflowSiteId, suggestion.page.url);

      if (!target) {
        await logPublish(suggestion.pageId, "FAIL", "Could not match this URL to a Webflow page or CMS item");
        results.push({ pageId: suggestion.pageId, url: suggestion.page.url, result: "FAIL" });
        continue;
      }

      if (target.type === "page") {
        await updatePageSeo(target.pageId, { title, description });
        await logPublish(suggestion.pageId, "SUCCESS", `Staged static page update (pageId ${target.pageId})`);
      } else {
        await updateCollectionItemFields(target.collectionId, target.itemId, {
          [target.titleField]: title,
          [target.descriptionField]: description,
        });
        await logPublish(
          suggestion.pageId,
          "SUCCESS",
          `Staged CMS item update (collection ${target.collectionId}, item ${target.itemId})`
        );
      }
      results.push({ pageId: suggestion.pageId, url: suggestion.page.url, result: "SUCCESS" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      await logPublish(suggestion.pageId, "FAIL", message);
      results.push({ pageId: suggestion.pageId, url: suggestion.page.url, result: "FAIL", error: message });
    }
  }

  return NextResponse.json({
    staged: results.filter((r) => r.result === "SUCCESS").length,
    failed: results.filter((r) => r.result === "FAIL").length,
    results,
  });
}

async function logPublish(pageId: string, result: "SUCCESS" | "FAIL", details: string) {
  await prisma.publishLog.create({ data: { pageId, result, details } });
}
