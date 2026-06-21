import type { MetadataRoute } from "next";

// Web app manifest — makes /field installable to a phone home screen as a
// standalone app. start_url points at the operator app, not the dashboard.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rethink Field",
    short_name: "Rethink Field",
    description:
      "Frontline operator app for Rethink Food — advance meals from produced to delivered to verified, with delivery proof photos.",
    start_url: "/field",
    scope: "/field",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
