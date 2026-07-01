export function StatCard({
  label,
  value,
  accent,
  eyebrow,
}: {
  label: string;
  value: string | number;
  accent?: "danger" | "safe" | "brand";
  eyebrow?: string;
}) {
  const accentColor =
    accent === "danger" ? "text-[var(--accent-danger)]" : accent === "safe" ? "text-[var(--accent-safe)]" : "text-[var(--accent-brand)]";

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-5 py-4 flex flex-col gap-1 min-w-[150px]">
      {eyebrow && (
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-mono">
          {eyebrow}
        </span>
      )}
      <span className={`font-[family-name:var(--font-display)] text-3xl font-semibold ${accentColor}`}>
        {value}
      </span>
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}
