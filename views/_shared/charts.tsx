import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useViewTheme } from "mcp-use/react";

function useChartTheme() {
  const dark = useViewTheme() === "dark";
  return {
    dark,
    axis: dark ? "#c8c8c8" : "#5c5c5c",
    grid: dark ? "#444444" : "#d4d4d4",
    cursor: dark ? "#4a1418" : "#fdecee",
    tooltip: {
      background: dark ? "#2a2a2a" : "#ffffff",
      border: dark ? "1px solid #444444" : "1px solid #d4d4d4",
      borderRadius: 6,
      boxShadow: "none",
      color: dark ? "#f5f5f5" : "#111111",
      fontSize: 12,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    },
  };
}

const SERIES = {
  red: "#EE1C29",
  gold: "#F5C16C",
  teal: "#5EC8C0",
  ink: "#111111",
  muted: "#8A8A8A",
} as const;

function sliceColor(name: string, index: number): string {
  const key = name.toLowerCase();
  if (key.includes("done") || key.includes("missing")) return SERIES.red;
  if (key.includes("open") || key.includes("pending") || key.includes("checked in")) return SERIES.gold;
  if (key.includes("carried") || key.includes("late")) return SERIES.teal;
  if (key.includes("leave") || key.includes("eod")) return SERIES.muted;
  return [SERIES.red, SERIES.gold, SERIES.teal, SERIES.ink, SERIES.muted, "#C41620"][index % 6];
}

export function useBrandSeriesColors() {
  return {
    in: SERIES.gold,
    late: SERIES.teal,
    missing: SERIES.red,
  };
}

export function StatusDonut({
  labels,
  values,
}: {
  labels: string[];
  values: number[];
}) {
  const { tooltip } = useChartTheme();
  const data = labels.map((name, index) => ({ name, value: values[index] ?? 0 }));
  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={sliceColor(entry.name, index)} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltip} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function isDateLabel(label: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(label) || /^\d{1,2}\s+\w{3}/.test(label);
}

export function SmartHoursChart({
  labels,
  values,
  label = "Hours",
}: {
  labels: string[];
  values: number[];
  label?: string;
}) {
  const dated = labels.length >= 2 && labels.every(isDateLabel);
  if (dated) {
    return <HoursLine labels={labels} values={values} />;
  }
  if (labels.length === 0) {
    return null;
  }
  if (labels.length === 1 && /^(hours|total)$/i.test(labels[0] ?? "")) {
    return null;
  }
  return <HoursBar labels={labels} values={values} label={label} />;
}

export function HoursBar({
  labels,
  values,
  label = "Hours",
}: {
  labels: string[];
  values: number[];
  label?: string;
}) {
  const { axis, grid, cursor, tooltip } = useChartTheme();
  const data = labels.map((name, index) => ({ name, [label]: Number((values[index] ?? 0).toFixed(2)) }));
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: axis, fontSize: 11 }} interval={0} hide={labels.length > 8} />
          <YAxis tick={{ fill: axis, fontSize: 11 }} />
          <Tooltip contentStyle={tooltip} cursor={{ fill: cursor }} />
          <Bar dataKey={label} fill="#EE1C29" radius={[2, 2, 0, 0]} activeBar={{ fill: "#C41620" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBar({
  labels,
  series,
}: {
  labels: string[];
  series: { key: string; values: number[]; color: string }[];
}) {
  const { axis, grid, cursor, tooltip } = useChartTheme();
  const data = labels.map((name, index) => {
    const row: Record<string, string | number> = { name };
    for (const item of series) {
      row[item.key] = item.values[index] ?? 0;
    }
    return row;
  });
  return (
    <div className="h-[230px] w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: axis, fontSize: 10 }} hide={labels.length > 6} />
          <YAxis tick={{ fill: axis, fontSize: 11 }} />
          <Tooltip contentStyle={tooltip} cursor={{ fill: cursor }} />
          <Legend />
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} fill={item.color} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HoursLine({
  labels,
  values,
}: {
  labels: string[];
  values: number[];
}) {
  const { axis, grid, tooltip } = useChartTheme();
  const data = labels.map((date, index) => ({ date, hours: Number((values[index] ?? 0).toFixed(2)) }));
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="date" tick={{ fill: axis, fontSize: 10 }} />
          <YAxis tick={{ fill: axis, fontSize: 11 }} />
          <Tooltip contentStyle={tooltip} />
          <Line type="monotone" dataKey="hours" stroke="#EE1C29" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
