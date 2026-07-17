import Link from "next/link";
import { ReactNode } from "react";

const nav = [
  { href: "/", label: "Matches" },
  { href: "/live", label: "Live" },
  { href: "/signals", label: "Signals" },
  { href: "/performance", label: "Stats" },
  { href: "/alerts", label: "Alerts" }
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="appShell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brandMark">BM</span>
          <span>
            <strong>Basket Monster</strong>
            <small>Public Match Center</small>
          </span>
        </Link>
        <nav className="desktopNav">
          {nav.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <Link href="/settings">Settings</Link>
        </nav>
      </header>
      <main>{children}</main>
      <nav className="bottomNav" aria-label="Mobile navigation">
        {nav.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
