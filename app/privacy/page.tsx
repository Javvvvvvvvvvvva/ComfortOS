import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";
import { PUBLIC_PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Privacy | ${PUBLIC_PRODUCT_NAME}`,
  description: `How ${PUBLIC_PRODUCT_NAME} handles location, search, route, and weather data.`,
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy notice"
      title="Your location stays temporary"
      summary={`${PUBLIC_PRODUCT_NAME} uses location and route inputs to answer the current request. The MVP does not create accounts or keep a location history.`}
    >
      <PolicySection title="Information used">
        <p>
          When you search or calculate a route, {PUBLIC_PRODUCT_NAME} processes search text, selected
          places, map positions, route endpoints, and the time of the request. Device or
          browser location is used only after you grant foreground permission.
        </p>
      </PolicySection>
      <PolicySection title="Where requests go">
        <p>
          Mapbox receives place searches and route coordinates. The National Weather Service
          receives a weather coordinate. On the mobile app, Apple Maps or Google Maps receives
          map viewport and tile requests; on the web app, Mapbox receives map tile requests. {" "}
          {PUBLIC_PRODUCT_NAME} data services receive bounded route-area queries for buildings
          and covered features. Hosting and network providers may process IP addresses and
          ordinary request metadata.
        </p>
      </PolicySection>
      <PolicySection title="Storage and logs">
        <p>
          The MVP does not store accounts, saved routes, search history, or location history.
          Current route state stays in device or browser memory for the active session.
          Location-derived API responses are marked private and no-store. Operational logs
          exclude precise coordinates, destinations, authorization headers, and credentials.
        </p>
      </PolicySection>
      <PolicySection title="Provider retention">
        <p>
          External providers process data under their own terms and retention policies.
          {PUBLIC_PRODUCT_NAME} does not use temporary Mapbox Search Box results to build a permanent
          places database.
        </p>
      </PolicySection>
      <PolicySection title="Your choices">
        <p>
          You can deny location permission and select both route points through search or the
          map. Refreshing the web page or terminating and restarting the mobile app clears the
          current in-memory route session.
        </p>
      </PolicySection>
      <PolicySection title="Questions and requests">
        <p>
          Use the <Link href="/support">Ahhway support channel</Link> for privacy questions or
          requests. Do not include a precise home location in a public issue.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
