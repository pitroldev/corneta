import { describe, it, expect } from "vitest";
import { makeFmt, fileStamp } from "./format";

const pt = makeFmt("pt-BR");
const en = makeFmt("en");
const T = new Date(2026, 6, 30, 20, 15).getTime();

describe("date and time", () => {
  it("uses month-first dates in English", () => {
    expect(pt.date(T)).toBe("30/07/26");
    expect(en.date(T)).toBe("07/30/26");
  });

  it("uses a 24-hour clock in both locales for tabular alignment", () => {
    expect(pt.time(T)).toBe("20:15");
    expect(en.time(T)).toBe("20:15");
  });
});

describe("numbers", () => {
  it("uses locale-specific grouping separators", () => {
    expect(pt.num(10868)).toBe("10.868");
    expect(en.num(10868)).toBe("10,868");
  });

  it("uses locale-specific decimal separators", () => {
    expect(pt.dec(6.05)).toBe("6,1");
    expect(en.dec(6.05)).toBe("6.1");
    expect(pt.dec(9, 2)).toBe("9,00");
  });
});

describe("durations", () => {
  it("preserves Portuguese duration formatting", () => {
    expect(pt.dur(3600 + 30 * 60)).toBe("1h30");
    expect(pt.dur(45 * 60)).toBe("45min");
  });

  it("includes minute units in English", () => {
    expect(en.dur(3600 + 30 * 60)).toBe("1h30m");
    expect(en.dur(45 * 60)).toBe("45m");
  });
});

describe("collation", () => {
  it("sorts accented Portuguese names correctly", () => {
    const names = ["Zé", "Ana", "Ácaro"];
    expect([...names].sort(pt.compare)).toEqual(["Ácaro", "Ana", "Zé"]);
  });
});

describe("fileStamp", () => {
  it("uses locale-independent ISO dates for sortable filenames", () => {
    expect(fileStamp(T)).toBe("2026-07-30");
  });
});
