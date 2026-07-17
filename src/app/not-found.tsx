import Link from "next/link";

export default function NotFound() {
  return (
    <section className="pageStack">
      <div className="stateBox">
        <strong>Page not found</strong>
        <Link href="/" className="textButton">Back to matches</Link>
      </div>
    </section>
  );
}
