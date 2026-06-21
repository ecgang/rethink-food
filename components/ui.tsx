import { cn } from "@/lib/cn";
import type { Severity } from "@/lib/exceptions";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: "bg-[var(--sev-critical-bg)]", text: "text-[var(--sev-critical)]", label: "Critical" },
  HIGH: { bg: "bg-[var(--sev-high-bg)]", text: "text-[var(--sev-high)]", label: "High" },
  MEDIUM: { bg: "bg-[var(--sev-medium-bg)]", text: "text-[var(--sev-medium)]", label: "Medium" },
  LOW: { bg: "bg-[var(--sev-low-bg)]", text: "text-[var(--sev-low)]", label: "Low" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        s.bg,
        s.text,
      )}
    >
      {s.label}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-extrabold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
