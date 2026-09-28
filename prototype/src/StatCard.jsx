export function StatCard({ icon: Icon, label, value, note, tone = "blue" }) {
  return (
    <article className={`stat-card ${tone}`}>
      <span className="stat-icon" aria-hidden="true"><Icon size={28} weight="duotone" /></span>
      <div><small>{label}</small><strong>{value}</strong><span>{note}</span></div>
    </article>
  );
}
