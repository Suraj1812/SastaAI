import type { MetadataRoute } from "next";
import { siteConfig } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#fafafd",
    theme_color: "#f8f8fb",
    icons: [
      { src: "/brand-mark.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/brand-mark.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
