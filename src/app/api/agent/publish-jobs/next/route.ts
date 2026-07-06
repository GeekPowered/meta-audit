import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Polled by the local agent. Claims the oldest QUEUED publish job the same
// way /api/agent/suggestion-jobs/next does — conditional update prevents double-claim.
export async function GET() {
  const job = await prisma.publishJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { requestedAt: "asc" },
  });

  if (!job) {
    return NextResponse.json({ job: null });
  }

  const claimed = await prisma.publishJob.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  if (claimed.count === 0) {
    return NextResponse.json({ job: null });
  }

  return NextResponse.json({ job: { id: job.id, clientId: job.clientId, action: job.action } });
}
