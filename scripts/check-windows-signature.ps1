param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [switch]$RequireSigned
)
$ErrorActionPreference = 'Stop'
if ($env:REQUIRE_WINDOWS_CODE_SIGNING -and $env:REQUIRE_WINDOWS_CODE_SIGNING -notin @('0', '1')) {
  throw 'REQUIRE_WINDOWS_CODE_SIGNING deve ser 0 ou 1.'
}
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ([System.IO.Path]::GetExtension($installer) -ne '.exe') { throw 'Esperado um instalador .exe.' }
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -eq 'Valid') {
  Write-Host 'Authenticode válido. Isso não garante ausência de avisos do SmartScreen.'
} elseif ($signature.Status -eq 'NotSigned' -and -not $RequireSigned -and $env:REQUIRE_WINDOWS_CODE_SIGNING -ne '1') {
  Write-Warning 'Instalador sem Authenticode, conforme decisão de lançamento sem certificado. Avise o usuário e publique SHA256SUMS.txt.'
} else {
  throw "Assinatura Windows recusada: $($signature.Status). Não publique este instalador."
}
