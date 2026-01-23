#!/usr/bin/env bun

/**
 * Magic Shell - Natural language to terminal commands
 * 
 * Usage:
 *   msh "list all files"           # Translate and print command
 *   msh -x "delete node_modules"   # Translate and execute
 *   msh -n "find large files"      # Dry run (show what would execute)
 *   msh -i                         # Interactive TUI mode
 *   msh --setup                    # Configure API keys
 *   msh --help                     # Show help
 */

import { spawn } from "child_process"
import { cwd as getCwd } from "process"
import {
  OPENCODE_ZEN_MODELS,
  OPENROUTER_MODELS,
  ALL_MODELS,
  type Model,
  type Provider,
} from "./lib/types"
import { loadConfig, saveConfig, getApiKey, setApiKey, loadHistory } from "./lib/config"
import { analyzeCommand } from "./lib/safety"
import { translateToCommand, getShellInfo } from "./lib/api"
import { getAnsiColors, getTheme, setTheme, themes, themeNames, loadTheme } from "./lib/theme"

// Load theme from config
loadTheme()

// Get ANSI colors from current theme
const getColors = () => {
  const t = getAnsiColors()
  return {
    ...t,
    // Aliases for compatibility
    red: t.error,
    green: t.success,
    yellow: t.warning,
    blue: t.primary,
    magenta: t.secondary,
    cyan: t.info,
    gray: t.textMuted,
  }
}

let colors = getColors()

function printHelp() {
  console.log(`
${colors.bold}${colors.primary}magic-shell${colors.reset} - Natural language to terminal commands

${colors.bold}USAGE${colors.reset}
  msh <query>              Translate query to command and print it
  msh -x <query>           Translate and execute the command
  msh -n <query>           Dry run - show command with safety analysis
  msh -i, --interactive    Launch interactive TUI mode
  msh --setup              Configure API keys and provider
  msh --models             List available models
  msh --model <id>         Set default model
  msh --provider <name>    Set provider (opencode-zen or openrouter)
  msh --themes             List available themes
  msh --theme <name>       Set color theme
  msh --help               Show this help

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}# Just get the command${colors.reset}
  msh "list all javascript files"
  
  ${colors.dim}# Execute directly${colors.reset}
  msh -x "show disk usage"
  
  ${colors.dim}# Check what would run${colors.reset}
  msh -n "delete all log files"
  
  ${colors.dim}# Pipe to clipboard (macOS)${colors.reset}
  msh "find large files" | pbcopy

${colors.bold}THEMES${colors.reset}
  opencode, tokyonight, catppuccin, gruvbox, nord, dracula, one-dark, matrix

${colors.bold}ENVIRONMENT${colors.reset}
  OPENCODE_ZEN_API_KEY     API key for OpenCode Zen
  OPENROUTER_API_KEY       API key for OpenRouter

${colors.bold}CONFIG${colors.reset}
  ~/.magic-shell/config.json
`)
}

function printModels() {
  const config = loadConfig()
  
  console.log(`\n${colors.bold}OpenCode Zen Models${colors.reset}`)
  console.log(`${colors.dim}(* = free, X = temporarily disabled)${colors.reset}\n`)
  
  for (const model of OPENCODE_ZEN_MODELS) {
    const isCurrent = config.provider === "opencode-zen" && config.defaultModel === model.id
    const marker = isCurrent ? colors.success + "→ " : "  "
    const free = model.free ? colors.success + " *" + colors.reset : ""
    const disabled = model.disabled ? colors.error + " X" + colors.reset : ""
    const category = colors.dim + `[${model.category}]` + colors.reset
    const name = model.disabled ? colors.dim + model.id + colors.reset : model.id
    console.log(`${marker}${name}${free}${disabled} ${category}`)
    if (model.disabled && model.disabledReason) {
      console.log(`    ${colors.error}${model.disabledReason}${colors.reset}`)
    } else {
      console.log(`    ${colors.dim}${model.description}${colors.reset}`)
    }
  }
  
  console.log(`\n${colors.bold}OpenRouter Models${colors.reset}\n`)
  
  for (const model of OPENROUTER_MODELS) {
    const isCurrent = config.provider === "openrouter" && config.defaultModel === model.id
    const marker = isCurrent ? colors.success + "→ " : "  "
    const free = model.free ? colors.success + " *" + colors.reset : ""
    const disabled = model.disabled ? colors.error + " X" + colors.reset : ""
    const category = colors.dim + `[${model.category}]` + colors.reset
    const name = model.disabled ? colors.dim + model.id + colors.reset : model.id
    console.log(`${marker}${name}${free}${disabled} ${category}`)
    if (model.disabled && model.disabledReason) {
      console.log(`    ${colors.error}${model.disabledReason}${colors.reset}`)
    } else {
      console.log(`    ${colors.dim}${model.description}${colors.reset}`)
    }
  }
  
  console.log()
}

