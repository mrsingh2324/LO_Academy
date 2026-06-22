-- CreateTable
CREATE TABLE "ReconciliationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "bucket" TEXT,
    "kind" TEXT NOT NULL,
    "uid" TEXT,
    "name" TEXT,
    "detail" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ReconciliationItem_source_idx" ON "ReconciliationItem"("source");
