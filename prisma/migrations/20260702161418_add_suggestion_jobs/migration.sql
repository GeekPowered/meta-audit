/*
  Warnings:

  - The `status` column on the `CrawlJob` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "CrawlJob" DROP COLUMN "status",
ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'QUEUED';

-- DropEnum
DROP TYPE "CrawlJobStatus";

-- CreateTable
CREATE TABLE "SuggestionJob" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "pagesTotal" INTEGER NOT NULL DEFAULT 0,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SuggestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuggestionJob_clientId_idx" ON "SuggestionJob"("clientId");

-- CreateIndex
CREATE INDEX "SuggestionJob_status_idx" ON "SuggestionJob"("status");

-- CreateIndex
CREATE INDEX "CrawlJob_status_idx" ON "CrawlJob"("status");

-- AddForeignKey
ALTER TABLE "SuggestionJob" ADD CONSTRAINT "SuggestionJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
