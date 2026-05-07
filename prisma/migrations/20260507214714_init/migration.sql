-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normKey" TEXT NOT NULL,
    "ticker" TEXT,
    "jurisdiction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "caseName" TEXT NOT NULL,
    "court" TEXT,
    "docketNumber" TEXT,
    "dateFiled" TIMESTAMP(3),
    "dateTerminated" TIMESTAMP(3),
    "natureOfSuit" TEXT,
    "cause" TEXT,
    "judgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_case_link" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "rawParty" TEXT NOT NULL,

    CONSTRAINT "company_case_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "court" TEXT,

    CONSTRAINT "judges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_scores" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "volumeFactor" DOUBLE PRECISION NOT NULL,
    "recencyFactor" DOUBLE PRECISION NOT NULL,
    "severityFactor" DOUBLE PRECISION NOT NULL,
    "caseCount" INTEGER NOT NULL,
    "recentCases" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "refs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_normKey_key" ON "companies"("normKey");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cases_sourceId_key" ON "cases"("sourceId");

-- CreateIndex
CREATE INDEX "cases_dateFiled_idx" ON "cases"("dateFiled");

-- CreateIndex
CREATE INDEX "cases_natureOfSuit_idx" ON "cases"("natureOfSuit");

-- CreateIndex
CREATE INDEX "company_case_link_caseId_idx" ON "company_case_link"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "company_case_link_companyId_caseId_role_key" ON "company_case_link"("companyId", "caseId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "judges_name_key" ON "judges"("name");

-- CreateIndex
CREATE INDEX "risk_scores_companyId_computedAt_idx" ON "risk_scores"("companyId", "computedAt");

-- CreateIndex
CREATE INDEX "events_caseId_occurredAt_idx" ON "events"("caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "alerts_createdAt_idx" ON "alerts"("createdAt");

-- CreateIndex
CREATE INDEX "alerts_companyId_idx" ON "alerts"("companyId");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "judges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_case_link" ADD CONSTRAINT "company_case_link_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_case_link" ADD CONSTRAINT "company_case_link_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
