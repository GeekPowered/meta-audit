import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TITLE_MIN, TITLE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX, lengthMeta } from "@/lib/seoLimits";

type Params = { params: Promise<{ id: string }> };

const SEVERITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

// One row per flagged page, joining its flags and (at most one, per current
// eligibility rules) suggestion — built specifically for the Phase 5 review
// table so the frontend doesn't have to stitch together 3 separate fetches.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const pages = await prisma.page.findMany({
    where: { clientId: id, auditFlags: { some: {} } },
    include: {
      auditFlags: { orderBy: { severity: "asc" } },
      suggestions: true,
    },
    orderBy: { url: "asc" },
  });

  const rows = pages.map((page) => {
    const currentTitle = lengthMeta(page.currentTitle, TITLE_MIN, TITLE_MAX);
    const currentDescription = lengthMeta(page.currentDescription, DESCRIPTION_MIN, DESCRIPTION_MAX);
    const suggestion = page.suggestions[0] ?? null;

    const maxSeverity = page.auditFlags.reduce<null | "HIGH" | "MEDIUM" | "LOW">((worst, flag) => {
      if (!worst || SEVERITY_RANK[flag.severity] < SEVERITY_RANK[worst]) return flag.severity;
      return worst;
    }, null);

    return {
      pageId: page.id,
      url: page.url,
      statusCode: page.statusCode,
      lastCrawledAt: page.lastCrawledAt,
      currentTitle: page.currentTitle,
      currentTitleLength: currentTitle.length,
      currentTitleInRange: currentTitle.inRange,
      currentDescription: page.currentDescription,
      currentDescriptionLength: currentDescription.length,
      currentDescriptionInRange: currentDescription.inRange,
      flags: page.auditFlags.map((f) => ({
        id: f.id,
        flagType: f.flagType,
        severity: f.severity,
        reason: f.reason,
      })),
      maxSeverity,
      suggestion: suggestion
        ? {
            id: suggestion.id,
            suggestedTitle: suggestion.suggestedTitle,
            suggestedTitleLength: lengthMeta(suggestion.suggestedTitle, TITLE_MIN, TITLE_MAX).length,
            suggestedTitleInRange: lengthMeta(suggestion.suggestedTitle, TITLE_MIN, TITLE_MAX).inRange,
            suggestedDescription: suggestion.suggestedDescription,
            suggestedDescriptionLength: lengthMeta(suggestion.suggestedDescription, DESCRIPTION_MIN, DESCRIPTION_MAX)
              .length,
            suggestedDescriptionInRange: lengthMeta(
              suggestion.suggestedDescription,
              DESCRIPTION_MIN,
              DESCRIPTION_MAX
            ).inRange,
            rationale: suggestion.rationale,
            status: suggestion.status,
            editedTitle: suggestion.editedTitle,
            editedDescription: suggestion.editedDescription,
          }
        : null,
    };
  });

  return NextResponse.json(rows);
}
