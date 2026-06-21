import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Rethink-style black utility bar with a brand-green signal */}
        <div className="flex items-center justify-center gap-2 bg-foreground px-4 py-1.5 text-center text-[11px] uppercase tracking-[0.12em] text-background">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
          Rethink Command Center · real-time operating system · demo build
        </div>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
