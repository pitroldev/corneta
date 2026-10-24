import { describe, expect, it } from "vitest";
import { articleSocialImage } from "./social-image";

describe("article social image", () => {
  it("serves each article card under the article's public path", () => {
    expect(
      articleSocialImage({
        href: "/guides/quality/dropped-frames",
        frontmatter: { title: "Quadros perdidos no OBS" },
      }),
    ).toEqual({
      url: expect.stringMatching(
        /\/opengraph-image\/guides\/quality\/dropped-frames$/,
      ),
      alt: "Quadros perdidos no OBS — Corneta",
      width: 1200,
      height: 630,
    });
    expect(
      articleSocialImage({
        href: "/en/guides/quality/dropped-frames",
        frontmatter: { title: "Dropped frames in OBS" },
      }).url,
    ).toMatch(/\/opengraph-image\/en\/guides\/quality\/dropped-frames$/);
  });
});
