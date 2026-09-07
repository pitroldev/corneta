param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [switch]$RequireSigned
)
$ErrorActionPreference = 'Stop'
if ($env:REQUIRE_WINDOWS_CODE_SIGNING -and $env:REQUIRE_WINDOWS_CODE_SIGNING -notin @('0', '1')) {
  throw 'REQUIRE_WINDOWS_CODE_SIGNING must be 0 or 1.'
}
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ([System.IO.Path]::GetExtension($installer) -ne '.exe') { throw 'Expected an .exe installer.' }
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -eq 'Valid') {
  Write-Host 'Valid Authenticode signature. This does not guarantee the absence of SmartScreen warnings.'
} elseif ($signature.Status -eq 'NotSigned' -and -not $RequireSigned -and $env:REQUIRE_WINDOWS_CODE_SIGNING -ne '1') {
  Write-Warning 'Installer has no Authenticode signature, as allowed by the unsigned release policy. Notify users and publish SHA256SUMS.txt.'
} else {
  throw "Windows signature rejected: $($signature.Status). Do not publish this installer."
}
