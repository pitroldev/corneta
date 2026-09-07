import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditEditorialContent } from "../lib/editorial/audit";
import { createEditorialManifest } from "../lib/editorial/manifest";

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function resolveWebRoot(): Promise<string> {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "web")];
  for (const candidate of candidates) {
    if (
      (await isDirectory(path.join(candidate, "content"))) &&
      (await isDirectory(path.join(candidate, "lib")))
    ) {
      return candidate;
    }
  }
  throw new Error("Could not locate web/content from the current directory.");
}

async function main(): Promise<void> {
  const webRoot = await resolveWebRoot();
  const result = await auditEditorialContent({
    contentRoot: path.join(webRoot, "content"),
    publicRoot: path.join(webRoot, "public"),
    repositoryRoot: path.resolve(webRoot, ".."),
  });

  for (const issue of result.issues) {
    const location = [issue.file, issue.field].filter(Boolean).join(":");
    const marker = issue.severity === "error" ? "ERROR" : "WARN";
    process.stderr.write(
      `${marker} ${location || "editorial"} [${issue.code}] ${issue.message}\n`,
    );
  }

  if (result.errorCount > 0) {
    process.stderr.write(
      `
Editorial validation failed: ${result.errorCount} error(s), ${result.warningCount} warning(s).
`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Editorial content is valid: ${result.documents.length} file(s), ${result.warningCount} warning(s).
`,
  );
  if (process.argv.includes("--manifest")) {
    const directory = path.join(webRoot, ".generated");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "editorial.json"),
      JSON.stringify(createEditorialManifest(result.documents)),
      "utf8",
    );
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Editorial content audit failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
