import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const flags = await prisma.auditFlag.findMany({
    where: { page: { clientId: id } },
    include: {
      page: { select: { url: true, currentTitle: true, currentDescription: true } },
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(flags);
}
