"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="pageStack">
      <div className="stateBox danger">
        <strong>Something went wrong</strong>
        <p>Last known data is unavailable.</p>
        <button type="button" className="textButton" onClick={reset}>Retry</button>
      </div>
    </section>
  );
}
