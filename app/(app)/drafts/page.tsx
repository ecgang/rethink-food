import { Card, CardHeader, PageHeader, Restricted } from "@/components/ui";
import { DraftQueue } from "@/components/draft-queue";
import { getDraftQueue, type DraftDTO } from "@/lib/comms";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Defensive fetch so a pre-migration DraftComm table can't break the page. */
async function loadQueue(): Promise<DraftDTO[]> {
  try {
    return await getDraftQueue();
  } catch {
    return [];
  }
}

export default async function DraftsPage() {
  const role = await getCurrentRole();
  if (!can(role, "draft:comms")) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1100px]">
        <PageHeader title="Draft follow-ups" />
        <Card>
          <Restricted note="Your role doesn't have access to communications drafts." />
        </Card>
      </div>
    );
  }

  const drafts = await loadQueue();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1100px]">
      <PageHeader
        title="Draft follow-ups"
        subtitle="AI-drafted clarifications, nudges, and reconciliation notes — reviewed and approved by a human. Nothing is ever sent automatically."
      />
      <Card>
        <CardHeader
          title="Review queue"
          subtitle="Drafts awaiting review first, then recently reviewed."
        />
        <DraftQueue drafts={drafts} />
      </Card>
    </div>
  );
}
