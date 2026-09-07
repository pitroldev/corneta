import {
  resolveBuildSha,
  releaseConfigErrors,
} from "../lib/server/release-config";

// Same precedence as a production Next build, without printing environment values.
for (const name of [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
]) {
  try {
    process.loadEnvFile(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(`Could not load ${name}.`);
  }
}
try {
  const sha = resolveBuildSha(process.env);
  const errors = releaseConfigErrors({
    ...process.env,
    BUILD_SHA: sha,
    NEXT_PUBLIC_BUILD_SHA: sha,
  });
  if (errors.length) {
    console.error(
      `Publication blocked:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      "Release configuration is valid. The actual deployment and download still require validation.",
    );
  }
} catch {
  console.error(
    "Publication blocked: build identity is invalid or inconsistent.",
  );
  process.exitCode = 1;
}
