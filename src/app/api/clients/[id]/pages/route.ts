import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TITLE_MIN, TITLE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX, lengthMeta } from "@/lib/seoLimits";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const pages = await prisma.page.findMany({
    where: { clientId: id },
    orderBy: { url: "asc" },
  });

  const withLengths = pages.map((page) => ({
    ...page,
    currentTitleLength: lengthMeta(page.currentTitle, TITLE_MIN, TITLE_MAX).length,
    currentTitleInRange: lengthMeta(page.currentTitle, TITLE_MIN, TITLE_MAX).inRange,
    currentDescriptionLength: lengthMeta(page.currentDescription, DESCRIPTION_MIN, DESCRIPTION_MAX).length,
    currentDescriptionInRange: lengthMeta(page.currentDescription, DESCRIPTION_MIN, DESCRIPTION_MAX).inRange,
  }));

  return NextResponse.json(withLengths);
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { url, currentTitle, currentDescription, h1, statusCode } = body;

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const page = await prisma.page.create({
    data: {
      clientId: id,
      url,
      currentTitle,
      currentDescription,
      h1,
      statusCode,
      lastCrawledAt: new Date(),
    },
  });

  return NextResponse.json(page, { status: 201 });
}
