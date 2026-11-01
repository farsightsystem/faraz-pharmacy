import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { formatCurrency, formatLocalDateKey } from "@/lib/utils";

interface RevenueChartProps {
  data?: { day: string; revenue: number }[];
  period?: "week" | "month";
}

function fillDays(data: { day: string; revenue: number }[], period: "week" | "month") {
  const days = period === "week" ? 7 : 30;
  const result: { label: string; revenue: number }[] = [];
  const map = new Map(data.map((d) => [d.day, d.revenue]));
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    const key = formatLocalDateKey(date);
    const label =
      period === "week"
        ? date.toLocaleDateString("en-US", { weekday: "short" })
        : `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ label, revenue: map.get(key) ?? 0 });
  }
  return result;
}

export default function RevenueChart({ data = [], period = "week" }: RevenueChartProps) {
  const chartData = fillDays(data, period);
  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);

  return (
    <div className="h-[260px] w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="barGradientPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#754BFB" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#4A25E1" stopOpacity={0.9} />
            </linearGradient>
            <linearGradient id="barGradientSecondary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A25E1" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#3C19CF" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            axisLine={false}
            tickLine={false}
            interval={period === "month" ? 4 : 0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), "Revenue"]}
            labelStyle={{ fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
              padding: "10px 14px",
            }}
          />
          <Bar dataKey="revenue" radius={[8, 8, 8, 8]} maxBarSize={32}>
            {chartData.map((entry, index) => {
              const isPeak = entry.revenue === maxRevenue;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={isPeak ? "url(#barGradientPrimary)" : "url(#barGradientSecondary)"}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