/**
 * Validate API key format based on provider
 * Returns error message if invalid, null if valid
 */
function validateApiKey(key: string, provider: Provider): string | null {
  const trimmed = key.trim()
  
  if (trimmed.length === 0) {
    return "API key cannot be empty"
  }
  
  if (trimmed.length < 20) {
    return "API key seems too short (expected at least 20 characters)"
  }
  
  // Both providers use sk- prefix (OpenRouter uses sk-or-, OpenCode Zen uses sk-)
  if (!trimmed.startsWith("sk-")) {
    const providerName = provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
    return `${providerName} API keys typically start with 'sk-'`
  }
  
  // Check for common copy-paste errors
  if (trimmed.includes(" ")) {
    return "API key contains spaces - check for copy-paste errors"
  }
  
  if (trimmed.includes("\n") || trimmed.includes("\r")) {
    return "API key contains newlines - check for copy-paste errors"
  }
  
  return null
}

async function setup() {
  const readline = await import("readline")
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve)
    })
  }

  console.log(`\n${colors.bold}${colors.cyan}Magic Shell Setup${colors.reset}\n`)

  // Provider selection
  console.log("Select provider:")
  console.log("  1. OpenCode Zen (recommended, has free models)")
  console.log("  2. OpenRouter")
  
  const providerChoice = await question("\nChoice [1]: ")
  const provider: Provider = providerChoice === "2" ? "openrouter" : "opencode-zen"

  // API key
  const existingKey = await getApiKey(provider)
  if (existingKey) {
    const useExisting = await question(`\nAPI key already configured. Keep it? [Y/n]: `)
    if (useExisting.toLowerCase() !== "n") {
      console.log(`${colors.green}✓ Using existing API key${colors.reset}`)
    } else {
      const url = provider === "opencode-zen" 
        ? "https://opencode.ai/auth" 
        : "https://openrouter.ai/keys"
      console.log(`\nGet your API key from: ${colors.cyan}${url}${colors.reset}`)
      
      let validKey = false
      while (!validKey) {
        const newKey = await question("Enter API key: ")
        if (!newKey.trim()) {
          console.log(`${colors.yellow}Keeping existing API key${colors.reset}`)
          break
        }
        
        const validationError = validateApiKey(newKey, provider)
        if (validationError) {
          console.log(`${colors.yellow}Warning: ${validationError}${colors.reset}`)
          const proceed = await question("Continue anyway? [y/N]: ")
          if (proceed.toLowerCase() !== "y") {
            continue
          }
        }
        
        await setApiKey(provider, newKey.trim())
        console.log(`${colors.green}✓ API key saved${colors.reset}`)
        validKey = true
      }
    }
  } else {
    const url = provider === "opencode-zen" 
      ? "https://opencode.ai/auth" 
      : "https://openrouter.ai/keys"
    console.log(`\nGet your API key from: ${colors.cyan}${url}${colors.reset}`)
    
    let validKey = false
    while (!validKey) {
      const newKey = await question("Enter API key: ")
      if (!newKey.trim()) {
        console.log(`${colors.red}No API key provided. Exiting.${colors.reset}`)
        rl.close()
        process.exit(1)
      }
      
      const validationError = validateApiKey(newKey, provider)
      if (validationError) {
        console.log(`${colors.yellow}Warning: ${validationError}${colors.reset}`)
        const proceed = await question("Continue anyway? [y/N]: ")
        if (proceed.toLowerCase() !== "y") {
          continue
        }
      }
      
      await setApiKey(provider, newKey.trim())
      console.log(`${colors.green}✓ API key saved${colors.reset}`)
      validKey = true
    }
  }

  // Model selection
  const models = provider === "opencode-zen" ? OPENCODE_ZEN_MODELS : OPENROUTER_MODELS
  const freeModels = models.filter(m => m.free)
  
  console.log("\nRecommended models:")
  const displayModels = freeModels.length > 0 ? freeModels.slice(0, 5) : models.slice(0, 5)
  displayModels.forEach((m, i) => {
    const free = m.free ? colors.green + " (free)" + colors.reset : ""
    console.log(`  ${i + 1}. ${m.name}${free} - ${m.description}`)
  })
  
  const modelChoice = await question(`\nChoice [1]: `)
  const modelIndex = parseInt(modelChoice || "1") - 1
  const selectedModel = displayModels[modelIndex] || displayModels[0]
  
  const config = loadConfig()
  config.provider = provider
  config.defaultModel = selectedModel.id
  saveConfig(config)
  
  console.log(`\n${colors.green}✓ Setup complete!${colors.reset}`)
  console.log(`  Provider: ${provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"}`)
  console.log(`  Model: ${selectedModel.name}`)
  console.log(`\nTry: ${colors.cyan}msh "list all files"${colors.reset}\n`)
  
  rl.close()
}

