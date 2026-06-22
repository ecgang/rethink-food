/**
 * Delete all rows (FK-dependency order) without dropping the schema. Lets us apply
 * an enum change cleanly before reseeding, without the interactive `migrate reset`.
 * Uses the dev DATABASE_URL from .env.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  await p.mealCostLineItem.deleteMany();
  await p.meal.deleteMany();
  await p.intakeRequest.deleteMany();
  await p.member.deleteMany();
  await p.contract.deleteMany();
  await p.program.deleteMany();
  await p.funder.deleteMany();
  await p.cbo.deleteMany();
  await p.restaurantPartner.deleteMany();
  await p.kitchen.deleteMany();
  await p.market.deleteMany();
  console.log("all rows cleared");
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
