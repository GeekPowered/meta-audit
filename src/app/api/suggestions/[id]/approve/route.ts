import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const updated = await prisma.suggestion.update({ where: { id }, data: { status: "APPROVED" } });
  return NextResponse.json(updated);
}
