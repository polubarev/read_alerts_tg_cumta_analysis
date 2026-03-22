export function StatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="statCard">
      <span className="statLabel">{label}</span>
      <strong className="statValue">{value}</strong>
      {hint ? <span className="statHint">{hint}</span> : null}
    </article>
  );
}
