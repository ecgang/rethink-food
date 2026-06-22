-- CreateEnum
CREATE TYPE "DraftCommKind" AS ENUM ('INTAKE_CLARIFICATION', 'DELIVERY_NUDGE', 'RECONCILIATION_FLAG', 'REPORT_NARRATIVE');

-- CreateEnum
CREATE TYPE "DraftCommStatus" AS ENUM ('DRAFT', 'APPROVED', 'DISCARDED');

-- CreateTable
CREATE TABLE "AskLog" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "askedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftComm" (
    "id" TEXT NOT NULL,
    "kind" "DraftCommKind" NOT NULL,
    "relatedEntityType" TEXT NOT NULL,
    "relatedEntityId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "DraftCommStatus" NOT NULL DEFAULT 'DRAFT',
    "modelUsed" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "DraftComm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AskLog_createdAt_idx" ON "AskLog"("createdAt");

-- CreateIndex
CREATE INDEX "DraftComm_status_generatedAt_idx" ON "DraftComm"("status", "generatedAt");

