# AGENTS.md - Magic Shell

Guidelines for AI agents working in this repository.

## Project Overview

Magic Shell is a CLI tool that translates natural language to terminal commands using AI.
Built with Bun and TypeScript, it supports multiple AI providers (OpenCode Zen, OpenRouter)
and features a TUI mode with theme support.

## Build/Lint/Test Commands

```bash
# Development
bun run dev                    # Run CLI in dev mode
bun run dev:tui                # Run TUI mode in dev mode

# Build
bun run build                  # Build to dist/

# Type checking
bun run typecheck              # TypeScript type check (tsc --noEmit)

# No test framework configured yet
# To run a single file: bun run src/lib/safety.ts
```

## Code Style Guidelines

### TypeScript Configuration

- Target: ES2022
- Module: ESNext with bundler resolution
- Strict mode enabled
- Uses `bun-types` for Bun runtime types

### Imports

```typescript
// 1. Node.js built-ins first
import { spawn } from "child_process"
import { homedir } from "os"
import { join } from "path"

// 2. External dependencies
import { createCliRenderer, BoxRenderable } from "@opentui/core"

// 3. Internal modules (relative imports)
import type { Config, CommandHistory, Provider } from "./types"
import { loadConfig, saveConfig } from "./config"
```

- Use `type` imports for type-only imports: `import type { Model } from "./types"`
- Group imports by: node builtins, external deps, internal modules
- Prefer named exports over default exports (except for main entry points)

### Formatting

- Double quotes for strings
- No semicolons (implicit ASI)
- 2-space indentation
- Trailing commas in multiline structures
- Max line length ~100 characters (flexible)

### Types

```typescript
// Define types in src/lib/types.ts for shared types
export type Provider = "openrouter" | "opencode-zen"
export type SafetySeverity = "low" | "medium" | "high" | "critical"

export interface Model {
  id: string
  name: string
  description: string
  category: "fast" | "smart" | "reasoning"
  provider: Provider
  contextLength: number
  free?: boolean
  disabled?: boolean
  disabledReason?: string
}

// Use explicit return types for exported functions
export function analyzeCommand(command: string, config: Config): SafetyAnalysis {
  // ...
}

// Inline types for simple local functions are acceptable
const cleanCommand = (cmd: string) => cmd.trim()
```

### Naming Conventions

- **Files**: kebab-case (`lib/keychain.ts`, `lib/types.ts`)
- **Types/Interfaces**: PascalCase (`Model`, `SafetyAnalysis`, `ShellInfo`)
- **Functions**: camelCase (`loadConfig`, `analyzeCommand`, `detectShell`)
- **Constants**: UPPER_SNAKE_CASE for module-level constants (`DEFAULT_CONFIG`, `CRITICAL_PATTERNS`)
- **Variables**: camelCase (`currentModel`, `dryRunMode`)

### Error Handling

```typescript
// Use try-catch for external operations (file I/O, API calls)
try {
  const data = readFileSync(CONFIG_FILE, "utf-8")
  return JSON.parse(data) as Config
} catch {
  return { ...DEFAULT_CONFIG }
}

// For API errors, extract message and throw descriptive Error
if (!response.ok) {
  const errorText = await response.text()
  let errorMessage = `API request failed: ${response.status}`
  try {
    const errorData = JSON.parse(errorText)
    if (errorData.error?.message) {
      errorMessage = errorData.error.message
    }
  } catch {}
  throw new Error(errorMessage)
}

// Type-safe error message extraction
const message = error instanceof Error ? error.message : String(error)
```

### Functions

```typescript
// Prefer small, focused functions
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

// Use async/await for promises
export async function getApiKey(provider: Provider): Promise<string> {
  // Check environment variables first
  if (provider === "openrouter") {
    const envKey = process.env.OPENROUTER_API_KEY
    if (envKey) return envKey
  }
  // ...
}

// Cache expensive computations
let cachedShellInfo: ShellInfo | null = null
export function getShellInfo(): ShellInfo {
  if (!cachedShellInfo) {
    cachedShellInfo = detectShell()
  }
  return cachedShellInfo
}
```

### Patterns Used

**Configuration with Defaults**
```typescript
const DEFAULT_CONFIG: Config = {
  provider: "opencode-zen",
  defaultModel: "big-pickle",
  safetyLevel: "moderate",
  // ...
}

export function loadConfig(): Config {
  // Merge loaded config with defaults
  const loaded = JSON.parse(data) as Partial<Config>
  return { ...DEFAULT_CONFIG, ...loaded }
}
```

**Platform Detection**
```typescript
switch (process.platform) {
  case "darwin":
    return setSecretMacOS(key, value)
  case "linux":
    return setSecretLinux(key, value)
  case "win32":
    return setSecretWindows(key, value)
  default:
    return false
}
```

**Regex Pattern Matching for Safety**
```typescript
const CRITICAL_PATTERNS = [
  /rm\s+(-[rf]+\s+)*[\/~](\s|$)/,  // rm -rf / or ~
  /wget.*\|\s*(ba)?sh/,            // pipe wget to shell
]

for (const pattern of CRITICAL_PATTERNS) {
  if (pattern.test(normalizedCommand)) {
    matchedPatterns.push(pattern.source)
    highestSeverity = "critical"
  }
}
```

## Project Structure

```
src/
  index.ts          # CLI entry point (non-TUI mode)
  cli.ts            # TUI mode entry point
  lib/
    types.ts        # Shared type definitions and model configs
    config.ts       # Config file management (~/.magic-shell/)
    api.ts          # AI provider API integrations
    safety.ts       # Command safety analysis
    theme.ts        # Theme system (OpenCode-compatible)
    keychain.ts     # Secure credential storage
    shell.ts        # Shell/platform detection
```

## Key Concepts

1. **Providers**: OpenCode Zen (preferred, has free models) and OpenRouter
2. **Models**: Categorized as fast/smart/reasoning, some are free, some disabled
3. **Safety Levels**: strict/moderate/relaxed - determines which commands need confirmation
4. **Themes**: Multiple themes (opencode, tokyonight, catppuccin, etc.)
5. **Shell Detection**: Auto-detects bash/zsh/fish/powershell/cmd and adjusts prompts

## Dependencies

- `@opentui/core`: TUI rendering framework
- `bun`: Runtime and build tool
- `typescript`: Type checking only (Bun handles transpilation)

## Environment Variables

- `OPENCODE_ZEN_API_KEY`: API key for OpenCode Zen
- `OPENROUTER_API_KEY`: API key for OpenRouter
- `DEBUG_API=1`: Enable API response debugging
