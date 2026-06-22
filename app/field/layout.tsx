import Link from "next/link";
import type { Metadata } from "next";
import { getOperatorIdentity } from "@/lib/current-role";
import { SwRegister } from "@/components/field/sw-register";

export const metadata: Metadata = {
  title: "Rethink Field",
  description: "Frontline operator app — advance meals from produced to delivered to verified.",
};

// Field operators work on a phone, often offline. This standalone chrome drops
// the exec sidebar in favor of a single-column, thumb-reachable layout.
export default async function FieldLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const operator = await getOperatorIdentity();
  return (
    <div className="min-h-screen bg-background">
      <SwRegister />
      <header className="sticky top-0 z-10 bg-foreground text-background">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div>
            <div className="font-display text-sm font-black uppercase tracking-tight">
              Rethink <span className="text-brand">Field</span>
            </div>
            <div className="text-[11px] text-white/60">{operator}</div>
          </div>
          <Link href="/" className="text-[11px] uppercase tracking-[0.12em] text-white/70">
            Command Center →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-4">{children}</main>
    </div>
  );
}
