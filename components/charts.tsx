"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  LabelList,
} from "recharts";

const BRAND = "#1f7a52";
const COST_COLORS: Record<string, string> = {
  FOOD: "#1f7a52",
  LABOR: "#3b82a0",
  TRANSPORT: "#d9a441",
  OVERHEAD: "#9b8579",
};

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: cents >= 100000 ? "compact" : "standard",
    maximumFractionDigits: cents >= 100000 ? 1 : 2,
  }).format(cents / 100);

// Recharts formatters receive loosely-typed values; coerce safely.
const num = (v: unknown): number => Number(v ?? 0);

/** Cumulative lifecycle funnel as horizontal bars. */
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
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 32 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="stage"
          width={86}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "#6b6b66" }}
        />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
          formatter={(v: unknown) => [num(v).toLocaleString(), "meals"]}
        />
        <Bar dataKey="count" radius={[4, 4, 4, 4]} fill={BRAND} barSize={26}>
          <LabelList
            dataKey="count"
            position="right"
            formatter={(v: unknown) => num(v).toLocaleString()}
            style={{ fontSize: 12, fill: "#1c1c1a" }}
          />
        </Bar>
      </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cost composition donut by cost type. */
export function CostDonut({
  data,
}: {
  data: { type: string; value: number }[];
}) {
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
        >
          {data.map((d) => (
            <Cell key={d.type} fill={COST_COLORS[d.type] ?? "#999"} />
          ))}
        </Pie>
        <Tooltip formatter={(v: unknown, n) => [usd(num(v)), n as string]} />
      </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars of contribution margin per meal by dimension. */
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
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 40 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="key"
          width={150}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "#1c1c1a" }}
        />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
          formatter={(v: unknown) => [usd(num(v)), "margin / meal"]}
        />
        <Bar dataKey="marginPerMealCents" radius={[0, 4, 4, 0]} barSize={22}>
          {data.map((d) => (
            <Cell
              key={d.key}
              fill={d.marginPerMealCents >= 0 ? BRAND : "#b42318"}
            />
          ))}
          <LabelList
            dataKey="marginPerMealCents"
            position="right"
            formatter={(v: unknown) => usd(num(v))}
            style={{ fontSize: 11, fill: "#6b6b66" }}
          />
        </Bar>
      </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
