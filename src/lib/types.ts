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
  {
    id: "google/gemini-2.5-flash-preview:free",
    name: "Gemini 2.5 Flash",
    description: "Free Google model with thinking capabilities",
    category: "fast",
    provider: "openrouter",
    contextLength: 1048576,
    free: true,
  },
  // Fast models
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    description: "Google's fastest model, 1M context",
    category: "fast",
    provider: "openrouter",
    contextLength: 1048576,
  },
  {
    id: "anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "Anthropic's fast and efficient model",
    category: "fast",
    provider: "openrouter",
    contextLength: 200000,
  },
  {
    id: "openai/gpt-5.1-codex-mini",
    name: "GPT 5.1 Codex Mini",
    description: "OpenAI's efficient coding model",
    category: "fast",
    provider: "openrouter",
    contextLength: 128000,
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
    id: "openai/gpt-5.2-codex",
    name: "GPT 5.2 Codex",
    description: "OpenAI's latest coding model",
    category: "smart",
    provider: "openrouter",
    contextLength: 400000,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Google's advanced reasoning model",
    category: "smart",
    provider: "openrouter",
    contextLength: 1048576,
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
    id: "grok-code",
    name: "Grok Code Fast 1",
    description: "Free xAI coding model (limited time)",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 131072,
    free: true,
  },
  {
    id: "glm-4.7-free",
    name: "GLM 4.7",
    description: "Free GLM model (limited time)",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 128000,
    free: true,
  },
  {
    id: "minimax-m2.1-free",
    name: "MiniMax M2.1",
    description: "Free MiniMax model (limited time)",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 128000,
    free: true,
  },
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
    id: "gpt-5-nano",
    name: "GPT 5 Nano",
    description: "Free OpenAI model (temporarily disabled)",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 128000,
    free: true,
    disabled: true,
    disabledReason: "OpenCode Zen API issue",
  },
  // Fast models
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    description: "Google's fastest Gemini model",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 1000000,
  },
  {
    id: "claude-3-5-haiku",
    name: "Claude Haiku 3.5",
    description: "Anthropic's fast and efficient model",
    category: "fast",
    provider: "opencode-zen",
    contextLength: 200000,
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT 5.1 Codex Mini",
    description: "OpenAI's efficient coding model (temporarily disabled)",
    category: "fast",
    provider: "opencode-zen",
    disabled: true,
    disabledReason: "OpenCode Zen API issue",
    contextLength: 128000,
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
    id: "gpt-5.1-codex",
    name: "GPT 5.1 Codex",
    description: "OpenAI's coding-optimized model (temporarily disabled)",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 128000,
    disabled: true,
    disabledReason: "OpenCode Zen API issue",
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT 5.2 Codex",
    description: "OpenAI's latest coding model (temporarily disabled)",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 128000,
    disabled: true,
    disabledReason: "OpenCode Zen API issue",
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    description: "Google's advanced Gemini model",
    category: "smart",
    provider: "opencode-zen",
    contextLength: 1000000,
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
