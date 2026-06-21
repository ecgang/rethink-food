-- AlterTable
ALTER TABLE "Cbo" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "RestaurantPartner" DROP COLUMN "cuisine",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "certified" BOOLEAN NOT NULL DEFAULT false;

