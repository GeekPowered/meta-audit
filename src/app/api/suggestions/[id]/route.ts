import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// Saves a human edit to a suggestion's title/description. Always moves status
// to EDITED — a fresh edit means the previous approve/reject decision (if any)
// no longer applies to this content and needs a new review pass.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { editedTitle, editedDescription } = body;

  const updated = await prisma.suggestion.update({
    where: { id },
    data: { editedTitle, editedDescription, status: "EDITED" },
  });

  return NextResponse.json(updated);
}
