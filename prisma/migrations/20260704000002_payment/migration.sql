-- MxPage SaaS stage 2: payment (Order) + CreditTransaction.orderId

ALTER TABLE "CreditTransaction" ADD COLUMN "orderId" TEXT;

CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
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
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Order_outTradeNo_key" ON "Order"("outTradeNo");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX "Order_status_idx" ON "Order"("status");
