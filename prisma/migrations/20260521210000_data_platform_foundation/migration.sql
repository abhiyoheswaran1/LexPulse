-- AlterTable
ALTER TABLE "companies" ADD COLUMN "companyMasterId" TEXT;

-- CreateTable
CREATE TABLE "company_master" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normKey" TEXT NOT NULL,
    "ticker" TEXT,
    "cik" TEXT,
    "exchange" TEXT,
    "sic" TEXT,
    "sectorKey" TEXT,
    "universe" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_aliases" (
    "id" TEXT NOT NULL,
    "companyMasterId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observed_parties" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "companyId" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "rawName" TEXT NOT NULL,
    "normKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "metadata" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "observed_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_matches" (
    "id" TEXT NOT NULL,
    "observedPartyId" TEXT NOT NULL,
    "companyMasterId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "entity_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "companyMasterId" TEXT,
    "companyId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountUsd" DECIMAL(16,2),
    "metadata" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_outcomes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "externalEventId" TEXT,
    "outcomeType" TEXT NOT NULL,
    "outcomeDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_ingest_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "checkpoint" JSONB,
    "rowsFetched" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "data_ingest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_master_normKey_key" ON "company_master"("normKey");

-- CreateIndex
CREATE UNIQUE INDEX "company_master_ticker_key" ON "company_master"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "company_master_cik_key" ON "company_master"("cik");

-- CreateIndex
CREATE INDEX "company_master_name_idx" ON "company_master"("name");

-- CreateIndex
CREATE INDEX "company_master_sectorKey_idx" ON "company_master"("sectorKey");

-- CreateIndex
CREATE INDEX "company_master_exchange_idx" ON "company_master"("exchange");

-- CreateIndex
CREATE INDEX "company_aliases_normKey_idx" ON "company_aliases"("normKey");

-- CreateIndex
CREATE UNIQUE INDEX "company_aliases_companyMasterId_normKey_source_key" ON "company_aliases"("companyMasterId", "normKey", "source");

-- CreateIndex
CREATE INDEX "observed_parties_normKey_idx" ON "observed_parties"("normKey");

-- CreateIndex
CREATE INDEX "observed_parties_companyId_idx" ON "observed_parties"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "observed_parties_caseId_rawName_role_source_key" ON "observed_parties"("caseId", "rawName", "role", "source");

-- CreateIndex
CREATE INDEX "entity_matches_companyMasterId_idx" ON "entity_matches"("companyMasterId");

-- CreateIndex
CREATE INDEX "entity_matches_confidence_reviewStatus_idx" ON "entity_matches"("confidence", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "entity_matches_observedPartyId_companyMasterId_method_key" ON "entity_matches"("observedPartyId", "companyMasterId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "external_events_source_sourceId_key" ON "external_events"("source", "sourceId");

-- CreateIndex
CREATE INDEX "external_events_source_eventDate_idx" ON "external_events"("source", "eventDate");

-- CreateIndex
CREATE INDEX "external_events_companyMasterId_idx" ON "external_events"("companyMasterId");

-- CreateIndex
CREATE INDEX "external_events_companyId_idx" ON "external_events"("companyId");

-- CreateIndex
CREATE INDEX "case_outcomes_outcomeType_idx" ON "case_outcomes"("outcomeType");

-- CreateIndex
CREATE INDEX "case_outcomes_externalEventId_idx" ON "case_outcomes"("externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "case_outcomes_caseId_outcomeType_source_key" ON "case_outcomes"("caseId", "outcomeType", "source");

-- CreateIndex
CREATE INDEX "data_ingest_runs_source_jobType_startedAt_idx" ON "data_ingest_runs"("source", "jobType", "startedAt");

-- CreateIndex
CREATE INDEX "data_ingest_runs_status_startedAt_idx" ON "data_ingest_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "companies_companyMasterId_idx" ON "companies"("companyMasterId");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_companyMasterId_fkey" FOREIGN KEY ("companyMasterId") REFERENCES "company_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_master" ADD CONSTRAINT "company_master_sectorKey_fkey" FOREIGN KEY ("sectorKey") REFERENCES "sectors"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_aliases" ADD CONSTRAINT "company_aliases_companyMasterId_fkey" FOREIGN KEY ("companyMasterId") REFERENCES "company_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observed_parties" ADD CONSTRAINT "observed_parties_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observed_parties" ADD CONSTRAINT "observed_parties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_matches" ADD CONSTRAINT "entity_matches_observedPartyId_fkey" FOREIGN KEY ("observedPartyId") REFERENCES "observed_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_matches" ADD CONSTRAINT "entity_matches_companyMasterId_fkey" FOREIGN KEY ("companyMasterId") REFERENCES "company_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_companyMasterId_fkey" FOREIGN KEY ("companyMasterId") REFERENCES "company_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_outcomes" ADD CONSTRAINT "case_outcomes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_outcomes" ADD CONSTRAINT "case_outcomes_externalEventId_fkey" FOREIGN KEY ("externalEventId") REFERENCES "external_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