function executeCommand(command: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd: getCwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (data) => {
      const text = data.toString()
      stdout += text
      process.stdout.write(text)
    })

    child.stderr?.on("data", (data) => {
      const text = data.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on("error", (error) => {
      resolve({ code: 1, output: error.message })
    })

    child.on("close", (code) => {
      resolve({ code: code ?? 0, output: stdout || stderr })
    })
  })
}

async function translate(query: string, options: { execute?: boolean; dryRun?: boolean }) {
  const config = loadConfig()
  const apiKey = await getApiKey(config.provider)
  
  if (!apiKey) {
    console.error(`${colors.red}Error: No API key configured.${colors.reset}`)
    console.error(`Run: ${colors.cyan}msh --setup${colors.reset}`)
    process.exit(1)
  }

  // Find current model
  const model = ALL_MODELS.find(m => m.id === config.defaultModel) 
    || (config.provider === "opencode-zen" ? OPENCODE_ZEN_MODELS[0] : OPENROUTER_MODELS[0])

  const history = loadHistory()
  const cwd = getCwd()

  try {
    const command = await translateToCommand(apiKey, model, query, cwd, history)
    
    if (options.dryRun) {
      // Dry run - show command and safety analysis
      const safety = analyzeCommand(command, config)
      
      console.log(`${colors.dim}Query:${colors.reset} ${query}`)
      console.log(`${colors.dim}Model:${colors.reset} ${model.name}`)
      console.log()
      console.log(`${colors.bold}Command:${colors.reset} ${command}`)
      
      if (safety.isDangerous) {
        const severityColor = safety.severity === "critical" ? colors.red 
          : safety.severity === "high" ? colors.red
          : safety.severity === "medium" ? colors.yellow 
          : colors.gray
        console.log()
        console.log(`${severityColor}[${safety.severity.toUpperCase()}]${colors.reset} ${safety.reason}`)
      } else {
        console.log(`${colors.green}✓ Command appears safe${colors.reset}`)
      }
    } else if (options.execute) {
      // Execute mode
      const safety = analyzeCommand(command, config)
      
      if (safety.isDangerous && safety.severity !== "low") {
        console.error(`${colors.dim}Command:${colors.reset} ${command}`)
        const severityColor = safety.severity === "critical" ? colors.red 
          : safety.severity === "high" ? colors.red
          : colors.yellow
        console.error(`${severityColor}[${safety.severity.toUpperCase()}]${colors.reset} ${safety.reason}`)
        console.error(`${colors.yellow}Use -n to preview, or run the command manually.${colors.reset}`)
        process.exit(1)
      }
      
      const result = await executeCommand(command)
      process.exit(result.code)
    } else {
      // Default - just output the command (can be piped)
      console.log(command)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`${colors.red}Error: ${message}${colors.reset}`)
    process.exit(1)
  }
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args[0] === "-i" || args[0] === "--interactive") {
    // Launch interactive TUI
    const { default: runTui } = await import("./cli")
    await runTui()
    return
  }
  
  if (args[0] === "--help" || args[0] === "-h") {
    printHelp()
    return
  }
  
  if (args[0] === "--setup") {
    await setup()
    return
  }
  
  if (args[0] === "--models") {
    printModels()
    return
  }
  
  if (args[0] === "--model" && args[1]) {
    const modelId = args[1]
    const model = ALL_MODELS.find(m => m.id === modelId)
    if (!model) {
      console.error(`${colors.error}Unknown model: ${modelId}${colors.reset}`)
      console.error(`Run ${colors.primary}msh --models${colors.reset} to see available models.`)
      process.exit(1)
    }
    if (model.disabled) {
      console.error(`${colors.error}Model ${model.name} is temporarily disabled: ${model.disabledReason}${colors.reset}`)
      console.error(`Run ${colors.primary}msh --models${colors.reset} to see available models.`)
      process.exit(1)
    }
    const config = loadConfig()
    config.defaultModel = modelId
    config.provider = model.provider
    saveConfig(config)
    console.log(`${colors.success}✓ Default model set to ${model.name}${colors.reset}`)
    return
  }
  
  if (args[0] === "--provider" && args[1]) {
    const provider = args[1] as Provider
    if (provider !== "opencode-zen" && provider !== "openrouter") {
      console.error(`${colors.error}Unknown provider: ${provider}${colors.reset}`)
      console.error(`Valid providers: opencode-zen, openrouter`)
      process.exit(1)
    }
    const config = loadConfig()
    config.provider = provider
    // Reset to first non-disabled model of new provider
    const models = provider === "opencode-zen" ? OPENCODE_ZEN_MODELS : OPENROUTER_MODELS
    const firstAvailable = models.find(m => !m.disabled) || models[0]
    config.defaultModel = firstAvailable.id
    saveConfig(config)
    console.log(`${colors.success}✓ Provider set to ${provider}${colors.reset}`)
    return
  }
  
  if (args[0] === "--themes") {
    const currentTheme = getTheme()
    console.log(`\n${colors.bold}Available Themes${colors.reset}\n`)
    for (const name of themeNames) {
      const theme = themes[name]
      const isCurrent = name === currentTheme.name
      const marker = isCurrent ? colors.success + "→ " + colors.reset : "  "
      console.log(`${marker}${name}`)
    }
    console.log()
    return
  }
  
  if (args[0] === "--theme" && args[1]) {
    const themeName = args[1]
    if (!themes[themeName]) {
      console.error(`${colors.error}Unknown theme: ${themeName}${colors.reset}`)
      console.error(`Available themes: ${themeNames.join(", ")}`)
      process.exit(1)
    }
    setTheme(themeName)
    colors = getColors() // Refresh colors
    console.log(`${colors.success}✓ Theme set to ${themeName}${colors.reset}`)
    return
  }
  
  // Parse flags and query
  let execute = false
  let dryRun = false
  let queryParts: string[] = []
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "-x" || arg === "--execute") {
      execute = true
    } else if (arg === "-n" || arg === "--dry-run") {
      dryRun = true
    } else if (!arg.startsWith("-")) {
      queryParts.push(arg)
    }
  }
  
  const query = queryParts.join(" ")
  
  if (!query) {
    console.error(`${colors.red}Error: No query provided${colors.reset}`)
    console.error(`Usage: msh "your query here"`)
    process.exit(1)
  }
  
  await translate(query, { execute, dryRun })
}

main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`)
  process.exit(1)
})
