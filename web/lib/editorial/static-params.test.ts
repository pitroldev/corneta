import { describe, expect, it } from "vitest";
import { articleStaticParams, EMPTY_CATEGORY_SLUG } from "./static-params";

describe("article static params", () => {
  it("lists every published slug of a category", () => {
    expect(articleStaticParams(["first-stream", "obs-not-found"])).toEqual([
      { slug: "first-stream" },
      { slug: "obs-not-found" },
    ]);
  });

  it("keeps an empty category from disabling prerendering for the whole route", () => {
    expect(articleStaticParams([])).toEqual([{ slug: EMPTY_CATEGORY_SLUG }]);
  });
});
