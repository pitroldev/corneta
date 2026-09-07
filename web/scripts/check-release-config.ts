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
      throw new Error(`Não foi possível carregar ${name}.`);
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
      `Publicação bloqueada:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      "Configuração de publicação válida. Ainda é necessário validar o deploy e o download reais.",
    );
  }
} catch {
  console.error(
    "Publicação bloqueada: identidade do build inválida ou divergente.",
  );
  process.exitCode = 1;
}
