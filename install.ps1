#Requires -Version 5.1
<#
.SYNOPSIS
    Magic Shell Installer for Windows
.DESCRIPTION
    Downloads and installs Magic Shell on Windows systems.
.PARAMETER Version
    Specific version to install. Defaults to 'latest'.
.PARAMETER InstallDir
    Installation directory. Defaults to $env:LOCALAPPDATA\magic-shell\bin
.EXAMPLE
    irm https://raw.githubusercontent.com/austin-thesing/magic-shell/main/install.ps1 | iex
.EXAMPLE
    .\install.ps1 -Version v0.1.0
#>

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\magic-shell\bin"
)

$ErrorActionPreference = "Stop"

# Configuration
$Repo = "austin-thesing/magic-shell"
$PackageName = "magic-shell"

function Write-Info {
    param([string]$Message)
    Write-Host "info  " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "success  " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warn {
    param([string]$Message)
    Write-Host "warn  " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "error  " -ForegroundColor Red -NoNewline
    Write-Host $Message
    exit 1
}

function Get-Architecture {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($arch) {
        "X64" { return "x64" }
        "Arm64" { return "arm64" }
        default { Write-Error-Custom "Unsupported architecture: $arch" }
    }
}

function Get-LatestVersion {
    Write-Info "Fetching latest version..."
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
        return $release.tag_name
    }
    catch {
        Write-Error-Custom "Failed to fetch latest version: $_"
    }
}

function Install-ViaNpm {
    Write-Info "Installing via npm..."
    
    # Check for package managers in order of preference
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        Write-Info "Using bun..."
        bun add -g @austinthesing/magic-shell
    }
    elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Info "Using npm..."
        npm install -g @austinthesing/magic-shell
    }
    elseif (Get-Command yarn -ErrorAction SilentlyContinue) {
        Write-Info "Using yarn..."
        yarn global add @austinthesing/magic-shell
    }
    elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Info "Using pnpm..."
        pnpm add -g @austinthesing/magic-shell
    }
    else {
        Write-Error-Custom "No package manager found. Please install Node.js/npm, Bun, Yarn, or pnpm first."
    }
    
    Write-Success "Installed @austinthesing/magic-shell via npm"
    return $true
}

function Install-Binary {
    $arch = Get-Architecture
    $platform = "windows-$arch"
    
    if ($Version -eq "latest") {
        $Version = Get-LatestVersion
    }
    Write-Info "Version: $Version"
    Write-Info "Platform: $platform"
    
    # Create temp directory
    $tempDir = New-Item -ItemType Directory -Path "$env:TEMP\magic-shell-install-$(Get-Random)"
    
    try {
        # Download URL (adjust based on your release asset naming)
        $downloadUrl = "https://github.com/$Repo/releases/download/$Version/magic-shell-$Version-$platform.zip"
        $zipPath = Join-Path $tempDir "magic-shell.zip"
        
        Write-Info "Downloading from $downloadUrl..."
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
        }
        catch {
            Write-Warn "Binary release not found, falling back to npm install..."
            Install-ViaNpm
            return
        }
        
        Write-Info "Extracting..."
        Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
        
        Write-Info "Installing to $InstallDir..."
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        
        # Copy executable
        Copy-Item -Path (Join-Path $tempDir "magic-shell.exe") -Destination $InstallDir -Force
        
        # Create batch file shortcuts for msh and ms
        $mshBat = @"
@echo off
"%~dp0magic-shell.exe" %*
"@
        Set-Content -Path (Join-Path $InstallDir "msh.cmd") -Value $mshBat
        Set-Content -Path (Join-Path $InstallDir "ms.cmd") -Value $mshBat
        
        Write-Success "Installed magic-shell $Version to $InstallDir"
        
        # Add to PATH
        Add-ToPath
    }
    finally {
        # Cleanup
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Add-ToPath {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    
    if ($currentPath -split ";" | Where-Object { $_ -eq $InstallDir }) {
        Write-Info "Already in PATH"
        return
    }
    
    Write-Info "Adding to PATH..."
    $newPath = "$currentPath;$InstallDir"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    
    # Also update current session
    $env:Path = "$env:Path;$InstallDir"
    
    Write-Success "Added to PATH"
}

function Show-PostInstall {
    Write-Host ""
    Write-Success "Installation complete!"
    Write-Host ""
    Write-Host "To get started:"
    Write-Host "  1. Open a new terminal (to refresh PATH)"
    Write-Host ""
    Write-Host "  2. Set up your API key:"
    Write-Host "     msh --setup"
    Write-Host ""
    Write-Host "  3. Try it out:"
    Write-Host "     msh `"list all files`""
    Write-Host ""
}

# Main
function Main {
    Write-Host ""
    Write-Host "Magic Shell Installer" -ForegroundColor Blue
    Write-Host ""
    
    Install-Binary
    Show-PostInstall
}

Main
