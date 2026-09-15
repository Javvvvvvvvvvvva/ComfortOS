import type { Metadata } from "next";
import { PUBLIC_PRODUCT_NAME, PUBLIC_PRODUCT_TAGLINE } from "@/lib/brand";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: PUBLIC_PRODUCT_NAME,
  description: `${PUBLIC_PRODUCT_TAGLINE} Walking routes shaped by current outdoor conditions.`,
  icons: {
    icon: "/brand/ahhway-mark.png",
    shortcut: "/brand/ahhway-mark.png",
    apple: "/brand/ahhway-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
