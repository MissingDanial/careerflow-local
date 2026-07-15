param(
  [string[]]$ExtensionId = @(),
  [ValidateSet("Chrome", "Edge", "Both")]
  [string]$Browser = "Both",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionPath = (Resolve-Path (Join-Path $projectRoot "extension")).Path
$runtimeDir = Join-Path $projectRoot "server\data\native-host"
$hostExe = Join-Path $runtimeDir "careerflow-native-host.exe"
$hostConfigPath = Join-Path $runtimeDir "host-config.json"
$hostManifestPath = Join-Path $runtimeDir "com.careerflow.local.json"
$hostName = "com.careerflow.local"

if (!$SkipBuild -or !(Test-Path -LiteralPath $hostExe)) {
  & (Get-Command npm.cmd).Source run native:build
  if ($LASTEXITCODE -ne 0) {
    throw "Native Host build failed with exit code $LASTEXITCODE"
  }
}

function Read-SharedText([string]$Path) {
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally {
    $stream.Dispose()
  }
}

function Find-ExtensionIds([string]$UserDataRoot, [string]$ExpectedPath) {
  if (!(Test-Path -LiteralPath $UserDataRoot)) { return @() }
  $escapedPath = $ExpectedPath.Replace("\", "\\")
  $ids = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $profileDirs = @(Get-ChildItem -LiteralPath $UserDataRoot -Directory -ErrorAction SilentlyContinue)
  foreach ($profileDir in $profileDirs) {
    foreach ($fileName in @("Preferences", "Secure Preferences")) {
      $filePath = Join-Path $profileDir.FullName $fileName
      if (!(Test-Path -LiteralPath $filePath)) { continue }
      try { $text = Read-SharedText $filePath } catch { continue }
      $searchFrom = 0
      while ($searchFrom -lt $text.Length) {
        $index = $text.IndexOf($escapedPath, $searchFrom, [StringComparison]::OrdinalIgnoreCase)
        if ($index -lt 0) { break }
        $prefixStart = [Math]::Max(0, $index - 200000)
        $prefix = $text.Substring($prefixStart, $index - $prefixStart)
        $matches = [regex]::Matches($prefix, '"([a-p]{32})"\s*:\s*\{')
        if ($matches.Count -gt 0) {
          [void]$ids.Add($matches[$matches.Count - 1].Groups[1].Value)
        }
        $searchFrom = $index + $escapedPath.Length
      }
    }
  }
  return @($ids)
}

$browserTargets = @()
if ($Browser -in @("Chrome", "Both")) {
  $browserTargets += [pscustomobject]@{
    Name = "Chrome"
    UserData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
    Registry = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
  }
}
if ($Browser -in @("Edge", "Both")) {
  $browserTargets += [pscustomobject]@{
    Name = "Edge"
    UserData = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data"
    Registry = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
  }
}

$extensionIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($id in $ExtensionId) {
  if ($id -notmatch '^[a-p]{32}$') { throw "Invalid extension ID: $id" }
  [void]$extensionIds.Add($id)
}
foreach ($target in $browserTargets) {
  foreach ($id in Find-ExtensionIds $target.UserData $extensionPath) {
    [void]$extensionIds.Add($id)
  }
}
if ($extensionIds.Count -eq 0) {
  throw "Boss Find extension ID was not found. Load extension/ as an unpacked extension, then rerun or pass -ExtensionId <id>."
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$nodePath = (Get-Command node.exe).Source
$token = ""
if (Test-Path -LiteralPath $hostConfigPath) {
  try { $token = (Get-Content $hostConfigPath -Raw | ConvertFrom-Json).token } catch { $token = "" }
}
if (!$token) {
  $bytes = [byte[]]::new(32)
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($bytes) } finally { $random.Dispose() }
  $token = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

$hostConfig = [ordered]@{
  projectRoot = $projectRoot
  nodePath = $nodePath
  backendEntry = "server/src/server.js"
  dataDir = "server/data"
  logDir = "server/data/logs"
  host = "127.0.0.1"
  port = 8787
  token = $token
  startTimeoutMs = 12000
}
$manifest = [ordered]@{
  name = $hostName
  description = "CareerFlow Local backend launcher"
  path = $hostExe
  type = "stdio"
  allowed_origins = @($extensionIds | Sort-Object | ForEach-Object { "chrome-extension://$_/" })
}
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($hostConfigPath, ($hostConfig | ConvertTo-Json -Depth 5), $utf8)
[IO.File]::WriteAllText($hostManifestPath, ($manifest | ConvertTo-Json -Depth 5), $utf8)

$registered = @()
foreach ($target in $browserTargets) {
  if (!(Test-Path -LiteralPath $target.UserData) -and $Browser -eq "Both") { continue }
  New-Item -Path $target.Registry -Force | Out-Null
  Set-Item -Path $target.Registry -Value $hostManifestPath
  $registered += $target.Name
}

[pscustomobject]@{
  ok = $true
  hostName = $hostName
  extensionIds = @($extensionIds)
  browsers = $registered
  manifestPath = $hostManifestPath
  executablePath = $hostExe
  backendUrl = "http://127.0.0.1:8787"
} | ConvertTo-Json -Depth 5
