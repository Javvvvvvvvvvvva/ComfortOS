import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PUBLIC_PRODUCT_NAME, PUBLIC_PRODUCT_TAGLINE } from "@/lib/brand";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: PUBLIC_PRODUCT_NAME,
  title: `${PUBLIC_PRODUCT_NAME} | ${PUBLIC_PRODUCT_TAGLINE}`,
  description: `${PUBLIC_PRODUCT_TAGLINE} Walking routes shaped by current outdoor conditions.`,
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
