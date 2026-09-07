export function complianceErrors(manifest, sidecars) {
  const errors = [];
  if (manifest?.schemaVersion !== 1 || manifest.reviewed !== true)
    errors.push(
      "A correspondência das fontes GPL ainda precisa de revisão explícita em compliance/ffmpeg-sources.json.",
    );
  if (
    sidecars?.ffmpeg?.verified !== true ||
    typeof sidecars?.ffmpeg?.archiveSha256 !== "string" ||
    typeof manifest?.ffmpegArchiveSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(sidecars?.ffmpeg?.archiveSha256 ?? "") ||
    !/^[a-f0-9]{64}$/i.test(manifest?.ffmpegArchiveSha256 ?? "") ||
    manifest.ffmpegArchiveSha256.toLowerCase() !==
      sidecars.ffmpeg.archiveSha256.toLowerCase()
  )
    errors.push(
      "O pacote de fontes não identifica o arquivo FFmpeg verificado deste build.",
    );
  if (!Array.isArray(manifest?.sources) || !manifest.sources.length) {
    errors.push(
      "Cadastre os arquivos de fontes correspondentes (FFmpeg, bibliotecas GPL, scripts e patches de build).",
    );
    return errors;
  }
  const names = new Set();
  for (const source of manifest.sources) {
    if (!source || typeof source !== "object") {
      errors.push("Entrada de fonte inválida.");
      continue;
    }
    const file = source.file;
    if (
      typeof file !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:zip|tar\.xz|tar\.gz)$/.test(
        file,
      ) ||
      names.has(file.toLowerCase())
    )
      errors.push("Nome de arquivo de fontes inválido ou duplicado.");
    else names.add(file.toLowerCase());
    if (!/^[a-f0-9]{64}$/i.test(source.sha256 ?? ""))
      errors.push("Cada arquivo de fontes exige SHA-256 fixado.");
    try {
      const url = new URL(source.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        /\/(?:latest|main|master)(?:\/|$)/.test(url.pathname)
      )
        throw new Error();
    } catch {
      errors.push(
        "URL de fontes deve ser HTTPS e versionada, sem credenciais nem branch/tag rolante.",
      );
    }
  }
  return errors;
}
