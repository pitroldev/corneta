import { describe, expect, it } from "vitest";
import { pageTitle, TITLE_TEMPLATE } from "./page-title";

describe("page titles", () => {
  it("lets the brand template apply while the full title fits", () => {
    const title = "Qualidade e desempenho — Guias";
    expect(pageTitle(title)).toBe(title);
    expect(TITLE_TEMPLATE.replace("%s", title).length).toBeLessThanOrEqual(60);
  });

  it("drops the brand when it would push the title past the cut", () => {
    const title = "Dropped frames no OBS: rede, renderização ou codificação?";
    expect(pageTitle(title)).toEqual({ absolute: title });
  });
});
