export function KpiCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
        {label}
      </p>
      <p className="mono mt-1.5 text-2xl font-semibold leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-[13px] font-normal text-[var(--color-ink-muted)]">
            {unit}
          </span>
        )}
      </p>
      {hint && (
        <p className="mt-1.5 text-[11px] text-[var(--color-ink-muted)]">{hint}</p>
      )}
    </div>
  );
}

export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
