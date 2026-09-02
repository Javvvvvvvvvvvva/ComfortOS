import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Support | ComfortOS",
  description: "Get help or report route and place-data issues in ComfortOS.",
};

export default function SupportPage() {
  const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL?.trim();

  return (
    <PolicyPage
      eyebrow="Support"
      title="Report a route or data problem"
      summary="Include the city, approximate area, time, and what looked wrong. Do not send precise home locations, access tokens, or other sensitive information."
    >
      <PolicySection title="Contact">
        {supportUrl ? (
          <p>
            <Link className="policy-contact" href={supportUrl}>
              Open the ComfortOS support channel
            </Link>
          </p>
        ) : (
          <p>
            A monitored public support channel is being configured before external beta
            access. Please use the project owner contact during private validation.
          </p>
        )}
      </PolicySection>
      <PolicySection title="Place listing corrections">
        <p>
          ComfortOS displays temporary Mapbox place-search results. Report an incorrect result
          here and, when appropriate, submit the business correction to the upstream mapping
          provider as well.
        </p>
      </PolicySection>
      <PolicySection title="Weather and urgent conditions">
        <p>
          ComfortOS support cannot provide emergency or weather-safety assistance. Follow
          official alerts and local emergency services for urgent conditions.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
