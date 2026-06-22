-- AlterEnum
ALTER TYPE "IntakeStatus" ADD VALUE 'FULFILLED';

-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "intakeRequestId" TEXT;

-- AlterTable
ALTER TABLE "IntakeRequest" ADD COLUMN     "fulfilledAt" TIMESTAMP(3),
ADD COLUMN     "fulfilledBy" TEXT;

-- CreateIndex
CREATE INDEX "Meal_intakeRequestId_idx" ON "Meal"("intakeRequestId");

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_intakeRequestId_fkey" FOREIGN KEY ("intakeRequestId") REFERENCES "IntakeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
