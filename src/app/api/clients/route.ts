import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, domain, webflowSiteId, gscPropertyId, keywordMap, brandVoiceProfile } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: { name, domain, webflowSiteId, gscPropertyId, keywordMap, brandVoiceProfile },
  });

  return NextResponse.json(client, { status: 201 });
}
