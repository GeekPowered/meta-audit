import { prisma } from "@/lib/prisma";
import type { Page, Client } from "@/generated/prisma/client";
import { TITLE_MIN, TITLE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX } from "@/lib/seoLimits";

type Severity = "HIGH" | "MEDIUM" | "LOW";

type FlagInput = {
  pageId: string;
  flagType: string;
  severity: Severity;
  reason: string;
};

// A "template family" needs at least this many pages sharing the same word-count
// and near-identical wording before we call it boilerplate rather than coincidence.
const TEMPLATE_MIN_GROUP_SIZE = 3;
const TEMPLATE_MAX_DIFFERING_WORDS = 2;

const TITLE_DELIMITERS = /[|\-–—]/;

// Re-derives every AuditFlag for a client from its current Page rows. Called
// after each crawl ingestion so flags never go stale between crawls.
export async function flagClientPages(clientId: string): Promise<number> {
  const [client, pages] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.page.findMany({ where: { clientId } }),
  ]);

  // Skip content-quality checks on pages that aren't actually indexable/live.
  const livePages = pages.filter((page) => page.statusCode === 200);

  const flags: FlagInput[] = [];
  for (const page of livePages) {
    flags.push(...checkMissingAndLength(page));
    flags.push(...checkBusinessNameSuffix(page, client));
    flags.push(...checkMissingKeyword(page, client));
  }
  flags.push(...checkDuplicates(livePages, "currentTitle", "duplicate_title", "title"));
  flags.push(...checkDuplicates(livePages, "currentDescription", "duplicate_description", "meta description"));
  flags.push(...checkTemplatedBoilerplate(livePages, "currentTitle", "templated_title", "title"));
  flags.push(...checkTemplatedBoilerplate(livePages, "currentDescription", "templated_description", "meta description"));

  const pageIds = pages.map((page) => page.id);
  await prisma.$transaction([
    prisma.auditFlag.deleteMany({ where: { pageId: { in: pageIds } } }),
    ...(flags.length > 0 ? [prisma.auditFlag.createMany({ data: flags })] : []),
  ]);

  return flags.length;
}

function checkMissingAndLength(page: Page): FlagInput[] {
  const flags: FlagInput[] = [];

  const title = page.currentTitle?.trim();
  if (!title) {
    flags.push({
      pageId: page.id,
      flagType: "missing_title",
      severity: "HIGH",
      reason: "Title tag is missing or empty.",
    });
  } else if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    flags.push({
      pageId: page.id,
      flagType: "title_length",
      severity: "MEDIUM",
      reason: `Title is ${title.length} characters (recommended ${TITLE_MIN}-${TITLE_MAX}).`,
    });
  }

  const description = page.currentDescription?.trim();
  if (!description) {
    flags.push({
      pageId: page.id,
      flagType: "missing_description",
      severity: "HIGH",
      reason: "Meta description is missing or empty.",
    });
  } else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    flags.push({
      pageId: page.id,
      flagType: "description_length",
      severity: "MEDIUM",
      reason: `Meta description is ${description.length} characters (recommended ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}).`,
    });
  }

  return flags;
}

function checkBusinessNameSuffix(page: Page, client: Client): FlagInput[] {
  const title = page.currentTitle?.trim();
  if (!title || !client.name) return [];

  const segments = title.split(TITLE_DELIMITERS).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return [];

  const lastSegment = segments[segments.length - 1].toLowerCase();
  if (lastSegment !== client.name.trim().toLowerCase()) return [];

  return [
    {
      pageId: page.id,
      flagType: "business_name_suffix",
      severity: "LOW",
      reason: `Title ends with the business name ("${client.name}"), which uses up character budget.`,
    },
  ];
}

function checkMissingKeyword(page: Page, client: Client): FlagInput[] {
  const keywordMap = client.keywordMap as Record<string, string> | null;
  if (!keywordMap) return [];

  let pathname: string;
  try {
    pathname = new URL(page.url).pathname;
  } catch {
    return [];
  }

  const targetKeyword = keywordMap[pathname]?.trim();
  if (!targetKeyword) return [];

  const haystack = `${page.currentTitle ?? ""} ${page.currentDescription ?? ""}`.toLowerCase();
  if (haystack.includes(targetKeyword.toLowerCase())) return [];

  return [
    {
      pageId: page.id,
      flagType: "missing_target_keyword",
      severity: "MEDIUM",
      reason: `Target keyword "${targetKeyword}" not found in title or description.`,
    },
  ];
}

function checkDuplicates(
  pages: Page[],
  field: "currentTitle" | "currentDescription",
  flagType: string,
  label: string
): FlagInput[] {
  const groups = new Map<string, Page[]>();
  for (const page of pages) {
    const value = page[field]?.trim().toLowerCase();
    if (!value) continue;
    const group = groups.get(value) ?? [];
    group.push(page);
    groups.set(value, group);
  }

  const flags: FlagInput[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const page of group) {
      const others = group.filter((p) => p.id !== page.id).map((p) => p.url);
      const shown = others.slice(0, 3).join(", ");
      flags.push({
        pageId: page.id,
        flagType,
        severity: "MEDIUM",
        reason: `Same ${label} used on ${others.length} other page(s): ${shown}${others.length > 3 ? ", ..." : ""}`,
      });
    }
  }
  return flags;
}

function checkTemplatedBoilerplate(
  pages: Page[],
  field: "currentTitle" | "currentDescription",
  flagType: string,
  label: string
): FlagInput[] {
  const withValue = pages
    .map((page) => ({ page, value: page[field]?.trim() }))
    .filter((entry): entry is { page: Page; value: string } => Boolean(entry.value));

  const byWordCount = new Map<number, { page: Page; words: string[] }[]>();
  for (const { page, value } of withValue) {
    const words = value.split(/\s+/);
    if (words.length < 4) continue; // too short to meaningfully template-match
    const bucket = byWordCount.get(words.length) ?? [];
    bucket.push({ page, words });
    byWordCount.set(words.length, bucket);
  }

  const flags: FlagInput[] = [];

  for (const bucket of byWordCount.values()) {
    if (bucket.length < TEMPLATE_MIN_GROUP_SIZE) continue;

    const wordCount = bucket[0].words.length;
    const positionCounts: Map<string, number>[] = Array.from({ length: wordCount }, () => new Map());
    for (const { words } of bucket) {
      words.forEach((word, i) => {
        const key = word.toLowerCase();
        positionCounts[i].set(key, (positionCounts[i].get(key) ?? 0) + 1);
      });
    }

    const consensus = positionCounts.map((counts) => {
      let bestWord = "";
      let bestCount = 0;
      for (const [word, count] of counts) {
        if (count > bestCount) {
          bestWord = word;
          bestCount = count;
        }
      }
      return bestWord;
    });

    // Note: a page can legitimately match the consensus at every position (differing
    // === 0) if its wording happens to be the per-position majority — it's still part
    // of the same template family and must be flagged along with its siblings.
    const matches = bucket.filter(({ words }) => {
      const differing = words.filter((word, i) => word.toLowerCase() !== consensus[i]).length;
      return differing <= TEMPLATE_MAX_DIFFERING_WORDS;
    });

    if (matches.length < TEMPLATE_MIN_GROUP_SIZE) continue;

    for (const { page } of matches) {
      flags.push({
        pageId: page.id,
        flagType,
        severity: "MEDIUM",
        reason: `${label} follows the same template as ${matches.length - 1} other page(s), differing by ${TEMPLATE_MAX_DIFFERING_WORDS} word(s) or fewer.`,
      });
    }
  }

  return flags;
}
