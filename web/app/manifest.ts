import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corneta",
    short_name: "Corneta",
    description:
      "Local multistream for streamers, with independent outputs and control on your PC.",
    start_url: "/",
    display: "standalone",
    background_color: "#100b07",
    theme_color: "#100b07",
    lang: "en",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
