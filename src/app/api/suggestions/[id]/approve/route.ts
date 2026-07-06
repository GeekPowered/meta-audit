import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  // Reset stagedAt/liveAt so re-approving after an edit re-pushes the new
  // content instead of the publish batch processor treating it as done.
  const updated = await prisma.suggestion.update({
    where: { id },
    data: { status: "APPROVED", stagedAt: null, liveAt: null },
  });
  return NextResponse.json(updated);
}
