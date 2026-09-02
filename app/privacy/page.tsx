import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy | ComfortOS",
  description: "How ComfortOS handles location, search, route, and weather data.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy notice"
      title="Your location stays temporary"
      summary="ComfortOS uses location and route inputs to answer the current request. The MVP does not create accounts or keep a location history."
    >
      <PolicySection title="Information used">
        <p>
          When you search or calculate a route, ComfortOS processes search text, selected
          places, map positions, route endpoints, and the time of the request. Browser
          geolocation is used only after you grant permission.
        </p>
      </PolicySection>
      <PolicySection title="Where requests go">
        <p>
          Mapbox receives place searches, route coordinates, and map tile requests. The
          National Weather Service receives a rounded weather coordinate. ComfortOS data
          services receive bounded route-area queries for buildings and covered features.
          Hosting and network providers may process IP addresses and ordinary request
          metadata.
        </p>
      </PolicySection>
      <PolicySection title="Storage and logs">
        <p>
          The MVP does not store accounts, saved routes, search history, or location history.
          Current route state stays in browser memory. Location-derived API responses are
          marked private and no-store. Operational logs exclude precise coordinates,
          destinations, authorization headers, and credentials.
        </p>
      </PolicySection>
      <PolicySection title="Provider retention">
        <p>
          External providers process data under their own terms and retention policies.
          ComfortOS does not use temporary Mapbox Search Box results to build a permanent
          places database.
        </p>
      </PolicySection>
      <PolicySection title="Your choices">
        <p>
          You can deny location permission and select both route points through search or the
          map. Closing or refreshing the page clears the current in-memory route session.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
