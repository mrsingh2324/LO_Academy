-- AlterTable
ALTER TABLE "StageAttempt" ADD COLUMN "details" JSONB;
ALTER TABLE "StageAttempt" ADD COLUMN "outcome" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "resumeUrl" TEXT;
