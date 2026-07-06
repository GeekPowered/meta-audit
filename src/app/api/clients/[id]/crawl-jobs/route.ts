import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const crawlJobs = await prisma.crawlJob.findMany({
    where: { clientId: id },
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json(crawlJobs);
}

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }
  if (!client.domain) {
    return NextResponse.json(
      { error: "client has no domain set — cannot run a crawl" },
      { status: 400 }
    );
  }

  const crawlJob = await prisma.crawlJob.create({
    data: { clientId: id },
  });

  return NextResponse.json(crawlJob, { status: 201 });
}
