import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Polled by the local Screaming Frog agent. Claims the oldest QUEUED job by
// conditionally flipping it to RUNNING — the `status: "QUEUED"` in the where
// clause means a second concurrent poller can't double-claim the same row.
export async function GET() {
  const job = await prisma.crawlJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { requestedAt: "asc" },
    include: { client: true },
  });

  if (!job) {
    return NextResponse.json({ job: null });
  }

  const claimed = await prisma.crawlJob.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  if (claimed.count === 0) {
    // Another poller claimed it between our read and write.
    return NextResponse.json({ job: null });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      clientId: job.clientId,
      domain: job.client.domain,
    },
  });
}
