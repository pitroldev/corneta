import { describe, expect, it } from "vitest";
import { obsFailure, obsHelpKind } from "./obsErrors";

describe("OBS failures", () => {
  it("reads the native code and message from a rejection", () => {
    expect(
      obsFailure({ code: "authenticationFailed", message: "senha recusada" }),
    ).toEqual({ code: "authenticationFailed", message: "senha recusada" });
    expect(obsFailure(new Error("join failed"))).toEqual({
      code: undefined,
      message: "join failed",
    });
    expect(obsFailure("plain text")).toEqual({ message: "plain text" });
  });

  it("chooses the help by code, not by words in the translated message", () => {
    expect(obsHelpKind("passwordRequired")).toBe("auth");
    expect(obsHelpKind("authenticationFailed")).toBe("auth");
    expect(obsHelpKind("identificationFailed")).toBe("auth");
    expect(obsHelpKind("connectionFailed")).toBe("notFound");
    // A closed connection or a refused request is not a password problem.
    expect(obsHelpKind("exchangeFailed")).toBe("generic");
    expect(obsHelpKind("requestRefused")).toBe("generic");
    expect(obsHelpKind(undefined)).toBe("generic");
  });
});
