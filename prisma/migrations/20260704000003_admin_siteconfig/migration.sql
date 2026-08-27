-- MxPage SaaS stage 3: admin (SiteConfig key-value store)

CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SiteConfig_key_key" ON "SiteConfig"("key");
CREATE INDEX "SiteConfig_category_idx" ON "SiteConfig"("category");
