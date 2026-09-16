import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import {
  PUBLIC_PRODUCT_NAME,
  PUBLIC_PRODUCT_TAGLINE,
  PUBLIC_SITE_URL,
} from "@/lib/brand";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  applicationName: PUBLIC_PRODUCT_NAME,
  title: `${PUBLIC_PRODUCT_NAME} | ${PUBLIC_PRODUCT_TAGLINE}`,
  description: `${PUBLIC_PRODUCT_TAGLINE} Walking routes shaped by current outdoor conditions.`,
  keywords: [
    "walking routes",
    "weather-aware navigation",
    "comfortable walking",
    "shade route",
    "heat-aware routing",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: PUBLIC_PRODUCT_NAME,
    title: `${PUBLIC_PRODUCT_NAME} | ${PUBLIC_PRODUCT_TAGLINE}`,
    description:
      "Compare the fastest walk with a route shaped by current heat, shade, rain, wind, snow, and ice exposure.",
    images: [
      {
        url: "/social/ahhway-preview.png",
        width: 1440,
        height: 900,
        alt: "Ahhway comparing a heat-aware walking route in Phoenix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PUBLIC_PRODUCT_NAME} | ${PUBLIC_PRODUCT_TAGLINE}`,
    description: "Weather-aware walking route comparison for the conditions outside now.",
    images: ["/social/ahhway-preview.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: PUBLIC_PRODUCT_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/brand/ahhway-mark.png",
    shortcut: "/brand/ahhway-mark.png",
    apple: "/icons/ahhway-192.png",
  },
};

export const viewport = {
  themeColor: "#f7c843",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
