import { Card, CardHeader, CardBody, PageHeader, Restricted } from "@/components/ui";
import { AskConsole } from "@/components/ask-console";
import { prisma } from "@/lib/db";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { hasAnthropicKey } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

interface RecentAsk {
  id: string;
  question: string;
  modelUsed: string;
  createdAt: Date;
}

/** Recent queries, fetched defensively so a pre-migration AskLog table can't break the page. */
async function recentAsks(): Promise<RecentAsk[]> {
  try {
    return await prisma.askLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, question: true, modelUsed: true, createdAt: true },
    });
  } catch {
    return [];
  }
}

export default async function AskPage() {
  const role = await getCurrentRole();
  if (!can(role, "search:records")) {
    return (
      <>
        <PageHeader title="Ask the Operating Layer" />
        <Card>
          <Restricted note="Your role doesn't have access to record search." />
        </Card>
      </>
    );
  }

  const [history, live] = await Promise.all([recentAsks(), Promise.resolve(hasAnthropicKey())]);

  return (
    <>
      <PageHeader
        title="Ask the Operating Layer"
        subtitle="Natural-language search over partners, funders, and contracts. Every fact is retrieved from a real record and linked back to it — the model never invents numbers."
      />

      <Card>
        <CardHeader
          title="Ask"
          subtitle={
            live
              ? "Answers are composed from live database records via retrieval tools."
              : "No API key configured — answers fall back to keyword record matching (still grounded in real data)."
          }
        />
        <CardBody>
          <AskConsole />
        </CardBody>
      </Card>

      {history.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Recent questions" subtitle="Logged for the audit trail." />
          <CardBody className="pt-2">
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate text-sm">{h.question}</span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {h.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {h.modelUsed}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
