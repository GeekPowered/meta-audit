import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";

// Screaming Frog's "Internal:All" export tab column names, matched
// case-insensitively since exact header text can shift slightly between
// SF versions/locales.
const FIELD_ALIASES = {
  url: ["address", "url"],
  statusCode: ["status code"],
  title: ["title 1"],
  description: ["meta description 1"],
  h1: ["h1-1", "h1"],
} as const;

type Field = keyof typeof FIELD_ALIASES;

function buildFieldLookup(headerKeys: string[]) {
  const normalized = new Map(headerKeys.map((k) => [k.trim().toLowerCase(), k]));
  const lookup: Partial<Record<Field, string>> = {};

  for (const field of Object.keys(FIELD_ALIASES) as Field[]) {
    for (const alias of FIELD_ALIASES[field]) {
      const match = normalized.get(alias);
      if (match) {
        lookup[field] = match;
        break;
      }
    }
  }

  return lookup;
}

export async function ingestCrawlCsv(clientId: string, csvText: string): Promise<number> {
  const records: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    // Screaming Frog's CSV exports always start with a UTF-8 BOM.
    bom: true,
  });

  if (records.length === 0) {
    return 0;
  }

  const lookup = buildFieldLookup(Object.keys(records[0]));
  if (!lookup.url) {
    throw new Error(
      `Could not find a URL column in the crawl export (looked for: ${FIELD_ALIASES.url.join(", ")}). Found columns: ${Object.keys(records[0]).join(", ")}`
    );
  }

  let count = 0;

  for (const record of records) {
    const url = record[lookup.url]?.trim();
    if (!url) continue;

    const statusCodeRaw = lookup.statusCode ? record[lookup.statusCode] : undefined;
    const parsedStatusCode = statusCodeRaw ? parseInt(statusCodeRaw, 10) : NaN;
    const statusCode = Number.isNaN(parsedStatusCode) ? null : parsedStatusCode;

    const data = {
      currentTitle: (lookup.title ? record[lookup.title] : "") || null,
      currentDescription: (lookup.description ? record[lookup.description] : "") || null,
      h1: (lookup.h1 ? record[lookup.h1] : "") || null,
      statusCode,
      lastCrawledAt: new Date(),
    };

    await prisma.page.upsert({
      where: { clientId_url: { clientId, url } },
      create: { clientId, url, ...data },
      update: data,
    });

    count++;
  }

  return count;
}
