import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_PRODUCT_NAME } from "@/lib/brand";
import {
  getActiveEnvironmentRelease,
  listUsJurisdictionCoverage,
} from "@/lib/regions/usStates";

export const metadata: Metadata = {
  title: `United States Coverage | ${PUBLIC_PRODUCT_NAME}`,
  description: "Search, walking route, weather, and Comfort data coverage across the United States.",
};

export default function CoveragePage() {
  const jurisdictions = listUsJurisdictionCoverage();
  const activeRelease = getActiveEnvironmentRelease();
  const validationRegionCount = jurisdictions.reduce(
    (total, jurisdiction) => total + jurisdiction.validationRegions.length,
    0,
  );

  return (
    <main className="policy-page coverage-page">
      <header className="policy-header">
        <Link className="policy-brand" href="/">
          <span className="policy-brand-mark" aria-hidden="true" />
          <span>{PUBLIC_PRODUCT_NAME}</span>
        </Link>
        <p className="eyebrow">United States coverage</p>
        <h1>50 states and D.C.</h1>
        <p className="policy-summary">
          Place search, walking routes, and National Weather Service conditions share one
          nationwide provider scope. Overture building data is deployed for all 51
          jurisdictions. Detailed climate scenarios have been validated in the metro
          regions listed below, and route-level availability still depends on local data.
        </p>
        <p className="policy-updated">
          Environment release {activeRelease?.release ?? "not active"} · updated September
          13, 2026
        </p>
      </header>

      <section className="coverage-summary" aria-label="Coverage summary">
        <div>
          <strong>{jurisdictions.length}</strong>
          <span>route and weather jurisdictions</span>
        </div>
        <div>
          <strong>{validationRegionCount}</strong>
          <span>metro validation regions</span>
        </div>
        <div>
          <strong>{activeRelease?.jurisdictionCount ?? 0}</strong>
          <span>environmental data jurisdictions</span>
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
                  jurisdiction.environmentalData === "nationwide-production"
                    ? "coverage-comfort validated"
                    : "coverage-comfort"
                }
              >
                {validationLabels
                  ? `Data deployed · climate-tested: ${validationLabels}`
                  : "Environmental data deployed"}
              </span>
            </article>
          );
        })}
      </section>

      <p className="coverage-note">
        Nationwide deployment does not guarantee every environmental feature on every
        block. Missing local buildings or cover data never receives a perfect Comfort score
        and never borrows another region&apos;s data.
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
