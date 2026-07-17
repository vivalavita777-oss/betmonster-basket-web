export function StatusPill({ label, tone = "neutral" }: { label?: string | null; tone?: "green" | "purple" | "red" | "neutral" }) {
  if (!label) return null;
  return <span className={`pill ${tone}`}>{label}</span>;
}
