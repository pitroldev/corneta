param(
    [string]$EnvironmentFile = $env:GITHUB_ENV
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$version = '0.9.4'
$archiveName = 'posthog-cli-x86_64-pc-windows-msvc.zip'
$expectedSha256 = '479a60a35ba927b4b8eb825a432b478fd07eef346b897910332ca825c4406890'
$downloadUrl = "https://github.com/PostHog/posthog/releases/download/posthog-cli/v$version/$archiveName"
$temporaryRoot = [System.IO.Path]::GetTempPath()
$workDirectory = Join-Path $temporaryRoot "corneta-posthog-cli-$version-$([guid]::NewGuid().ToString('N'))"
$archivePath = Join-Path $workDirectory $archiveName
$extractDirectory = Join-Path $workDirectory 'extracted'

New-Item -ItemType Directory -Path $extractDirectory -Force | Out-Null

try {
    Invoke-WebRequest `
        -Uri $downloadUrl `
        -OutFile $archivePath `
        -MaximumRedirection 5 `
        -TimeoutSec 30 `
        -UseBasicParsing

    $actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -cne $expectedSha256) {
        throw 'PostHog CLI SHA-256 does not match the reviewed value.'
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDirectory -Force
    $binaries = @(
        Get-ChildItem -LiteralPath $extractDirectory -Recurse -File -Filter 'posthog-cli.exe'
    )
    if ($binaries.Count -ne 1) {
        throw "Expected exactly one posthog-cli.exe; found $($binaries.Count)."
    }

    $binaryPath = $binaries[0].FullName
    $reportedVersion = (& $binaryPath --version 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $reportedVersion -notmatch "(^|\s)$([regex]::Escape($version))(\s|$)") {
        throw 'The PostHog CLI executable did not report the expected version.'
    }

    if ($EnvironmentFile) {
        "POSTHOG_CLI_BINARY_PATH=$binaryPath" |
            Out-File -LiteralPath $EnvironmentFile -Encoding utf8 -Append
    }
    Write-Output $binaryPath
}
finally {
    if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
        Remove-Item -LiteralPath $archivePath -Force
    }
}
