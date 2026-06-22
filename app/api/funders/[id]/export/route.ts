import { getFunderImpact, type FunderContractLine } from "@/lib/funders";
import { toCsv, type CsvColumn } from "@/lib/csv";

type CsvRow = {
  contract: string;
  program: string;
  mealsServed: number;
  dollarsDelivered: number;
  budget: number;
};

const COLUMNS: CsvColumn<CsvRow>[] = [
  { key: "contract", label: "Contract" },
  { key: "program", label: "Program" },
  { key: "mealsServed", label: "Meals served" },
  { key: "dollarsDelivered", label: "Dollars delivered" },
  { key: "budget", label: "Budget" },
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const impact = await getFunderImpact(id);

  if (!impact) {
    return new Response("Not found", { status: 404 });
  }

  const rows: CsvRow[] = impact.contracts.map((c: FunderContractLine) => ({
    contract: c.contractName,
    program: c.programName,
    mealsServed: c.mealsServed,
    dollarsDelivered: Math.round(c.dollarsDeliveredCents) / 100,
    budget: Math.round(c.budgetCents) / 100,
  }));

  const csv = toCsv(COLUMNS, rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="funder-${id}-impact.csv"`,
    },
  });
}
