import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Terms | ComfortOS",
  description: "Terms for the ComfortOS limited beta walking-route experience.",
};

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Limited beta terms"
      title="Comfort guidance, not a safety guarantee"
      summary="ComfortOS compares estimated outdoor exposure along walking routes. It is not emergency guidance, medical advice, or turn-by-turn navigation."
    >
      <PolicySection title="Use of the service">
        <p>
          You may use ComfortOS to compare available walking routes. You remain responsible
          for observing actual street conditions, access restrictions, closures, traffic,
          weather, and official instructions.
        </p>
      </PolicySection>
      <PolicySection title="Estimated conditions">
        <p>
          Shade, wind shelter, rain cover, and heat exposure are model estimates built from
          available weather and geographic data. Conditions and source data may be incomplete,
          delayed, or inaccurate. Official weather alerts always take priority.
        </p>
      </PolicySection>
      <PolicySection title="Availability">
        <p>
          The limited beta may change, pause, restrict regions, or return only the fastest
          walking route when environmental data is unavailable. No offline routing or active
          navigation is provided.
        </p>
      </PolicySection>
      <PolicySection title="Acceptable use">
        <p>
          Do not automate abusive request volumes, bypass access controls, interfere with the
          service, or use ComfortOS in a way that violates provider terms or applicable law.
        </p>
      </PolicySection>
      <PolicySection title="Third-party services">
        <p>
          Maps, routes, places, weather, and geographic features are supplied by third-party
          providers. Their availability, attribution, and terms also apply to those portions
          of the experience.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
