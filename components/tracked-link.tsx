"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";

/**
 * A link that fires a Vercel Analytics custom event on click — used on the
 * /for-rethink reviewer page to measure click-through depth (which surfaces a
 * visitor explored, did they open the code, etc.), independent of how they arrived.
 */
export function TrackedLink({
  href,
  event,
  data,
  external,
  className,
  children,
}: {
  href: string;
  event: string;
  data?: Record<string, string | number | boolean>;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const fire = () => track(event, data);
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={fire}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className} onClick={fire}>
      {children}
    </Link>
  );
}
