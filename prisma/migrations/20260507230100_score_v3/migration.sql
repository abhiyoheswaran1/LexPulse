-- AlterTable
ALTER TABLE "risk_scores" ADD COLUMN     "firmSignalFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "judgeFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "similaritySignalFactor" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "judge_profiles" (
    "judgeId" TEXT NOT NULL,
    "dismissalRate" DOUBLE PRECISION,
    "avgDurationDays" INTEGER,
    "plaintiffWinRate" DOUBLE PRECISION,
    "caseCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_profiles_pkey" PRIMARY KEY ("judgeId")
);

-- AddForeignKey
ALTER TABLE "judge_profiles" ADD CONSTRAINT "judge_profiles_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
