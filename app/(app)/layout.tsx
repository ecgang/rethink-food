import { Sidebar } from "@/components/sidebar";
import { MobileTopBar } from "@/components/mobile-topbar";
import { MarqueeBar } from "@/components/marquee-bar";
import { getCurrentRole } from "@/lib/current-role";

// This group renders the live marquee (a DB query), so render dynamically
// rather than prerendering at build time.
export const dynamic = "force-dynamic";

// The Command Center shell: editorial marquee + role-aware sidebar. The /field
// operator app lives OUTSIDE this group so it gets its own mobile-first chrome.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const role = await getCurrentRole();
  return (
    // App shell: a fixed-height viewport where the marquee + left rail stay put
    // and ONLY the content area scrolls — the "application", not "long webpage", feel.
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Editorial marquee carrying live ops data — pinned at the very top */}
      <MarqueeBar />
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
