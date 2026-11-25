<#
.SYNOPSIS
  Slims down a bloated Obsidian vault by moving raw source repositories outside the vault,
  isolating specialized or archived sub-vaults, and backing up empty placeholder files.

.DESCRIPTION
  Non-destructive by default: supports -DryRun to preview every move before modifying files,
  and moves empty placeholder items into a recoverable backup directory rather than deleting them.

.EXAMPLE
  pwsh -File scripts/split-obsidian-vault.ps1 -MainVault "E:\Vaults\main" -DryRun
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MainVault,

    [string]$ArchiveRoot = (Split-Path -Parent $MainVault),

    [string]$SpecializedFolderName = "COS_VFX_Knowledge",

    [string]$RawSubFolderName = "99_RAW_SOURCES",

    [string]$EduRegex = '数学建模|美赛|JavaEE|JDK|JSP|SQL Server|云计算|人工智能大赛|选修课|实验[一二三四五六七八九十0-9]',

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $MainVault)) {
    throw "MainVault path not found: $MainVault"
}

$stamp = Get-Date -Format 'yyyy-MM-dd'
$backupDir = Join-Path $ArchiveRoot "_vault_backup\$stamp"
$rawArchiveDir = Join-Path $ArchiveRoot "RAW_SOURCES_Archive"
$specializedDst = Join-Path $ArchiveRoot $SpecializedFolderName
$eduVaultDir = Join-Path $ArchiveRoot "学业与竞赛归档"
$eduIdxDir = Join-Path $eduVaultDir "索引"

function Move-Safely {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path -LiteralPath $Source)) { return $false }
    if ($DryRun) {
        Write-Host "[DRY-RUN] Move '$Source' -> '$Destination'"
        return $true
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Move-Item -LiteralPath $Source -Destination $Destination -Force
    Write-Host "[MOVED] '$Source' -> '$Destination'"
    return $true
}

# 1. Move empty placeholder files/folders to recoverable backup
foreach ($item in @('未命名', '未命名.canvas', '未命名.base', 'Untitled', 'Untitled.canvas')) {
    $src = Join-Path $MainVault $item
    if (Test-Path -LiteralPath $src) {
        $isEmptyDir = (Test-Path -LiteralPath $src -PathType Container) -and ((Get-ChildItem -LiteralPath $src -Force | Measure-Object).Count -eq 0)
        $isTinyFile = (Test-Path -LiteralPath $src -PathType Leaf) -and ((Get-Item -LiteralPath $src).Length -le 64)
        if ($isEmptyDir -or $isTinyFile) {
            Move-Safely -Source $src -Destination (Join-Path $backupDir $item) | Out-Null
        }
    }
}

# 2. Move raw GitHub repo dumps out of Obsidian indexing scope
$rawSrc = Join-Path (Join-Path $MainVault $SpecializedFolderName) $RawSubFolderName
if (Test-Path -LiteralPath $rawSrc) {
    Move-Safely -Source $rawSrc -Destination (Join-Path $rawArchiveDir "${SpecializedFolderName}_RAW_SOURCES") | Out-Null
}

# 3. Split specialized knowledge folder into a standalone vault
$specSrc = Join-Path $MainVault $SpecializedFolderName
if (Test-Path -LiteralPath $specSrc) {
    Move-Safely -Source $specSrc -Destination $specializedDst | Out-Null
}

# 4. Split course/competition notes into a standalone archive vault
$eduFiles = Get-ChildItem -LiteralPath $MainVault -File -Filter '*.md' | Where-Object { $_.Name -match $EduRegex }
foreach ($f in $eduFiles) {
    Move-Safely -Source $f.FullName -Destination (Join-Path $eduVaultDir $f.Name) | Out-Null
}

$idxDir = Join-Path $MainVault '索引'
if (Test-Path -LiteralPath $idxDir) {
    $eduIdxFiles = Get-ChildItem -LiteralPath $idxDir -File -Filter '*.md' | Where-Object { $_.Name -match $EduRegex }
    foreach ($f in $eduIdxFiles) {
        Move-Safely -Source $f.FullName -Destination (Join-Path $eduIdxDir $f.Name) | Out-Null
    }
}

Write-Host "Done. DryRun=$($DryRun.IsPresent)"
