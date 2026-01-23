import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

export type ShellType = 
  | "bash"
  | "zsh"
  | "fish"
  | "powershell"
  | "pwsh"  // PowerShell Core
  | "cmd"
  | "nushell"
  | "sh"
  | "unknown"

export type PlatformType = "macos" | "linux" | "windows" | "unknown"

export interface ShellInfo {
  shell: ShellType
  shellPath: string
  platform: PlatformType
  isWSL: boolean
  terminalEmulator?: string
  homeDir: string
}

/**
 * Detect the current shell environment
 */
export function detectShell(): ShellInfo {
  const platform = detectPlatform()
  const isWSL = detectWSL()
  const shellPath = getShellPath()
  const shell = parseShellType(shellPath)
  const terminalEmulator = detectTerminalEmulator()
  const homeDir = homedir()

  return {
    shell,
    shellPath,
    platform,
    isWSL,
    terminalEmulator,
    homeDir,
  }
}

function detectPlatform(): PlatformType {
  switch (process.platform) {
    case "darwin":
      return "macos"
    case "linux":
      return "linux"
    case "win32":
      return "windows"
    default:
      return "unknown"
  }
}

function detectWSL(): boolean {
  if (process.platform !== "linux") return false
  
  try {
    // Check for WSL-specific indicators
    const release = execSync("uname -r", { encoding: "utf-8" }).toLowerCase()
    if (release.includes("microsoft") || release.includes("wsl")) {
      return true
    }
    
    // Check for WSL interop
    if (existsSync("/proc/sys/fs/binfmt_misc/WSLInterop")) {
      return true
    }
    
    return false
  } catch {
    return false
  }
}

function getShellPath(): string {
  // Check SHELL environment variable (Unix-like)
  if (process.env.SHELL) {
    return process.env.SHELL
  }

  // Check ComSpec for Windows CMD
  if (process.env.ComSpec) {
    return process.env.ComSpec
  }

  // Check PSModulePath for PowerShell
  if (process.env.PSModulePath) {
    // Determine if it's PowerShell Core or Windows PowerShell
    if (process.env.POWERSHELL_DISTRIBUTION_CHANNEL) {
      return "pwsh"
    }
    return "powershell"
  }

  // Try to detect from parent process on Unix
  if (process.platform !== "win32") {
    try {
      const ppid = process.ppid
      const cmdline = execSync(`ps -p ${ppid} -o comm=`, { encoding: "utf-8" }).trim()
      if (cmdline) return cmdline
    } catch {
      // Ignore
    }
  }

  // Default fallbacks
  if (process.platform === "win32") {
    return process.env.ComSpec || "cmd.exe"
  }
  
  return "/bin/sh"
}

function parseShellType(shellPath: string): ShellType {
  const shellName = shellPath.split(/[/\\]/).pop()?.toLowerCase() || ""
  
  if (shellName.includes("bash")) return "bash"
  if (shellName.includes("zsh")) return "zsh"
  if (shellName.includes("fish")) return "fish"
  if (shellName.includes("pwsh") || shellName === "pwsh.exe") return "pwsh"
  if (shellName.includes("powershell") || shellName === "powershell.exe") return "powershell"
  if (shellName.includes("cmd") || shellName === "cmd.exe") return "cmd"
  if (shellName.includes("nu") || shellName === "nu.exe") return "nushell"
  if (shellName === "sh" || shellName === "dash") return "sh"
  
  return "unknown"
}

