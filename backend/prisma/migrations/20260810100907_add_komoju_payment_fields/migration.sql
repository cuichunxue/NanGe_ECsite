-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "paymentSessionId" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentSessionId_key" ON "Order"("paymentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentId_key" ON "Order"("paymentId");

