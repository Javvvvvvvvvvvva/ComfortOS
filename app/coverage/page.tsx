import type { Metadata } from "next";
import Link from "next/link";
import { listUsJurisdictionCoverage } from "@/lib/regions/usStates";

export const metadata: Metadata = {
  title: "United States Coverage | ComfortOS",
  description: "Search, walking route, weather, and Comfort data coverage across the United States.",
};

export default function CoveragePage() {
  const jurisdictions = listUsJurisdictionCoverage();

  return (
    <main className="policy-page coverage-page">
      <header className="policy-header">
        <Link className="policy-brand" href="/">
          ComfortOS
        </Link>
        <p className="eyebrow">United States coverage</p>
        <h1>50 states and D.C.</h1>
        <p className="policy-summary">
          Place search, walking routes, and National Weather Service conditions share one
          nationwide provider scope. Detailed Comfort estimates appear only where reviewed
          environmental data is active.
        </p>
        <p className="policy-updated">Coverage catalog updated September 3, 2026</p>
      </header>

      <section className="coverage-summary" aria-label="Coverage summary">
        <div>
          <strong>51</strong>
          <span>route and weather jurisdictions</span>
        </div>
        <div>
          <strong>3</strong>
          <span>metro validation regions</span>
        </div>
        <div>
          <strong>0</strong>
          <span>states claiming full Comfort coverage</span>
        </div>
      </section>

      <section className="coverage-list" aria-label="State coverage">
        {jurisdictions.map((jurisdiction) => {
          const validationLabels = jurisdiction.validationRegions
            .map((region) => region.label)
            .join(", ");
          return (
            <article className="coverage-row" key={jurisdiction.code}>
              <div className="coverage-state">
                <span>{jurisdiction.code}</span>
                <strong>{jurisdiction.name}</strong>
              </div>
              <span className="coverage-baseline">Routes + weather</span>
              <span
                className={
                  jurisdiction.environmentalData === "validated-metro"
                    ? "coverage-comfort validated"
                    : "coverage-comfort"
                }
              >
                {validationLabels || "Comfort data not deployed"}
              </span>
            </article>
          );
        })}
      </section>

      <p className="coverage-note">
        Metro validation does not mean statewide coverage. Missing local buildings or cover
        data never receives a perfect Comfort score and never borrows another region&apos;s data.
      </p>

      <nav className="policy-nav" aria-label="Product information">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/data-sources">Data sources</Link>
        <Link href="/support">Support</Link>
      </nav>
    </main>
  );
}
