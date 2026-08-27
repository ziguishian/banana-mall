ALTER TABLE "User" ADD COLUMN "creditMultiplier" REAL NOT NULL DEFAULT 1;

CREATE TABLE "SystemAnnouncement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'default',
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserAnnouncementState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "readAt" DATETIME,
  "closedDate" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAnnouncementState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserAnnouncementState_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "SystemAnnouncement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SystemAnnouncement_isActive_publishedAt_idx" ON "SystemAnnouncement"("isActive", "publishedAt");
CREATE UNIQUE INDEX "UserAnnouncementState_userId_announcementId_key" ON "UserAnnouncementState"("userId", "announcementId");
CREATE INDEX "UserAnnouncementState_userId_readAt_idx" ON "UserAnnouncementState"("userId", "readAt");
