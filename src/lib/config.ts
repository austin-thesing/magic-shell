import { homedir } from "os"
import { join } from "path"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import type { Config, CommandHistory, Provider } from "./types"
import { getSecret, setSecret, isSecureStorageAvailable } from "./keychain"

const CONFIG_DIR = join(homedir(), ".magic-shell")
const CONFIG_FILE = join(CONFIG_DIR, "config.json")
const HISTORY_FILE = join(CONFIG_DIR, "history.json")

// Keys for keychain storage
const KEYCHAIN_OPENROUTER = "openrouter-api-key"
const KEYCHAIN_OPENCODE_ZEN = "opencode-zen-api-key"

const DEFAULT_CONFIG: Config = {
  provider: "opencode-zen",
  openrouterApiKey: "", // Only used as fallback if keychain unavailable
  opencodeZenApiKey: "", // Only used as fallback if keychain unavailable
  defaultModel: "big-pickle", // Reliable free model
  safetyLevel: "moderate",
  dryRunByDefault: false,
  blockedCommands: [
    ":(){ :|:& };:", // fork bomb
    "> /dev/sda",
    "mkfs",
    "dd if=/dev/zero",
    "chmod -R 777 /",
    "chown -R",
  ],
  confirmedDangerousPatterns: [],
  repoContext: false, // Opt-in for privacy
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function loadConfig(): Config {
  ensureConfigDir()

  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const data = readFileSync(CONFIG_FILE, "utf-8")
    const loaded = JSON.parse(data) as Partial<Config>
    return { ...DEFAULT_CONFIG, ...loaded }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir()
  
  // Don't save API keys to the config file if we have secure storage
  const configToSave = { ...config }
  if (isSecureStorageAvailable()) {
    configToSave.openrouterApiKey = ""
    configToSave.opencodeZenApiKey = ""
  }
  
  writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2))
}

export async function getApiKey(provider: Provider): Promise<string> {
  // Check environment variables first (highest priority)
  if (provider === "openrouter") {
    const envKey = process.env.OPENROUTER_API_KEY
    if (envKey) return envKey
  } else if (provider === "opencode-zen") {
    const envKey = process.env.OPENCODE_ZEN_API_KEY
    if (envKey) return envKey
  }

  // Try to get from secure storage (keychain)
  const keychainKey = provider === "openrouter" ? KEYCHAIN_OPENROUTER : KEYCHAIN_OPENCODE_ZEN
  const secureKey = await getSecret(keychainKey)
  if (secureKey) return secureKey

  // Fallback to config file (for platforms without secure storage)
  const config = loadConfig()
  return provider === "openrouter" ? config.openrouterApiKey : config.opencodeZenApiKey
}

export async function setApiKey(provider: Provider, key: string): Promise<void> {
  const config = loadConfig()
  config.provider = provider

  // Try to store in secure storage first
  const keychainKey = provider === "openrouter" ? KEYCHAIN_OPENROUTER : KEYCHAIN_OPENCODE_ZEN
  const stored = await setSecret(keychainKey, key)

  if (!stored) {
    // Fallback: store in config file (less secure)
    if (provider === "openrouter") {
      config.openrouterApiKey = key
    } else {
      config.opencodeZenApiKey = key
    }
  }

  saveConfig(config)
}

export function loadHistory(): CommandHistory[] {
  ensureConfigDir()

  if (!existsSync(HISTORY_FILE)) {
    return []
  }

  try {
    const data = readFileSync(HISTORY_FILE, "utf-8")
    return JSON.parse(data) as CommandHistory[]
  } catch {
    return []
  }
}

export function saveHistory(history: CommandHistory[]): void {
  ensureConfigDir()
  // Keep only last 100 entries
  const trimmed = history.slice(-100)
  writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2))
}

export function addToHistory(entry: CommandHistory): void {
  const history = loadHistory()
  history.push(entry)
  saveHistory(history)
}

export { isSecureStorageAvailable }
