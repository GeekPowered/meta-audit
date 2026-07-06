import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestCrawlCsv } from "@/lib/ingestCrawlCsv";
import { flagClientPages } from "@/lib/flagClientPages";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  const job = await prisma.crawlJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "crawl job not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("csv");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing csv file field" }, { status: 400 });
  }

  const csvText = await file.text();

  try {
    const pagesFound = await ingestCrawlCsv(job.clientId, csvText);
    const flagsCreated = await flagClientPages(job.clientId);
    const updated = await prisma.crawlJob.update({
      where: { id },
      data: { status: "COMPLETE", completedAt: new Date(), pagesFound },
    });
    return NextResponse.json({ ...updated, flagsCreated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown ingestion error";
    const updated = await prisma.crawlJob.update({
      where: { id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: message },
    });
    return NextResponse.json(updated, { status: 422 });
  }
}
