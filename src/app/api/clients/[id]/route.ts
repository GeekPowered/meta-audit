import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(client);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const client = await prisma.client.update({ where: { id }, data: body });
  return NextResponse.json(client);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await prisma.client.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
