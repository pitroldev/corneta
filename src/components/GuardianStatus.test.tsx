import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pt } from "../lib/i18n/pt";
import { en } from "../lib/i18n/en";
import { GuardianStatus } from "./GuardianStatus";

vi.mock("../lib/i18n", () => ({
  useT: () => (key: keyof typeof pt) => pt[key],
}));

describe("GuardianStatus", () => {
  it("does not show a warning when disabled or verified", () => {
    expect(renderToStaticMarkup(<GuardianStatus status={undefined} />)).toBe(
      "",
    );
    expect(renderToStaticMarkup(<GuardianStatus status="ready" />)).toBe("");
  });

  it.each(["starting", "unavailable"] as const)(
    "announces %s with readable recovery copy",
    (status) => {
      const html = renderToStaticMarkup(<GuardianStatus status={status} />);
      expect(html).toContain('role="status"');
      expect(html).toContain(pt[`guardian.status.${status}.title`]);
      expect(html).toContain(pt[`guardian.status.${status}.body`]);
      expect(html).not.toMatch(/truncate|line-clamp|animate-/);
      expect(en[`guardian.status.${status}.body`]).toBeTruthy();
    },
  );
});
