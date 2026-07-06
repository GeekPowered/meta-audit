import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const { ids, action } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  const result = await prisma.suggestion.updateMany({
    where: { id: { in: ids } },
    data: { status: action === "approve" ? "APPROVED" : "REJECTED" },
  });

  return NextResponse.json({ updated: result.count });
}
