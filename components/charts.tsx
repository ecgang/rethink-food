"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  LabelList,
} from "recharts";

const BRAND = "#54d17e"; // Rethink bright green (the single accent)
const INK = "#1c1c1a"; // near-black — the default bar color
const NEG = "#b42318";
const COST_COLORS: Record<string, string> = {
  FOOD: "#54d17e",
  LABOR: "#1f7a52",
  TRANSPORT: "#9a9a93",
  OVERHEAD: "#1c1c1a",
};

// One sharp, black tooltip everywhere (not the rounded Recharts default).
const TOOLTIP = {
  contentStyle: {
    background: INK,
    border: "none",
    borderRadius: 0,
    color: "#fff",
    fontSize: 12,
    padding: "6px 10px",
  },
  itemStyle: { color: "#fff" },
  labelStyle: { color: "#fff" },
  cursor: { fill: "rgba(0,0,0,0.04)" },
} as const;

const TICK = { fontSize: 11, fill: "#595954" } as const;
const upper = (v: unknown) => String(v).toUpperCase();

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: cents >= 100000 ? "compact" : "standard",
    maximumFractionDigits: cents >= 100000 ? 1 : 2,
  }).format(cents / 100);

const num = (v: unknown): number => Number(v ?? 0);

/** Cumulative lifecycle funnel — monochrome bars, green "verified" accent. */
export function LifecycleFunnel({
  data,
}: {
  data: { stage: string; count: number }[];
}) {
  const label = `Meal lifecycle funnel: ${data
    .map((d) => `${d.stage} ${d.count.toLocaleString()}`)
    .join(", ")}`;
  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart layout="vertical" data={data} margin={{ left: 8, right: 36 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="stage"
            width={92}
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickFormatter={upper}
          />
          <Tooltip {...TOOLTIP} formatter={(v: unknown) => [num(v).toLocaleString(), "meals"]} />
          <Bar dataKey="count" radius={0} barSize={26}>
            {data.map((d) => (
              <Cell key={d.stage} fill={d.stage === "Verified" ? BRAND : INK} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={(v: unknown) => num(v).toLocaleString()}
              style={{ fontSize: 12, fill: INK }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cost composition donut by cost type. */
export function CostDonut({ data }: { data: { type: string; value: number }[] }) {
  const label = `Cost composition by type: ${data
    .map((d) => `${d.type} ${usd(d.value)}`)
    .join(", ")}`;
  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="type"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.type} fill={COST_COLORS[d.type] ?? "#999"} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP} formatter={(v: unknown, n) => [usd(num(v)), n as string]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Contribution margin per meal by dimension — green for positive, red underwater. */
export function MarginBars({
  data,
}: {
  data: { key: string; marginPerMealCents: number; mealCount: number }[];
}) {
  const height = Math.max(160, data.length * 38);
  const label = `Contribution margin per meal: ${data
    .map((d) => `${d.key} ${usd(d.marginPerMealCents)}`)
    .join(", ")}`;
  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={data} margin={{ left: 8, right: 44 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="key"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickFormatter={upper}
          />
          <Tooltip {...TOOLTIP} formatter={(v: unknown) => [usd(num(v)), "margin / meal"]} />
          <ReferenceLine x={0} stroke="#c9c9c4" strokeWidth={1} />
          <Bar dataKey="marginPerMealCents" radius={0} barSize={22}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.marginPerMealCents >= 0 ? BRAND : NEG} />
            ))}
            <LabelList
              dataKey="marginPerMealCents"
              position="right"
              formatter={(v: unknown) => usd(num(v))}
              style={{ fontSize: 11, fill: "#595954" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
