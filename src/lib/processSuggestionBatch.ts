import { prisma } from "@/lib/prisma";
import { generateSuggestion } from "@/lib/generateSuggestion";

const BATCH_SIZE = 5;

// "Eligible" = has at least one audit flag and no suggestion yet. Regenerating
// suggestions for already-reviewed pages is a future enhancement, not v1.
const eligiblePagesWhere = (clientId: string) => ({
  clientId,
  auditFlags: { some: {} },
  suggestions: { none: {} },
});

export async function processSuggestionBatch(jobId: string) {
  const job = await prisma.suggestionJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { client: true },
  });

  const pages = await prisma.page.findMany({
    where: eligiblePagesWhere(job.clientId),
    include: { auditFlags: true },
    take: BATCH_SIZE,
  });

  for (const page of pages) {
    const result = await generateSuggestion(page, page.auditFlags, job.client);

    // Every page must leave the eligible pool one way or another, or a
    // persistently-refusing page would make the job loop forever.
    await prisma.suggestion.create({
      data: result
        ? {
            pageId: page.id,
            suggestedTitle: result.suggestedTitle,
            suggestedDescription: result.suggestedDescription,
            rationale: result.rationale,
          }
        : {
            pageId: page.id,
            rationale: "Claude declined to generate a suggestion for this page — needs manual review.",
          },
    });
  }

  const pagesProcessed = job.pagesProcessed + pages.length;
  const remaining = await prisma.page.count({ where: eligiblePagesWhere(job.clientId) });
  const done = remaining === 0;

  await prisma.suggestionJob.update({
    where: { id: jobId },
    data: {
      pagesProcessed,
      status: done ? "COMPLETE" : "RUNNING",
      completedAt: done ? new Date() : null,
    },
  });

  return { done, pagesProcessed, pagesTotal: job.pagesTotal };
}
