-- AlterEnum
BEGIN;
CREATE TYPE "ScnPartner_new" AS ENUM ('PHS', 'SOMOS', 'SIPPS');
ALTER TABLE "Contract" ALTER COLUMN "scnPartner" TYPE "ScnPartner_new" USING ("scnPartner"::text::"ScnPartner_new");
ALTER TABLE "Member" ALTER COLUMN "scnPartner" TYPE "ScnPartner_new" USING ("scnPartner"::text::"ScnPartner_new");
ALTER TYPE "ScnPartner" RENAME TO "ScnPartner_old";
ALTER TYPE "ScnPartner_new" RENAME TO "ScnPartner";
DROP TYPE "public"."ScnPartner_old";
COMMIT;

-- AlterTable
ALTER TABLE "RestaurantPartner" ADD COLUMN     "cuisine" TEXT;

