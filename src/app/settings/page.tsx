export default function SettingsPage() {
  return (
    <section className="pageStack">
      <div className="sectionHeader">
        <h1>Settings</h1>
      </div>
      <div className="panel">
        <h2>Environment</h2>
        <p>API base: <code>{process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8010"}</code></p>
      </div>
    </section>
  );
}
