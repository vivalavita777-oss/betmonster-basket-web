export default function SettingsPage() {
  return (
    <section className="pageStack">
      <div className="sectionHeader">
        <h1>Settings</h1>
      </div>
      <div className="panel">
        <h2>Environment</h2>
        <p>Backend proxy: <code>/api/backend</code></p>
        <p>App timezone: <code>{process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/New_York"}</code></p>
      </div>
    </section>
  );
}
