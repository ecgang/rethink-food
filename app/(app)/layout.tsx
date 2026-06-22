import { Sidebar } from "@/components/sidebar";
import { MobileTopBar } from "@/components/mobile-topbar";
import { getCurrentRole } from "@/lib/current-role";

// Reads the role cookie, so render dynamically rather than prerendering.
export const dynamic = "force-dynamic";

// The Command Center shell: a role-aware sidebar. The /field operator app lives
// OUTSIDE this group so it gets its own mobile-first chrome.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const role = await getCurrentRole();
  return (
    // App shell: a fixed-height viewport where the left rail stays put and ONLY
    // the content area scrolls — the "application", not "long webpage", feel.
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <Sidebar role={role} />
        <main className="min-w-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
          <MobileTopBar role={role} />
          {children}
        </main>
      </div>
    </div>
  );
}
