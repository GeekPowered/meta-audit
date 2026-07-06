-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "PublishResult" AS ENUM ('SUCCESS', 'FAIL');

-- CreateEnum
CREATE TYPE "CrawlJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webflowSiteId" TEXT,
    "gscPropertyId" TEXT,
    "keywordMap" JSONB,
    "brandVoiceProfile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "currentTitle" TEXT,
    "currentDescription" TEXT,
    "h1" TEXT,
    "statusCode" INTEGER,
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFlag" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "flagType" TEXT NOT NULL,
    "severity" "FlagSeverity" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "suggestedTitle" TEXT,
    "suggestedDescription" TEXT,
    "rationale" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "editedTitle" TEXT,
    "editedDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishLog" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "PublishResult" NOT NULL,
    "details" TEXT,

    CONSTRAINT "PublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "CrawlJobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "pagesFound" INTEGER,

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Page_clientId_idx" ON "Page"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_clientId_url_key" ON "Page"("clientId", "url");

-- CreateIndex
CREATE INDEX "AuditFlag_pageId_idx" ON "AuditFlag"("pageId");

-- CreateIndex
CREATE INDEX "AuditFlag_severity_idx" ON "AuditFlag"("severity");

-- CreateIndex
CREATE INDEX "Suggestion_pageId_idx" ON "Suggestion"("pageId");

-- CreateIndex
CREATE INDEX "Suggestion_status_idx" ON "Suggestion"("status");

-- CreateIndex
CREATE INDEX "PublishLog_pageId_idx" ON "PublishLog"("pageId");

-- CreateIndex
CREATE INDEX "CrawlJob_clientId_idx" ON "CrawlJob"("clientId");

-- CreateIndex
CREATE INDEX "CrawlJob_status_idx" ON "CrawlJob"("status");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFlag" ADD CONSTRAINT "AuditFlag_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishLog" ADD CONSTRAINT "PublishLog_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlJob" ADD CONSTRAINT "CrawlJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