function detectTerminalEmulator(): string | undefined {
  // Common terminal emulator environment variables
  const termProgram = process.env.TERM_PROGRAM
  if (termProgram) return termProgram

  // Check for specific terminals
  if (process.env.KITTY_WINDOW_ID) return "kitty"
  if (process.env.ALACRITTY_SOCKET) return "alacritty"
  if (process.env.WEZTERM_PANE) return "wezterm"
  if (process.env.GHOSTTY_RESOURCES_DIR) return "ghostty"
  if (process.env.ITERM_SESSION_ID) return "iTerm2"
  if (process.env.HYPER_CLI) return "hyper"
  if (process.env.WT_SESSION) return "windows-terminal"
  if (process.env.KONSOLE_VERSION) return "konsole"
  if (process.env.GNOME_TERMINAL_SCREEN) return "gnome-terminal"
  if (process.env.TILIX_ID) return "tilix"
  if (process.env.TERMUX_VERSION) return "termux"

  return process.env.TERM || undefined
}

/**
 * Get shell-specific command syntax hints for the AI
 */
export function getShellSyntaxHints(shell: ShellType): string {
  switch (shell) {
    case "bash":
      return `Shell: Bash
- Use $(...) for command substitution
- Use [[ ]] for conditionals
- Arrays: arr=(a b c), access with \${arr[0]}
- String manipulation: \${var##*/}, \${var%.*}
- Here documents: <<EOF ... EOF`

    case "zsh":
      return `Shell: Zsh
- Use $(...) for command substitution  
- Extended globbing enabled by default (**/*, (#i) for case-insensitive)
- Arrays are 1-indexed: arr=(a b c), access with \$arr[1]
- Supports Bash syntax for compatibility
- Global aliases and suffix aliases available`

    case "fish":
      return `Shell: Fish
- Use (...) for command substitution (not $())
- Variables: set var value, access with \$var
- Conditionals: if test ...; ...; end
- Loops: for x in ...; ...; end
- No export, use: set -x VAR value
- Lists: set list a b c, access with \$list[1]`

    case "powershell":
    case "pwsh":
      return `Shell: PowerShell
- Use Get-ChildItem (alias: ls, dir) for listing
- Use Remove-Item (alias: rm, del) for deletion
- Use Copy-Item (alias: cp, copy) for copying
- Variables: $var = value
- Cmdlet naming: Verb-Noun (Get-Process, Set-Location)
- Pipelines pass objects, not text
- Use Select-Object, Where-Object for filtering`

    case "cmd":
      return `Shell: Windows CMD
- Use dir instead of ls
- Use del/erase instead of rm
- Use copy instead of cp
- Use move instead of mv
- Use type instead of cat
- Use cd /d to change drives
- Environment vars: %VAR%, set VAR=value
- Use ^ for line continuation`

    case "nushell":
      return `Shell: Nushell
- Structured data (tables) in pipelines
- Use ls, rm, cp, mv with table output
- Conditions: if $condition { } else { }
- Variables: let var = value, mut var = value
- String interpolation: $"Hello ($name)"
- Use where for filtering: ls | where size > 1mb`

    default:
      return `Shell: POSIX sh
- Use $(...) for command substitution
- Use [ ] for conditionals (spaces required)
- Limited string manipulation
- Use portable commands`
  }
}

/**
 * Get platform-specific path separator and common paths
 */
export function getPlatformPaths(platform: PlatformType): {
  pathSeparator: string
  homePlaceholder: string
  tempDir: string
  nullDevice: string
} {
  if (platform === "windows") {
    return {
      pathSeparator: "\\",
      homePlaceholder: "%USERPROFILE%",
      tempDir: process.env.TEMP || "C:\\Temp",
      nullDevice: "NUL",
    }
  }
  
  return {
    pathSeparator: "/",
    homePlaceholder: "~",
    tempDir: process.env.TMPDIR || "/tmp",
    nullDevice: "/dev/null",
  }
}

/**
 * Format a path for the current shell
 */
export function formatPathForShell(path: string, shell: ShellType): string {
  // Handle Windows path conversion
  if (shell === "cmd" || shell === "powershell") {
    // Convert forward slashes to backslashes
    return path.replace(/\//g, "\\")
  }
  
  // For Unix shells, convert backslashes to forward slashes
  return path.replace(/\\/g, "/")
}
