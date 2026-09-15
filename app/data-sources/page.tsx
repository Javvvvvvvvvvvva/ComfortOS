import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";
import { ENGINE_NAME, PUBLIC_PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Data Sources | ${PUBLIC_PRODUCT_NAME}`,
  description: `Data sources and model boundaries used by ${PUBLIC_PRODUCT_NAME}.`,
};

export default function DataSourcesPage() {
  return (
    <PolicyPage
      eyebrow="Data attribution"
      title="What powers each route comparison"
      summary={`${PUBLIC_PRODUCT_NAME} keeps provider data behind normalized interfaces and distinguishes observations from deterministic exposure estimates.`}
    >
      <PolicySection title="Maps, places, and routes">
        <p>
          Mapbox supplies managed place search, walking route candidates, and web map tiles.
          The mobile app uses the native Apple Maps or Google Maps renderer. Map content retains
          the attribution required by each platform and data provider.
        </p>
      </PolicySection>
      <PolicySection title="Weather and alerts">
        <p>
          Current conditions, hourly forecasts, and official alerts come from the United
          States National Weather Service. Alerts are presented separately from ordinary
          Comfort recommendations.
        </p>
      </PolicySection>
      <PolicySection title="Coverage geography">
        <p>
          The nationwide coverage catalog uses the United States Census Bureau&apos;s 2025
          state cartographic boundary file. Overture building data is deployed across all 50
          states and D.C.; route-level feature availability and confidence still vary with the
          local source data.
        </p>
      </PolicySection>
      <PolicySection title="Buildings and covered features">
        <p>
          Building footprints and available height attributes come from versioned Overture
          Maps releases. Covered pedestrian features are derived from reviewed OpenStreetMap
          extracts when that capability is enabled. Missing coverage is reported as limited
          data rather than favorable exposure.
        </p>
      </PolicySection>
      <PolicySection title="Comfort estimates">
        <p>
          {ENGINE_NAME} calculates solar position, building shade, urban wind exposure, rain
          exposure, and heat exposure with deterministic models. These outputs estimate
          relative route conditions and do not certify that a route is safe.
        </p>
      </PolicySection>
      <PolicySection title="Attribution">
        <p>
          Mapbox, OpenStreetMap contributors, Overture Maps, the National Weather Service,
          and the United States Census Bureau retain ownership and attribution rights in
          their respective data and services.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
