import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { MarqueeBar } from "@/components/marquee-bar";
import { getCurrentRole } from "@/lib/current-role";

// The root layout renders the live marquee (a DB query), so render dynamically
// rather than prerendering at build time.
export const dynamic = "force-dynamic";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Heavy grotesque for display/headlines — evokes Rethink Food's bold editorial type.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Rethink Command Center",
  description:
    "Real-time operating system for Rethink Food: meal volumes, unit economics, delivery performance, and what to act on today.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const role = await getCurrentRole();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Editorial marquee carrying live ops data */}
        <MarqueeBar />
        <div className="flex min-h-screen">
          <Sidebar role={role} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
