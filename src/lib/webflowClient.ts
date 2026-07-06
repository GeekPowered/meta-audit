const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

function authHeaders() {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    throw new Error("WEBFLOW_API_TOKEN is not configured");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function webflowRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WEBFLOW_API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webflow API ${options.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
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
export async function listAllPages(siteId: string): Promise<WebflowPage[]> {
  const pages: WebflowPage[] = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const data = await webflowRequest<{ pages: WebflowPage[]; pagination: { total: number } }>(
      `/sites/${siteId}/pages?limit=100&offset=${offset}`
    );
    pages.push(...data.pages);
    offset += data.pages.length;
    if (offset >= data.pagination.total || data.pages.length === 0) break;
  }
  return pages;
}

export async function updatePageSeo(
  pageId: string,
  seo: { title: string; description: string }
): Promise<void> {
  // Confirmed against the real API: this endpoint is PUT, not PATCH (returns
  // 404 RouteNotFoundError otherwise). Behaves as a partial update in practice —
  // fields not included in the body (e.g. openGraph) are left untouched.
  await webflowRequest(`/pages/${pageId}`, {
    method: "PUT",
    body: JSON.stringify({ seo }),
  });
}

export type WebflowCollectionItem = {
  id: string;
  fieldData: Record<string, unknown>;
};

export async function findCollectionItemBySlug(
  collectionId: string,
  slug: string
): Promise<WebflowCollectionItem | null> {
  const data = await webflowRequest<{ items: WebflowCollectionItem[] }>(
    `/collections/${collectionId}/items?slug=${encodeURIComponent(slug)}&limit=1`
  );
  return data.items[0] ?? null;
}

export async function updateCollectionItemFields(
  collectionId: string,
  itemId: string,
  fieldData: Record<string, string>
): Promise<void> {
  await webflowRequest(`/collections/${collectionId}/items`, {
    method: "PATCH",
    body: JSON.stringify({ items: [{ id: itemId, fieldData }] }),
  });
}

export async function publishCollectionItems(collectionId: string, itemIds: string[]): Promise<void> {
  await webflowRequest(`/collections/${collectionId}/items/publish`, {
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
export async function publishSite(siteId: string): Promise<void> {
  const site = await webflowRequest<{ customDomains: { id: string }[] }>(`/sites/${siteId}`);
  await webflowRequest(`/sites/${siteId}/publish`, {
    method: "POST",
    body: JSON.stringify({
      customDomains: site.customDomains.map((d) => d.id),
      publishToWebflowSubdomain: false,
    }),
  });
}
