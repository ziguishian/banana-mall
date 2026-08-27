-- SQLite cannot alter INTEGER columns to REAL directly; rebuild the affected tables.
PRAGMA foreign_keys=off;

CREATE TABLE "new_User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT,
  "credits" REAL NOT NULL DEFAULT 20,
  "creditMultiplier" REAL NOT NULL DEFAULT 1,
  "role" TEXT NOT NULL DEFAULT 'user',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("id", "email", "passwordHash", "name", "credits", "creditMultiplier", "role", "createdAt", "updatedAt")
SELECT "id", "email", "passwordHash", "name", "credits", "creditMultiplier", "role", "createdAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "new_CreditTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "delta" REAL NOT NULL,
  "balanceAfter" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "projectId" TEXT,
  "taskType" TEXT,
  "orderId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreditTransaction" ("id", "userId", "delta", "balanceAfter", "reason", "projectId", "taskType", "orderId", "createdAt")
SELECT "id", "userId", "delta", "balanceAfter", "reason", "projectId", "taskType", "orderId", "createdAt" FROM "CreditTransaction";
DROP TABLE "CreditTransaction";
ALTER TABLE "new_CreditTransaction" RENAME TO "CreditTransaction";
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");

CREATE TABLE "new_Order" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "credits" REAL NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "channel" TEXT NOT NULL DEFAULT 'payjs',
  "outTradeNo" TEXT NOT NULL,
  "payjsOrderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payUrl" TEXT,
  "qrcodeUrl" TEXT,
  "paidAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("id", "userId", "amountCents", "credits", "currency", "channel", "outTradeNo", "payjsOrderId", "status", "payUrl", "qrcodeUrl", "paidAt", "createdAt", "updatedAt")
SELECT "id", "userId", "amountCents", "credits", "currency", "channel", "outTradeNo", "payjsOrderId", "status", "payUrl", "qrcodeUrl", "paidAt", "createdAt", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_outTradeNo_key" ON "Order"("outTradeNo");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX "Order_status_idx" ON "Order"("status");

PRAGMA foreign_keys=on;
