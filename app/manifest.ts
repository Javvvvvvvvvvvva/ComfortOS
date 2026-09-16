import type { MetadataRoute } from "next";
import { PUBLIC_PRODUCT_NAME, PUBLIC_PRODUCT_TAGLINE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PUBLIC_PRODUCT_NAME} | ${PUBLIC_PRODUCT_TAGLINE}`,
    short_name: PUBLIC_PRODUCT_NAME,
    description:
      "Compare walking routes using current weather, shade, rain cover, wind, heat, snow, and ice exposure.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef3f5",
    theme_color: "#f7c843",
    orientation: "portrait-primary",
    categories: ["navigation", "travel", "weather"],
    icons: [
      {
        src: "/icons/ahhway-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/ahhway-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
