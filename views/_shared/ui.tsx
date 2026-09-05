import { ThemeProvider, useOpenExternal, useViewTheme } from "mcp-use/react";
import type { ReactNode } from "react";
import "./view.css";

export const tw = {
  actions: "flex flex-wrap items-center gap-2",
  kpis: "grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-3",
  grid: "grid grid-cols-1 gap-4 md:grid-cols-2",
  empty: "m-0 text-[13px] text-[var(--st-muted)]",
  sub: "mt-1.5 text-[13px] text-[var(--st-muted)]",
  form: "flex flex-col gap-3",
  field: "m-0 flex flex-col gap-1.5 text-xs",
  control:
    "rounded-md border border-[var(--st-border)] bg-[var(--st-card)] px-2.5 py-2 font-inherit text-[var(--st-text)] outline-none focus:border-[#EE1C29] focus:outline-2 focus:outline-offset-1 focus:outline-[#EE1C29]",
  btn: "cursor-pointer appearance-none rounded-md border border-[var(--st-border)] bg-[var(--st-card)] px-3 py-2 text-xs font-semibold text-[var(--st-text)] hover:border-[#EE1C29] hover:bg-[var(--st-brand-soft)] hover:text-[#EE1C29] disabled:cursor-not-allowed disabled:opacity-50",
  btnPrimary:
    "cursor-pointer appearance-none rounded-md border border-[#EE1C29] bg-[#EE1C29] px-3 py-2 text-xs font-semibold text-white hover:border-[var(--st-brand-hover)] hover:bg-[var(--st-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50",
  table:
    "w-full border-collapse text-xs [&_th]:border-b [&_th]:border-[var(--st-border)] [&_th]:px-2 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[var(--st-muted)] [&_th:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td]:border-b [&_td]:border-[var(--st-border)] [&_td]:px-2 [&_td]:py-2.5 [&_td]:align-top [&_td]:text-left [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_tbody_tr:hover]:bg-[var(--st-brand-soft)]",
};

const pillTone = {
  good: "bg-[var(--st-good-bg)] text-[var(--st-good)]",
  warn: "bg-[var(--st-warn-bg)] text-[var(--st-warn)]",
  bad: "bg-[var(--st-bad-bg)] text-[var(--st-bad)]",
  info: "bg-[var(--st-info-bg)] text-[var(--st-info)]",
  muted: "bg-[var(--st-soft)] text-[var(--st-muted)]",
} as const;

export function AppShell({
  title,
  kicker,
  subtitle,
  actions,
  children,
}: {
  title: string;
  kicker: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const theme = useViewTheme();
  return (
    <ThemeProvider>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <div
        data-card-shell
        data-theme={theme}
        className="box-border min-h-dvh bg-[var(--st-bg,#ffffff)] px-5 pb-7 pt-14 font-[Inter,ui-sans-serif,system-ui,sans-serif] text-[var(--st-text)] [&_*]:box-border"
      >
        <header className="mb-4">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#EE1C29]">
              {kicker}
            </p>
            <h1 className="m-0 text-[22px] font-bold leading-tight text-[var(--st-title)]">{title}</h1>
            {subtitle ? (
              <p className={`${tw.sub} line-clamp-3`} title={subtitle}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="mt-3">{actions}</div> : null}
        </header>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </ThemeProvider>
  );
}

export function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--st-border)] bg-[var(--st-card)] p-3">
      <b className="block text-xl leading-tight text-[var(--st-title)]">{value}</b>
      <span className="text-xs text-[var(--st-muted)]">{label}</span>
    </div>
  );
}

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: keyof typeof pillTone;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${pillTone[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--st-border)] bg-[var(--st-card)] p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-[var(--st-heading)]">{title}</h3>
      {children}
    </section>
  );
}

export function PendingState({ label }: { label: string }) {
  return (
    <div className="text-[13px] text-[var(--st-muted)]">
      <div className="my-2 h-3.5 rounded bg-[var(--st-soft)]" />
      <div className="my-2 h-3.5 rounded bg-[var(--st-soft)]" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="rounded-md bg-[var(--st-bad-bg)] px-3 py-2.5 text-[13px] text-[var(--st-bad)]" role="alert">
      {message}
    </p>
  );
}

export function SiteLink({ path, label }: { path: string; label: string }) {
  const openExternal = useOpenExternal();
  return (
    <button
      type="button"
      className={tw.btn}
      onClick={() =>
        void openExternal({
          url: new URL(path, "https://st-erpv15.frappe.cloud/").toString(),
        })
      }
    >
      {label}
    </button>
  );
}

export function statusTone(status: string): keyof typeof pillTone {
  if (status === "eod_done" || status === "Done" || status === "checked_in") return "good";
  if (status === "late" || status === "In Progress") return "warn";
  if (status === "missing" || status === "Dropped") return "bad";
  if (status === "leave") return "info";
  return "muted";
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

export function text(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}
