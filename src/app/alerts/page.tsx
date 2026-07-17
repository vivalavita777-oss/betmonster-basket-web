export default function AlertsPage() {
  return (
    <section className="pageStack">
      <div className="sectionHeader">
        <h1>Alerts</h1>
      </div>
      <div className="panel">
        <h2>Push readiness</h2>
        <p className="muted">Notification subscriptions are planned for the app write API phase. This PWA shell keeps the route ready without writing to the public read-only API.</p>
      </div>
    </section>
  );
}
