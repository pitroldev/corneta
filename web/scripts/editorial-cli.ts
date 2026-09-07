import path from "node:path";
import { pathToFileURL } from "node:url";

// pnpm passes an explicit leading separator through to scripts. Accept that
// invocation too, without discarding separators or unknown options later on.
export function editorialArguments(argv: string[]): string[] {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

export function isEditorialCliEntrypoint(url: string): boolean {
  return Boolean(
    process.argv[1] &&
    pathToFileURL(path.resolve(process.argv[1])).href === url,
  );
}
