-- CreateEnum
CREATE TYPE "PublishAction" AS ENUM ('STAGE', 'GO_LIVE');

-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN     "liveAt" TIMESTAMP(3),
ADD COLUMN     "stagedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PublishJob" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "action" "PublishAction" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "itemsTotal" INTEGER NOT NULL DEFAULT 0,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishJob_clientId_idx" ON "PublishJob"("clientId");

-- CreateIndex
CREATE INDEX "PublishJob_status_idx" ON "PublishJob"("status");

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
