import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const jobs = await prisma.suggestionJob.findMany({
    where: { clientId: id },
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json(jobs);
}

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const pagesTotal = await prisma.page.count({
    where: { clientId: id, auditFlags: { some: {} }, suggestions: { none: {} } },
  });

  if (pagesTotal === 0) {
    return NextResponse.json(
      { error: "no flagged pages without existing suggestions to process" },
      { status: 400 }
    );
  }

  const job = await prisma.suggestionJob.create({ data: { clientId: id, pagesTotal } });
  return NextResponse.json(job, { status: 201 });
}
