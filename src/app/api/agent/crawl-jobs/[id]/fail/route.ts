import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage : "unknown error";

  const updated = await prisma.crawlJob.update({
    where: { id },
    data: { status: "FAILED", completedAt: new Date(), errorMessage },
  });

  return NextResponse.json(updated);
}
