import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eligibleSuggestionsWhere } from "@/lib/processPublishBatch";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const jobs = await prisma.publishJob.findMany({
    where: { clientId: id },
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json(jobs);
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const action = body?.action;

  if (action !== "STAGE" && action !== "GO_LIVE") {
    return NextResponse.json({ error: 'action must be "STAGE" or "GO_LIVE"' }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }
  if (!client.webflowSiteId) {
    return NextResponse.json({ error: "client has no webflowSiteId set" }, { status: 400 });
  }

  const itemsTotal = await prisma.suggestion.count({
    where: eligibleSuggestionsWhere(id, action),
  });

  if (itemsTotal === 0) {
    return NextResponse.json(
      { error: `no approved suggestions pending for ${action === "STAGE" ? "staging" : "go-live"}` },
      { status: 400 }
    );
  }

  const job = await prisma.publishJob.create({ data: { clientId: id, action, itemsTotal } });
  return NextResponse.json(job, { status: 201 });
}
