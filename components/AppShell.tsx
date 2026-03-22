"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilterBar } from "@/components/FilterBar";
import { formatCoverageRange } from "@/lib/date";
import { useDashboardContext } from "@/components/DashboardProvider";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/time", label: "Time" },
  { href: "/geography", label: "Geography" },
  { href: "/events", label: "Events" },
  { href: "/quality", label: "Quality" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { seed, loading, error, isNavigating } = useDashboardContext();

  return (
    <div className="appShell">
      <header className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Internal Analytics</p>
          <h1>Israel Red Alerts Dashboard</h1>
          <p className="heroText">
            Static analyst workspace for rocket alerts, burst detection, geographic hotspots, and parser quality visibility.
          </p>
        </div>
        <div className="heroMeta">
          <div className="metaCard">
            <span className="metaLabel">Coverage</span>
            <strong>
              {seed ? formatCoverageRange(seed.metadata.coverage_start, seed.metadata.coverage_end) : "Loading data"}
            </strong>
          </div>
          <div className="metaCard">
            <span className="metaLabel">Rows</span>
            <strong>{seed ? seed.metadata.total_occurrences.toLocaleString("en-US") : "..."}</strong>
          </div>
          <div className="metaCard">
            <span className="metaLabel">Mapped areas</span>
            <strong>{seed ? seed.metadata.mapped_area_count.toLocaleString("en-US") : "..."}</strong>
          </div>
        </div>
      </header>

      <nav className="navBar" aria-label="Dashboard sections">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "navLink navLinkActive" : "navLink"}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <FilterBar />

      {isNavigating ? <div className="progressBar" aria-hidden="true" /> : null}

      {loading ? (
        <main className="contentFrame">
          <section className="panel panelLoading">
            <h2>Loading dashboard seed</h2>
            <p>The static analytics dataset is being loaded into the client.</p>
          </section>
        </main>
      ) : error ? (
        <main className="contentFrame">
          <section className="panel panelError">
            <h2>Dashboard load failed</h2>
            <p>{error}</p>
          </section>
        </main>
      ) : (
        <main className="contentFrame">{children}</main>
      )}
    </div>
  );
}
