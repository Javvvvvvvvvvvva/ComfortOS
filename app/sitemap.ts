import type { MetadataRoute } from "next";
import { PUBLIC_SITE_URL } from "@/lib/brand";

const publicRoutes = ["", "/coverage", "/data-sources", "/privacy", "/terms", "/support"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-09-15T00:00:00.000Z");

  return publicRoutes.map((path) => ({
    url: `${PUBLIC_SITE_URL}${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/coverage" || path === "/data-sources" ? 0.7 : 0.5,
  }));
}
