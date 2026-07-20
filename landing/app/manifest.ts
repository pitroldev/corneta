import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corneta",
    short_name: "Corneta",
    description: "Multistream local, grátis e open source.",
    start_url: "/",
    display: "standalone",
    background_color: "#100b07",
    theme_color: "#ffb323",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
