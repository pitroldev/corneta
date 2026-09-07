# Parse repository scripts without executing them, downloading tools or accessing app data.
$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
$failures = 0
$files = @(Get-ChildItem -LiteralPath $scriptRoot -Filter '*.ps1' -File -Recurse)
foreach ($file in $files) {
    $tokens = $null
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    foreach ($failure in $parseErrors) {
        Write-Error -ErrorAction Continue "$($file.Name):$($failure.Extent.StartLineNumber): syntax error ($($failure.ErrorId))."
        $failures++
    }
}
if ($failures -gt 0) { exit 1 }
Write-Host "PowerShell syntax: $($files.Count) valid scripts (not executed)."
