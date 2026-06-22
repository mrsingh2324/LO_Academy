-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "resumeUrl" TEXT,
    "yearOfGraduation" INTEGER,
    "bucketId" TEXT,
    "offlineClearedAt" DATETIME,
    "anomalousFlow" BOOLEAN NOT NULL DEFAULT false,
    "switchedFromBucket" TEXT,
    "flowNote" TEXT,
    "currentStage" TEXT NOT NULL DEFAULT 'react',
    "currentStatus" TEXT NOT NULL DEFAULT 'availability_requested',
    "currentAttemptId" TEXT,
    "finalPortalRedirectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Student_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("bucketId", "createdAt", "currentAttemptId", "currentStage", "currentStatus", "deletedAt", "email", "externalRef", "finalPortalRedirectedAt", "id", "name", "offlineClearedAt", "phone", "resumeUrl", "updatedAt", "yearOfGraduation") SELECT "bucketId", "createdAt", "currentAttemptId", "currentStage", "currentStatus", "deletedAt", "email", "externalRef", "finalPortalRedirectedAt", "id", "name", "offlineClearedAt", "phone", "resumeUrl", "updatedAt", "yearOfGraduation" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE UNIQUE INDEX "Student_externalRef_key" ON "Student"("externalRef");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
