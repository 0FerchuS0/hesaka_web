param(
    [string]$TenantSlug = "",
    [string]$EnvFile = "",
    [string]$OutputDir = "",
    [int]$Retention = 14
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[backup] $Message"
}

function Resolve-PgBinary {
    param([string]$BinaryName)

    $command = Get-Command $BinaryName -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $commonRoots = @(
        "C:\Program Files\PostgreSQL",
        "C:\Program Files (x86)\PostgreSQL"
    )

    foreach ($root in $commonRoots) {
        if (-not (Test-Path $root)) {
            continue
        }

        $candidate = Get-ChildItem -Path $root -Directory |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName "bin\$BinaryName.exe" } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1

        if ($candidate) {
            return $candidate
        }
    }

    throw "No se encontro $BinaryName. Instala PostgreSQL client tools o agrega su binario al PATH."
}

function Import-EnvFile {
    param([string]$PathValue)

    if (-not $PathValue -or -not (Test-Path $PathValue)) {
        return
    }

    foreach ($line in Get-Content -Path $PathValue) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $name = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Get-DbConfig {
    $databaseUrl = $env:BACKUP_DATABASE_URL
    if (-not $databaseUrl) {
        $databaseUrl = $env:DATABASE_URL
    }

    if ($databaseUrl) {
        $uri = [System.Uri]$databaseUrl
        $userInfo = $uri.UserInfo.Split(":", 2)
        return @{
            Host = $uri.Host
            Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
            User = [System.Uri]::UnescapeDataString($userInfo[0])
            Password = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
            Database = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
        }
    }

    if ($env:PGHOST -and $env:PGUSER -and $env:PGDATABASE) {
        return @{
            Host = $env:PGHOST
            Port = if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }
            User = $env:PGUSER
            Password = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "" }
            Database = $env:PGDATABASE
        }
    }

    throw "Faltan credenciales. Define BACKUP_DATABASE_URL o el grupo PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE."
}

function Get-SafeTenantSlug {
    param([string]$Value, [string]$FallbackDatabase)

    $candidate = $Value
    if (-not $candidate) {
        $candidate = $env:BACKUP_TENANT_SLUG
    }
    if (-not $candidate) {
        $candidate = $env:DEFAULT_TENANT_SLUG
    }
    if (-not $candidate) {
        $candidate = $FallbackDatabase
    }

    $safe = ($candidate.ToLowerInvariant() -replace "[^a-z0-9_-]", "-").Trim("-")
    if (-not $safe) {
        throw "No se pudo inferir un tenant slug valido para nombrar el backup."
    }
    return $safe
}

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $EnvFile) {
    $EnvFile = Join-Path $repoRoot ".env.railway-backup"
}

Import-EnvFile -PathValue $EnvFile

$db = Get-DbConfig
$resolvedTenantSlug = Get-SafeTenantSlug -Value $TenantSlug -FallbackDatabase $db.Database

$backupRoot = if ($OutputDir) {
    $OutputDir
} else {
    Join-Path $repoRoot "backups\railway\$resolvedTenantSlug"
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupRoot "$resolvedTenantSlug`_$timestamp.dump"
$manifestFile = [System.IO.Path]::ChangeExtension($backupFile, ".json")

$pgDump = Resolve-PgBinary -BinaryName "pg_dump"
$pgRestore = Resolve-PgBinary -BinaryName "pg_restore"

$env:PGPASSWORD = $db.Password

Write-Step "Generando dump de $($db.Database) en $backupFile"

& $pgDump `
    -h $db.Host `
    -p $db.Port `
    -U $db.User `
    -F c `
    -f $backupFile `
    $db.Database

if ($LASTEXITCODE -ne 0) {
    throw "pg_dump devolvio codigo $LASTEXITCODE."
}

Write-Step "Validando dump"
& $pgRestore -l $backupFile | Out-Null

if ($LASTEXITCODE -ne 0) {
    throw "pg_restore no pudo leer el dump generado."
}

$fileInfo = Get-Item $backupFile
$manifest = [ordered]@{
    tenant_slug = $resolvedTenantSlug
    source = "railway-postgres"
    database = $db.Database
    host = $db.Host
    created_at = (Get-Date).ToString("o")
    size_bytes = $fileInfo.Length
    filename = $fileInfo.Name
}
$manifest | ConvertTo-Json | Set-Content -Path $manifestFile -Encoding UTF8

if ($Retention -gt 0) {
    $oldBackups = Get-ChildItem -Path $backupRoot -Filter "*.dump" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $Retention

    foreach ($oldBackup in $oldBackups) {
        Remove-Item -LiteralPath $oldBackup.FullName -Force
        $oldManifest = [System.IO.Path]::ChangeExtension($oldBackup.FullName, ".json")
        if (Test-Path $oldManifest) {
            Remove-Item -LiteralPath $oldManifest -Force
        }
    }
}

Write-Step "Backup listo: $backupFile"
