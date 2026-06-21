-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('MTM', 'RESTAURANT_RESPONSE', 'EMERGENCY_RELIEF');

-- CreateEnum
CREATE TYPE "MealStatus" AS ENUM ('PLANNED', 'PRODUCED', 'DELIVERED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('FOOD', 'LABOR', 'TRANSPORT', 'OVERHEAD');

-- CreateEnum
CREATE TYPE "ScnPartner" AS ENUM ('PHS', 'HEALI', 'SOMOS');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ProducerType" AS ENUM ('KITCHEN', 'RESTAURANT');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "borough" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "weeklyDemand" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "Funder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProgramType" NOT NULL,
    "reimbursementRateCents" INTEGER NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "scnPartner" "ScnPartner",
    "budgetCents" BIGINT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "billingDeadline" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kitchen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "weeklyCapacity" INTEGER NOT NULL,

    CONSTRAINT "Kitchen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "weeklyCapacity" INTEGER NOT NULL,
    "minorityOwned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RestaurantPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cbo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "contactEmail" TEXT,

    CONSTRAINT "Cbo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "scnPartner" "ScnPartner" NOT NULL,
    "referralDate" TIMESTAMP(3) NOT NULL,
    "enrollmentDate" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "withdrawnAt" TIMESTAMP(3),
    "prescribedMealsPerWeek" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "producerType" "ProducerType" NOT NULL,
    "kitchenId" TEXT,
    "restaurantPartnerId" TEXT,
    "cboId" TEXT NOT NULL,
    "memberId" TEXT,
    "status" "MealStatus" NOT NULL DEFAULT 'PLANNED',
    "mealDate" TIMESTAMP(3) NOT NULL,
    "plannedAt" TIMESTAMP(3) NOT NULL,
    "producedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealCostLineItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "type" "CostType" NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "MealCostLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRequest" (
    "id" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "extractedFields" JSONB NOT NULL,
    "confidenceFlags" JSONB NOT NULL,
    "modelUsed" TEXT,
    "status" "IntakeStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cboId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_borough_neighborhood_key" ON "Market"("borough", "neighborhood");

-- CreateIndex
CREATE UNIQUE INDEX "Funder_name_key" ON "Funder"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Program_name_key" ON "Program"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Member_externalRef_key" ON "Member"("externalRef");

-- CreateIndex
CREATE INDEX "Meal_status_idx" ON "Meal"("status");

-- CreateIndex
CREATE INDEX "Meal_programId_idx" ON "Meal"("programId");

-- CreateIndex
CREATE INDEX "Meal_mealDate_idx" ON "Meal"("mealDate");

-- CreateIndex
CREATE INDEX "MealCostLineItem_mealId_idx" ON "MealCostLineItem"("mealId");

-- CreateIndex
CREATE INDEX "IntakeRequest_status_idx" ON "IntakeRequest"("status");

-- CreateIndex
CREATE INDEX "Exception_severity_idx" ON "Exception"("severity");

-- CreateIndex
CREATE INDEX "Exception_resolvedAt_idx" ON "Exception"("resolvedAt");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kitchen" ADD CONSTRAINT "Kitchen_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPartner" ADD CONSTRAINT "RestaurantPartner_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cbo" ADD CONSTRAINT "Cbo_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_restaurantPartnerId_fkey" FOREIGN KEY ("restaurantPartnerId") REFERENCES "RestaurantPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_cboId_fkey" FOREIGN KEY ("cboId") REFERENCES "Cbo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCostLineItem" ADD CONSTRAINT "MealCostLineItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_cboId_fkey" FOREIGN KEY ("cboId") REFERENCES "Cbo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
