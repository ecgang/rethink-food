// Meals-in-flight module. The cumulative funnel (planned≈produced≈delivered≈
// verified) is nearly flat at this volume, so it says nothing. What matters
// operationally is the GAPS — how many meals are stuck at each gate right now,
// because those are the billing blockers and the dispatch backlog. This reframes
// the same data into the mutually-exclusive "where are meals right now" buckets.

interface Props {
  planned: number;
  produced: number;
  delivered: number;
  verified: number;
}

const fmt = (n: number) => n.toLocaleString();

export function LifecyclePipeline({ planned, produced, delivered, verified }: Props) {
  const inProduction = Math.max(0, planned - produced); // PLANNED, not yet produced
  const awaitingDispatch = Math.max(0, produced - delivered); // PRODUCED, not delivered
  const awaitingVerify = Math.max(0, delivered - verified); // DELIVERED, not verified
  const inFlight = inProduction + awaitingDispatch + awaitingVerify;
  const verifyPct = planned ? verified / planned : 0;

  // Segmented bar proportions (of planned). Verified dominates; the thin tail is
  // exactly the at-risk work, color-coded by severity.
  const seg = (n: number) => (planned ? `${(n / planned) * 100}%` : "0%");

  const rows: {
    count: number;
    label: string;
    hint: string;
    tone: "warn" | "neutral";
  }[] = [
    {
      count: awaitingVerify,
      label: "Delivered, awaiting verification",
      hint: "Can't be billed until the partner confirms receipt",
      tone: "warn",
    },
    {
      count: inProduction,
      label: "Planned, in production",
      hint: "Not yet produced",
      tone: "neutral",
    },
    {
      count: awaitingDispatch,
      label: "Produced, awaiting dispatch",
      hint: "Ready to deliver",
      tone: "neutral",
    },
  ];

  return (
    <div>
      {/* Headline conversion */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="font-display text-4xl font-black leading-none tracking-tight tnum text-brand-deep">
            {(verifyPct * 100).toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-muted">verified &amp; billable</div>
        </div>
        <div className="text-right text-xs text-muted leading-relaxed">
          <span className="tnum font-semibold text-foreground">{fmt(verified)}</span> of{" "}
          <span className="tnum">{fmt(planned)}</span> planned confirmed
          <br />
          <span className="tnum font-semibold text-foreground">{fmt(inFlight)}</span> meals in flight
        </div>
      </div>

      {/* Segmented progress bar — green verified, amber at-risk tail */}
      <div
        className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]"
        role="img"
        aria-label={`${(verifyPct * 100).toFixed(1)} percent verified; ${fmt(
          awaitingVerify,
        )} awaiting verification, ${fmt(inProduction)} in production, ${fmt(
          awaitingDispatch,
        )} awaiting dispatch`}
      >
        <div style={{ width: seg(verified) }} className="bg-[var(--pos)]" />
        <div style={{ width: seg(awaitingVerify) }} className="bg-amber-500" />
        <div style={{ width: seg(awaitingDispatch) }} className="bg-amber-300" />
        <div style={{ width: seg(inProduction) }} className="bg-black/25" />
      </div>

      {/* The gaps that matter — actionable, the verification blocker emphasized */}
      <ul className="mt-5 space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline gap-3">
            <span
              className={`w-14 shrink-0 text-right font-display text-xl font-black tnum ${
                r.tone === "warn" ? "text-amber-600" : "text-foreground"
              }`}
            >
              {fmt(r.count)}
            </span>
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                r.tone === "warn" ? "bg-amber-500" : "bg-black/25"
              }`}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{r.label}</span>
              <span className="block text-xs text-muted">{r.hint}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
