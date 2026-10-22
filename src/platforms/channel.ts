/** Helpers the platforms share when normalizing pasted channel handles and URLs. */

export function afterHost(s: string, needles: string[]): string {
  const low = s.toLowerCase();
  for (const n of needles) {
    const i = low.indexOf(n);
    if (i >= 0) return s.slice(i + n.length);
  }
  return s;
}

export function firstSeg(path: string): string {
  return (path.split(/[/?#]/).find((x) => x.length > 0) ?? "").replace(
    /^@+/,
    "",
  );
}

/** Fold accented characters before stripping non-ASCII characters. */
export function foldAscii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
