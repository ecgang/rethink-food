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
    <>
      {/* Editorial marquee carrying live ops data */}
      <MarqueeBar />
      <div className="flex min-h-screen">
        <Sidebar role={role} />
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">
          <MobileTopBar role={role} />
          {children}
        </main>
      </div>
    </>
  );
}
