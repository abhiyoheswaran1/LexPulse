-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "cik" TEXT;

-- CreateTable
CREATE TABLE "sec_edgar_filings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cik" TEXT NOT NULL,
    "accession" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "items" TEXT[],
    "primaryDocUrl" TEXT,
    "itemTextExcerpt" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_edgar_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_events" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "amountUsd" DECIMAL(14,2),
    "confidence" DOUBLE PRECISION NOT NULL,
    "snippet" TEXT NOT NULL,

    CONSTRAINT "material_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_observations" (
    "id" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "scoreAtAnchor" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "caseCountAtAnchor" INTEGER NOT NULL,
    "hadEvent30" BOOLEAN NOT NULL,
    "hadEvent90" BOOLEAN NOT NULL,
    "hadEvent180" BOOLEAN NOT NULL,
    "eventCount90" INTEGER NOT NULL,
    "totalAmountUsd90" DECIMAL(16,2),
    "scoreVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backtest_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sec_edgar_filings_accession_key" ON "sec_edgar_filings"("accession");

-- CreateIndex
CREATE INDEX "sec_edgar_filings_companyId_filedAt_idx" ON "sec_edgar_filings"("companyId", "filedAt");

-- CreateIndex
CREATE INDEX "sec_edgar_filings_formType_filedAt_idx" ON "sec_edgar_filings"("formType", "filedAt");

-- CreateIndex
CREATE INDEX "material_events_filingId_idx" ON "material_events"("filingId");

-- CreateIndex
CREATE INDEX "material_events_eventType_idx" ON "material_events"("eventType");

-- CreateIndex
CREATE INDEX "backtest_observations_anchorDate_idx" ON "backtest_observations"("anchorDate");

-- CreateIndex
CREATE INDEX "backtest_observations_companyId_idx" ON "backtest_observations"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_observations_anchorDate_companyId_scoreVersion_key" ON "backtest_observations"("anchorDate", "companyId", "scoreVersion");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cik_key" ON "companies"("cik");

-- AddForeignKey
ALTER TABLE "sec_edgar_filings" ADD CONSTRAINT "sec_edgar_filings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_events" ADD CONSTRAINT "material_events_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "sec_edgar_filings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_observations" ADD CONSTRAINT "backtest_observations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

