import { Card, CardHeader, CardBody, PageHeader, Restricted } from "@/components/ui";
import { AskConsole, type AskHistoryEntry } from "@/components/ask-console";
import { prisma } from "@/lib/db";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { hasAnthropicKey } from "@/lib/ai/client";
import type { Citation } from "@/lib/ai/retrieval/tools";

export const dynamic = "force-dynamic";

/** Recent questions WITH their stored answers, so they replay without a new model call.
 *  Defensive so a pre-migration AskLog table can't break the page. */
async function recentHistory(): Promise<AskHistoryEntry[]> {
  try {
    const rows = await prisma.askLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, question: true, answer: true, citations: true, modelUsed: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      citations: Array.isArray(r.citations) ? (r.citations as unknown as Citation[]) : [],
      modelUsed: r.modelUsed,
      createdLabel: r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }));
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

  const [history, live] = await Promise.all([recentHistory(), Promise.resolve(hasAnthropicKey())]);

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
              ? "Answers are composed from live database records via retrieval tools. Recent questions are saved — reopen one without spending another query."
              : "No API key configured — answers fall back to keyword record matching (still grounded in real data)."
          }
        />
        <CardBody>
          <AskConsole history={history} />
        </CardBody>
      </Card>
    </>
  );
}
