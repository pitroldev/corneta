import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corneta",
    short_name: "Corneta",
    description:
      "Multistream local para streamers, com saídas independentes e controle no seu PC.",
    start_url: "/",
    display: "standalone",
    background_color: "#100b07",
    theme_color: "#100b07",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
