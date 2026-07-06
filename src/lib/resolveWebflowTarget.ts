import { listAllPages, findCollectionItemBySlug } from "@/lib/webflowClient";

export type WebflowTarget =
  | { type: "page"; pageId: string }
  | { type: "cmsItem"; collectionId: string; itemId: string; titleField: string; descriptionField: string }
  | null;

// Extracts the Webflow field slug a page's seo.title/description is bound to,
// from Webflow's own dynamic-binding syntax: {{wf {"path":"meta-title",...}}}.
// This reads the site's actual configured binding instead of guessing a field
// name — CMS field naming varies per client and per collection.
//
// Webflow's API returns this binding string with its quotes HTML-entity-escaped
// (confirmed against the real API, not just a display artifact) — decode before matching.
function extractBoundFieldSlug(bindingString: string | undefined): string | null {
  if (!bindingString) return null;
  const decoded = bindingString.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const match = decoded.match(/"path"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

// Resolves a crawled Page.url to either a static Webflow page or a CMS collection
// item, using the site's real page list as the source of truth. Returns null if
// no confident match is found — callers must treat that as "skip, don't guess."
export async function resolveWebflowTarget(siteId: string, pageUrl: string): Promise<WebflowTarget> {
  let pathname: string;
  try {
    pathname = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }

  const pages = await listAllPages(siteId);

  const staticMatch = pages.find(
    (p) => !p.collectionId && normalizePath(p.publishedPath) === pathname
  );
  if (staticMatch) {
    return { type: "page", pageId: staticMatch.id };
  }

  for (const templatePage of pages) {
    if (!templatePage.collectionId || !templatePage.publishedPath) continue;
    const prefix = normalizePath(templatePage.publishedPath);
    if (!pathname.startsWith(`${prefix}/`)) continue;

    const itemSlug = pathname.slice(prefix.length + 1);
    if (!itemSlug || itemSlug.includes("/")) continue;

    const titleField = extractBoundFieldSlug(templatePage.seo?.title);
    const descriptionField = extractBoundFieldSlug(templatePage.seo?.description);
    if (!titleField || !descriptionField) continue;

    const item = await findCollectionItemBySlug(templatePage.collectionId, itemSlug);
    if (!item) continue;

    return {
      type: "cmsItem",
      collectionId: templatePage.collectionId,
      itemId: item.id,
      titleField,
      descriptionField,
    };
  }

  return null;
}

function normalizePath(path: string | undefined): string {
  if (!path) return "";
  return path.replace(/\/+$/, "") || "/";
}
