import { homedir } from "os"
import { join } from "path"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"

const PACKAGE_NAME = "@austinthesing/magic-shell"
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const CONFIG_DIR = join(homedir(), ".magic-shell")
const UPDATE_CHECK_FILE = join(CONFIG_DIR, ".update-check")

interface UpdateCheckState {
  lastCheck: number
  latestVersion: string | null
  dismissed: string | null // Version that was dismissed
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function loadUpdateState(): UpdateCheckState {
  ensureConfigDir()
  try {
    if (existsSync(UPDATE_CHECK_FILE)) {
      return JSON.parse(readFileSync(UPDATE_CHECK_FILE, "utf-8"))
    }
  } catch {
    // Ignore errors
  }
  return { lastCheck: 0, latestVersion: null, dismissed: null }
}

function saveUpdateState(state: UpdateCheckState): void {
  ensureConfigDir()
  try {
    writeFileSync(UPDATE_CHECK_FILE, JSON.stringify(state))
  } catch {
    // Ignore errors
  }
}

function getCurrentVersion(): string {
  // Read from package.json at build time this gets bundled
  // For runtime, we'll read it directly
  try {
    // Try to find package.json relative to the module
    const packagePaths = [
      join(__dirname, "../../package.json"),
      join(__dirname, "../../../package.json"),
      join(process.cwd(), "package.json"),
    ]
    
    for (const path of packagePaths) {
      if (existsSync(path)) {
        const pkg = JSON.parse(readFileSync(path, "utf-8"))
        if (pkg.name === PACKAGE_NAME || pkg.name === "magic-shell") {
          return pkg.version
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return "0.0.0" // Fallback
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number)
  const partsB = b.split(".").map(Number)
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0
    const numB = partsB[i] || 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }
  return 0
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000) // 3s timeout
    
    const response = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    })
    
    clearTimeout(timeout)
    
    if (!response.ok) return null
    
    const data = await response.json() as { version?: string }
    return data.version || null
  } catch {
    return null
  }
}

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  updateCommand: string
}

/**
 * Check for updates (non-blocking, respects check interval)
 * Returns update info if there's a new version, null otherwise
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const state = loadUpdateState()
  const currentVersion = getCurrentVersion()
  const now = Date.now()
  
  // Skip if we checked recently
  if (now - state.lastCheck < CHECK_INTERVAL_MS) {
    // But still return cached update info if available
    if (state.latestVersion && compareVersions(state.latestVersion, currentVersion) > 0) {
      // Skip if this version was dismissed
      if (state.dismissed === state.latestVersion) {
        return null
      }
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion: state.latestVersion,
        updateCommand: `bun update -g ${PACKAGE_NAME}`,
      }
    }
    return null
  }
  
  // Fetch latest version (don't block on errors)
  const latestVersion = await fetchLatestVersion()
  
  // Update state
  state.lastCheck = now
  if (latestVersion) {
    state.latestVersion = latestVersion
  }
  saveUpdateState(state)
  
  // Check if update available
  if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
    // Skip if this version was dismissed
    if (state.dismissed === latestVersion) {
      return null
    }
    return {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      updateCommand: `bun update -g ${PACKAGE_NAME}`,
    }
  }
  
  return null
}

/**
 * Dismiss the update notification for the specified version
 */
export function dismissUpdate(version: string): void {
  const state = loadUpdateState()
  state.dismissed = version
  saveUpdateState(state)
}

/**
 * Force a fresh update check (ignores cache)
 */
export async function forceCheckForUpdates(): Promise<UpdateInfo | null> {
  const state = loadUpdateState()
  state.lastCheck = 0 // Reset check time
  saveUpdateState(state)
  return checkForUpdates()
}

export { getCurrentVersion }
