import { parseEnv } from "node:util";

// The launcher and artifact scanner must agree on the effective dotenv values.
export const parseEnvironment = (source) => parseEnv(source);

export function environmentCandidates(source) {
  const entries = Object.entries(parseEnvironment(source));
  // Historical commented declarations are additional scan candidates, never
  // configuration loaded into the child process. Keep multiline blocks intact.
  let commented = [];
  const flush = () => {
    entries.push(...Object.entries(parseEnvironment(commented.join("\n"))));
    commented = [];
  };
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*# ?(.*)$/.exec(line);
    if (match) commented.push(match[1]);
    else flush();
  }
  flush();
  return entries;
}
