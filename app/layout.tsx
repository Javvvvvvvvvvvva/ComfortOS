import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import { PUBLIC_PRODUCT_NAME, PUBLIC_PRODUCT_TAGLINE } from "@/lib/brand";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});

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
      <body className={`${manrope.variable} ${newsreader.variable}`}>
        {children}
      </body>
    </html>
  );
}
