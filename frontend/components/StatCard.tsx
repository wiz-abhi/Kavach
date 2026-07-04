import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  accent,
  eyebrow,
  icon,
  pulse,
}: {
  label: string;
  value: string | number;
  accent?: "danger" | "safe" | "brand";
  eyebrow?: string;
  icon?: ReactNode;
  pulse?: boolean;
}) {
  const color =
    accent === "danger"
      ? "var(--accent-danger)"
      : accent === "safe"
      ? "var(--accent-safe)"
      : "var(--accent-brand)";

  // subtle danger tint only when there's an active alert to draw the eye
  const active = pulse && accent === "danger";

  return (
    <div
      className="group relative rounded-xl border bg-[var(--bg-panel)] px-4 py-3.5 flex items-center gap-3.5 min-w-[168px] flex-1 transition-colors"
      style={{
        borderColor: active ? "color-mix(in srgb, var(--accent-danger) 35%, var(--border-hairline))" : "var(--border-hairline)",
        background: active
          ? "linear-gradient(180deg, color-mix(in srgb, var(--accent-danger) 6%, var(--bg-panel)), var(--bg-panel))"
          : undefined,
      }}
    >
      <div
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        {eyebrow && (
          <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)] font-mono leading-none">
            {eyebrow}
          </span>
        )}
        <span
          className="font-[family-name:var(--font-display)] text-[26px] font-semibold leading-tight tabular-nums"
          style={{ color }}
        >
          {value}
        </span>
        <span className="text-[11px] text-[var(--text-secondary)] leading-none">{label}</span>
      </div>
      {active && (
        <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color }} />
        </span>
      )}
    </div>
  );
}
