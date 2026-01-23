export type Provider = "openrouter" | "opencode-zen"

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

// OpenRouter models - updated January 2026
export const OPENROUTER_MODELS: Model[] = [
  // Free models
  {
    id: "xiaomi/mimo-v2-flash:free",
    name: "MiMo V2 Flash",
    description: "Free Xiaomi model, great for coding tasks",
    category: "fast",
    provider: "openrouter",
    contextLength: 262000,
    free: true,
  },
  {
    id: "deepseek/deepseek-chat-v3-0324:free",
    name: "DeepSeek V3",
    description: "Free DeepSeek model, excellent value",
    category: "smart",
    provider: "openrouter",
    contextLength: 128000,
    free: true,
  },
  // Fast models
  {
    id: "anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "Anthropic's fast and efficient model",
    category: "fast",
    provider: "openrouter",
    contextLength: 200000,
  },
  // Smart models
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    description: "Anthropic's best coding model",
    category: "smart",
    provider: "openrouter",
    contextLength: 1000000,
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Anthropic's balanced model for complex tasks",
    category: "smart",
    provider: "openrouter",
    contextLength: 200000,
  },
  {
    id: "zhipu/glm-4.7",
    name: "GLM 4.7",
    description: "Zhipu AI's capable model",
    category: "smart",
    provider: "openrouter",
    contextLength: 128000,
  },
  // Reasoning models
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    description: "Anthropic's most capable model",
    category: "reasoning",
    provider: "openrouter",
    contextLength: 200000,
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    description: "DeepSeek's reasoning model, excellent value",
    category: "reasoning",
    provider: "openrouter",
    contextLength: 128000,
  },
]

// OpenCode Zen models - model IDs match the API exactly (no prefix needed for API calls)
export const OPENCODE_ZEN_MODELS: Model[] = [
  // Free models (great for trying out)
  {
    id: "big-pickle",
    name: "Big Pickle",
    description: "Free stealth model (limited time)",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 128000,
    free: true,
  },
  {
    id: "grok-code",
    name: "Grok Code Fast 1",
    description: "Free xAI coding model (limited time)",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 131072,
    free: true,
  },
  {
    id: "glm-4.7",
    name: "GLM 4.7",
    description: "GLM model",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 128000,
  },
  // Fast models
  {
    id: "claude-3-5-haiku",
    name: "Claude Haiku 3.5",
    description: "Anthropic's fast and efficient model",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 200000,
  },
  // Smart models
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Anthropic's balanced model for complex tasks",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 200000,
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "Anthropic's latest fast model",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 200000,
  },
  {
    id: "kimi-k2",
    name: "Kimi K2",
    description: "Moonshot's powerful model",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 131072,
  },
  {
    id: "qwen3-coder",
    name: "Qwen3 Coder 480B",
    description: "Alibaba's massive coding model",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 131072,
  },
  {
    id: "glm-4.6",
    name: "GLM 4.6",
    description: "Zhipu AI's capable model",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 128000,
  },
  // Reasoning models
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    description: "Anthropic's hybrid reasoning model",
    category: "reasoning",
    provider: "opencode-zen",
    contextLength: 200000,
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    description: "Anthropic's most capable model",
    category: "reasoning",
    provider: "opencode-zen",
    contextLength: 200000,
  },
  {
    id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    description: "Anthropic's powerful reasoning model",
    category: "reasoning",
    provider: "opencode-zen",
    contextLength: 200000,
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    description: "Moonshot's reasoning model",
    category: "reasoning",
    provider: "opencode-zen",
    contextLength: 131072,
  },
]

export const ALL_MODELS = [...OPENCODE_ZEN_MODELS, ...OPENROUTER_MODELS]

export interface Config {
  provider: Provider
  openrouterApiKey: string
  opencodeZenApiKey: string
  defaultModel: string
  safetyLevel: "strict" | "moderate" | "relaxed"
  dryRunByDefault: boolean
  blockedCommands: string[]
  confirmedDangerousPatterns: string[]
  theme?: string
  /** Enable project context detection (opt-in for privacy). Sends script names from package.json, Makefile, etc to AI. */
  repoContext?: boolean
}

export interface RepoContext {
  type: string // e.g., "node", "python", "rust", "go", "make"
  packageManager?: string // e.g., "npm", "bun", "yarn", "pnpm"
  scripts?: string[] // Available npm/bun scripts
  makeTargets?: string[] // Makefile targets
  cargoCommands?: string[] // Cargo subcommands
  hasDocker?: boolean
  hasGit?: boolean
}

export interface CommandHistory {
  input: string
  command: string
  output: string
  timestamp: number
}

export interface SafetyAnalysis {
  isDangerous: boolean
  severity: "low" | "medium" | "high" | "critical"
  reason?: string
  patterns: string[]
}

// Chat-style TUI message types
export type ChatMessageType = "user" | "assistant" | "system" | "result"

export interface ChatMessage {
  id: string
  type: ChatMessageType
  content: string
  timestamp: number
  // For assistant messages (translated commands)
  command?: string
  safety?: SafetyAnalysis
  // For result messages (after execution)
  executed?: boolean
  output?: string
  exitCode?: number
  executionKind?: "auto" | "manual" | "dry-run"
  parentMessageId?: string
  // For expandable output view
  expanded?: boolean
}
