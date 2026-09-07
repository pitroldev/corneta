import { parse } from "yaml";

export function workflowSteps(source) {
  const workflow = parse(source);
  if (!workflow?.jobs || typeof workflow.jobs !== "object")
    throw new Error("Workflow jobs are required.");
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
  if (!steps.length) throw new Error("No workflow steps inspected.");
  return steps;
}

// Tokenize the static commands this repository reviews, not arbitrary shell code.
// Quoted strings/comments cannot manufacture commands or --locked arguments.
// Missing/unsupported command forms fail the required-command count below.
function commandTokens(script) {
  const commands = [];
  let tokens = [],
    token = "",
    quote;
  const flushToken = () => {
    if (token) tokens.push(token);
    token = "";
  };
  const flushCommand = () => {
    flushToken();
    if (tokens.length) commands.push(tokens);
    tokens = [];
  };
  const text = script.replace(/(?:\\|`)\r?\n/g, " ");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = undefined;
      else if (char === "\\" && quote === '"' && text[i + 1] === '"')
        token += text[++i];
      else token += char;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "#" && !token) {
      while (i < text.length && text[i] !== "\n") i++;
      flushCommand();
    } else if (/[;\n&|]/.test(char)) flushCommand();
    else if (/\s/.test(char)) flushToken();
    else token += char;
  }
  if (quote) throw new Error("Unclosed shell quote in reviewed workflow.");
  flushCommand();
  return commands;
}

export function assertLockedWorkflows(sources, minimum) {
  const counts = Object.fromEntries(
    Object.keys(minimum).map((key) => [key, 0]),
  );
  for (const step of sources.flatMap(workflowSteps)) {
    if (step.run === undefined) continue;
    if (typeof step.run !== "string")
      throw new Error("Workflow run must be a string.");
    for (const tokens of commandTokens(step.run)) {
      const key =
        tokens[0] === "cargo"
          ? tokens.slice(0, 2).join(" ")
          : tokens.slice(0, 3).join(" ");
      if (!Object.hasOwn(counts, key)) continue;
      counts[key]++;
      const lock = tokens.indexOf("--locked");
      const separator = tokens.indexOf("--");
      const cargoSeparator =
        key === "pnpm tauri build"
          ? tokens.indexOf("--", separator + 1)
          : separator;
      if (
        lock < 0 ||
        (key === "pnpm tauri build" && (separator < 0 || lock < separator)) ||
        (cargoSeparator >= 0 && lock > cargoSeparator)
      )
        throw new Error(`Missing effective --locked argument: ${key}`);
    }
  }
  if (
    !Object.keys(counts).length ||
    Object.entries(minimum).some(
      ([key, count]) =>
        !Number.isInteger(count) || count < 1 || counts[key] < count,
    )
  )
    throw new Error("Required workflow commands were not inspected.");
  return counts;
}
