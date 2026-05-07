-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "naicsCode" TEXT,
ADD COLUMN     "sectorConfidence" DOUBLE PRECISION,
ADD COLUMN     "sectorKey" TEXT,
ADD COLUMN     "sectorSource" TEXT;

-- AlterTable
ALTER TABLE "risk_scores" ADD COLUMN     "cohortMean" DOUBLE PRECISION,
ADD COLUMN     "cohortP50" INTEGER,
ADD COLUMN     "cohortSize" INTEGER,
ADD COLUMN     "concentrationFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "delta30d" INTEGER,
ADD COLUMN     "delta7d" INTEGER,
ADD COLUMN     "drivers" JSONB,
ADD COLUMN     "jurisdictionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "momentumFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "percentile" DOUBLE PRECISION,
ADD COLUMN     "scoreVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "zScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "sectors" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "naicsPrefixes" TEXT[],

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "companies_sectorKey_idx" ON "companies"("sectorKey");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_sectorKey_fkey" FOREIGN KEY ("sectorKey") REFERENCES "sectors"("key") ON DELETE SET NULL ON UPDATE CASCADE;
