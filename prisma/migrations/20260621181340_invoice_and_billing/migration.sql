-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PAID');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "lastInvoicedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "mealCount" INTEGER NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_contractId_idx" ON "Invoice"("contractId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

