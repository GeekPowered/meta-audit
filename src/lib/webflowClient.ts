const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

// Webflow API tokens are scoped per-site (created under a site's Apps &
// Integrations tab), not per-workspace — a token authorized for one client's
// site gets "resource not found" (not a 403) on another client's site. So the
// token is a parameter here, sourced from each Client row, not a single
// global env var.
function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Webflow's rate limit (60 req/min on most plans) is easy to blow through when
// staging hundreds of suggestions concurrently. Retry 429s honoring Retry-After
// (falling back to exponential backoff) instead of failing the whole item.
async function webflowRequest<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${WEBFLOW_API_BASE}${path}`, {
      ...options,
      headers: { ...authHeaders(token), ...options.headers },
    });

    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterHeader = Number(res.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : 1000 * 2 ** (attempt - 1);
      await sleep(delayMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Webflow API ${options.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
    }
    return res.json();
  }
  throw new Error(`Webflow API ${options.method ?? "GET"} ${path} failed: exhausted retries on 429`);
}

export type WebflowPage = {
  id: string;
  siteId: string;
  collectionId?: string;
  title: string;
  slug: string;
  draft: boolean;
  archived: boolean;
  seo?: { title?: string; description?: string };
  publishedPath?: string;
};

// Webflow paginates at 100/page max. Loops until exhausted, capped as a safety backstop.
export async function listAllPages(token: string, siteId: string): Promise<WebflowPage[]> {
  const pages: WebflowPage[] = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const data = await webflowRequest<{ pages: WebflowPage[]; pagination: { total: number } }>(
      token,
      `/sites/${siteId}/pages?limit=100&offset=${offset}`
    );
    pages.push(...data.pages);
    offset += data.pages.length;
    if (offset >= data.pagination.total || data.pages.length === 0) break;
  }
  return pages;
}

export async function updatePageSeo(
  token: string,
  pageId: string,
  seo: { title: string; description: string }
): Promise<void> {
  // Confirmed against the real API: this endpoint is PUT, not PATCH (returns
  // 404 RouteNotFoundError otherwise). Behaves as a partial update in practice —
  // fields not included in the body (e.g. openGraph) are left untouched.
  await webflowRequest(token, `/pages/${pageId}`, {
    method: "PUT",
    body: JSON.stringify({ seo }),
  });
}

export type WebflowCollectionItem = {
  id: string;
  fieldData: Record<string, unknown>;
};

export async function findCollectionItemBySlug(
  token: string,
  collectionId: string,
  slug: string
): Promise<WebflowCollectionItem | null> {
  const data = await webflowRequest<{ items: WebflowCollectionItem[] }>(
    token,
    `/collections/${collectionId}/items?slug=${encodeURIComponent(slug)}&limit=1`
  );
  return data.items[0] ?? null;
}

export async function updateCollectionItemFields(
  token: string,
  collectionId: string,
  itemId: string,
  fieldData: Record<string, string>
): Promise<void> {
  await webflowRequest(token, `/collections/${collectionId}/items`, {
    method: "PATCH",
    body: JSON.stringify({ items: [{ id: itemId, fieldData }] }),
  });
}

export async function publishCollectionItems(
  token: string,
  collectionId: string,
  itemIds: string[]
): Promise<void> {
  await webflowRequest(token, `/collections/${collectionId}/items/publish`, {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
}

// Publishes the ENTIRE site — not scoped to any specific page or change.
// Anything else pending in the Designer goes live too. Callers must treat
// this as a shared, hard-to-reverse action, not a per-change publish.
//
// Confirmed against the real API: the endpoint rejects the request with
// "You must pass at least one valid domain id" unless customDomains is
// populated with actual domain IDs — a boolean flag alone isn't enough.
export async function publishSite(token: string, siteId: string): Promise<void> {
  const site = await webflowRequest<{ customDomains: { id: string }[] }>(token, `/sites/${siteId}`);
  await webflowRequest(token, `/sites/${siteId}/publish`, {
    method: "POST",
    body: JSON.stringify({
      customDomains: site.customDomains.map((d) => d.id),
      publishToWebflowSubdomain: false,
    }),
  });
}
