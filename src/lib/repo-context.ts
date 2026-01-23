import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { RepoContext } from "./types"

/**
 * Detects project context from the current working directory.
 * Only extracts minimal, non-sensitive information: script/command names.
 * Does NOT read file contents beyond config files for script names.
 */
export function detectRepoContext(cwd: string): RepoContext | null {
  const context: RepoContext = {
    type: "unknown",
  }

  let detected = false

  // Check for git repository
  if (existsSync(join(cwd, ".git"))) {
    context.hasGit = true
    detected = true
  }

  // Check for Docker
  if (existsSync(join(cwd, "Dockerfile")) || existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "docker-compose.yaml"))) {
    context.hasDocker = true
    detected = true
  }

  // Node.js / JavaScript / TypeScript projects
  const packageJsonPath = join(cwd, "package.json")
  if (existsSync(packageJsonPath)) {
    detected = true
    context.type = "node"
    
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
      
      // Detect package manager
      if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) {
        context.packageManager = "bun"
      } else if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
        context.packageManager = "pnpm"
      } else if (existsSync(join(cwd, "yarn.lock"))) {
        context.packageManager = "yarn"
      } else if (existsSync(join(cwd, "package-lock.json"))) {
        context.packageManager = "npm"
      } else if (packageJson.packageManager) {
        // Check packageManager field (e.g., "pnpm@8.0.0")
        const pm = packageJson.packageManager.split("@")[0]
        context.packageManager = pm
      }

      // Extract script names (not contents)
      if (packageJson.scripts && typeof packageJson.scripts === "object") {
        context.scripts = Object.keys(packageJson.scripts)
      }
    } catch {
      // Couldn't parse package.json, continue
    }
  }

  // Makefile projects
  const makefilePath = join(cwd, "Makefile")
  if (existsSync(makefilePath)) {
    detected = true
    if (context.type === "unknown") context.type = "make"
    
    try {
      const makefile = readFileSync(makefilePath, "utf-8")
      // Extract target names (lines starting with word followed by colon, not indented)
      const targetRegex = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm
      const targets: string[] = []
      let match
      while ((match = targetRegex.exec(makefile)) !== null) {
        // Ignore common internal targets
        if (!match[1].startsWith(".") && !match[1].startsWith("_")) {
          targets.push(match[1])
        }
      }
      if (targets.length > 0) {
        context.makeTargets = [...new Set(targets)] // Dedupe
      }
    } catch {
      // Couldn't read Makefile, continue
    }
  }

  // Rust projects
  if (existsSync(join(cwd, "Cargo.toml"))) {
    detected = true
    context.type = "rust"
    // Common cargo commands (no need to parse, they're standard)
    context.cargoCommands = ["build", "run", "test", "check", "clippy", "fmt", "doc"]
  }

  // Python projects
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "setup.py")) || existsSync(join(cwd, "requirements.txt"))) {
    detected = true
    if (context.type === "unknown") context.type = "python"
  }

  // Go projects
  if (existsSync(join(cwd, "go.mod"))) {
    detected = true
    if (context.type === "unknown") context.type = "go"
  }

  return detected ? context : null
}

/**
 * Formats repo context for inclusion in the system prompt.
 * Keeps it concise to minimize token usage.
 */
export function formatRepoContext(context: RepoContext): string {
  const lines: string[] = []

  lines.push(`Project type: ${context.type}`)

  if (context.packageManager) {
    lines.push(`Package manager: ${context.packageManager}`)
  }

  if (context.scripts && context.scripts.length > 0) {
    // Limit to first 15 scripts to avoid prompt bloat
    const displayScripts = context.scripts.slice(0, 15)
    const suffix = context.scripts.length > 15 ? ` (+${context.scripts.length - 15} more)` : ""
    lines.push(`Available scripts: ${displayScripts.join(", ")}${suffix}`)
  }

  if (context.makeTargets && context.makeTargets.length > 0) {
    const displayTargets = context.makeTargets.slice(0, 15)
    const suffix = context.makeTargets.length > 15 ? ` (+${context.makeTargets.length - 15} more)` : ""
    lines.push(`Make targets: ${displayTargets.join(", ")}${suffix}`)
  }

  if (context.cargoCommands) {
    lines.push(`Cargo commands: ${context.cargoCommands.join(", ")}`)
  }

  if (context.hasDocker) {
    lines.push(`Docker: available`)
  }

  if (context.hasGit) {
    lines.push(`Git: initialized`)
  }

  return lines.join("\n")
}
