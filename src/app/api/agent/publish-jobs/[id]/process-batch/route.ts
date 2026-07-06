import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPublishBatch } from "@/lib/processPublishBatch";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  try {
    const result = await processPublishBatch(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await prisma.publishJob.update({
      where: { id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
