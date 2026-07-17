import Link from "next/link";

export function ApiUnavailable({ title = "API unavailable" }: { title?: string }) {
  return (
    <section className="pageStack">
      <div className="stateBox danger">
        <strong>{title}</strong>
        <p>Last known data is unavailable.</p>
        <Link href="/" className="textButton">Retry</Link>
      </div>
    </section>
  );
}
