#!/usr/bin/env bun

import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
  type StyledText,
  t,
  fg,
  bold,
} from "@opentui/core"
import { spawn } from "child_process"
import { cwd as getCwd } from "process"

import {
  ALL_MODELS,
  OPENCODE_ZEN_MODELS,
  OPENROUTER_MODELS,
  type Model,
  type CommandHistory,
  type Config,
  type Provider,
} from "./lib/types"
import { loadConfig, saveConfig, getApiKey, setApiKey, loadHistory, addToHistory } from "./lib/config"
import { analyzeCommand, getSeverityColor } from "./lib/safety"
import { translateToCommand, getShellInfo } from "./lib/api"
import { getTheme, setTheme, themes, themeNames, loadTheme } from "./lib/theme"

// Global state
let renderer: CliRenderer
let currentModel: Model = OPENCODE_ZEN_MODELS[0] // Default to free GPT 5 Nano
let config: Config
let history: CommandHistory[] = []
let currentCwd = getCwd()
let dryRunMode = false

// UI Elements
let mainContainer: BoxRenderable
let headerText: TextRenderable
let cwdText: TextRenderable
let modelText: TextRenderable
let inputField: InputRenderable
let outputContainer: BoxRenderable
let outputText: TextRenderable
let statusText: TextRenderable
let commandPreview: TextRenderable
let safetyWarning: TextRenderable
let confirmPrompt: BoxRenderable
let modelSelector: SelectRenderable | null = null
let providerSelector: SelectRenderable | null = null

// Pending command state
let pendingCommand: string | null = null
let awaitingConfirmation = false

async function main() {
  config = loadConfig()
  history = loadHistory()
  dryRunMode = config.dryRunByDefault
  loadTheme() // Load theme from config

  // Set current model from config
  const savedModel = ALL_MODELS.find((m) => m.id === config.defaultModel)
  if (savedModel) {
    currentModel = savedModel
  }

  renderer = await createCliRenderer({
    exitOnCtrlC: false,
  })

  // Use theme background color
  const theme = getTheme()
  renderer.setBackgroundColor(theme.colors.background)

  // Check for API key for current provider
  const apiKey = await getApiKey(config.provider)
  if (!apiKey) {
    await showProviderSetup()
  } else {
    createMainUI()
  }
}

async function showProviderSetup() {
  const container = new BoxRenderable(renderer, {
    id: "setup-container",
    flexDirection: "column",
    padding: 2,
    width: "100%",
    height: "100%",
  })
  renderer.root.add(container)

  const title = new TextRenderable(renderer, {
    id: "setup-title",
    content: t`${bold(fg("#60a5fa")("Magic Shell Setup"))}`,
    marginBottom: 1,
  })
  container.add(title)

  const subtitle = new TextRenderable(renderer, {
    id: "setup-subtitle",
    content: t`${fg("#94a3b8")("Choose your AI provider:")}`,
    marginBottom: 1,
  })
  container.add(subtitle)

  const options: SelectOption[] = [
    {
      name: "OpenCode Zen (Recommended)",
      description: "Curated models optimized for coding. Has free models!",
      value: "opencode-zen",
    },
    {
      name: "OpenRouter",
      description: "Access to many models from various providers",
      value: "openrouter",
    },
  ]

  providerSelector = new SelectRenderable(renderer, {
    id: "provider-select",
    width: 60,
    height: 6,
    options,
    backgroundColor: "#1e293b",
    focusedBackgroundColor: "#1e293b",
    selectedBackgroundColor: "#334155",
    textColor: "#e2e8f0",
    selectedTextColor: "#60a5fa",
    descriptionColor: "#64748b",
    selectedDescriptionColor: "#94a3b8",
    showDescription: true,
    wrapSelection: true,
  })
  container.add(providerSelector)

  providerSelector.on(SelectRenderableEvents.ITEM_SELECTED, async (_: number, option: SelectOption) => {
    const provider = option.value as Provider
    config.provider = provider
    saveConfig(config)

    renderer.root.remove("setup-container")
    providerSelector = null

    await showApiKeyInput(provider)
  })

  const hint = new TextRenderable(renderer, {
    id: "setup-hint",
    content: t`
${fg("#64748b")("Use arrow keys to select | Enter to confirm | Ctrl+C to exit")}`,
    marginTop: 1,
  })
  container.add(hint)

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy()
      process.exit(0)
    }
  })

  providerSelector.focus()
}

async function showApiKeyInput(provider: Provider) {
  const container = new BoxRenderable(renderer, {
    id: "apikey-container",
    flexDirection: "column",
    padding: 2,
    width: "100%",
    height: "100%",
  })
  renderer.root.add(container)

  const title = new TextRenderable(renderer, {
    id: "apikey-title",
    content: t`${bold(fg("#60a5fa")(`${provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"} Setup`))}`,
    marginBottom: 1,
  })
  container.add(title)

  const url = provider === "opencode-zen" ? "https://opencode.ai/auth" : "https://openrouter.ai/keys"
  const instructions = new TextRenderable(renderer, {
    id: "apikey-instructions",
    content: t`Get your API key from: ${fg("#22c55e")(url)}

Enter your API key below:`,
    marginBottom: 1,
  })
  container.add(instructions)

  const input = new InputRenderable(renderer, {
    id: "api-key-input",
    width: 70,
    height: 1,
    placeholder: provider === "opencode-zen" ? "zen_..." : "sk-or-v1-...",
    backgroundColor: "#1e293b",
    focusedBackgroundColor: "#334155",
    textColor: "#f8fafc",
    // Enable paste support
    onPaste: (event) => {
      input.insertText(event.text)
    },
    cursorColor: "#60a5fa",
  })
  container.add(input)

  if (provider === "opencode-zen") {
    const freeNote = new TextRenderable(renderer, {
      id: "free-note",
      content: t`
${fg("#22c55e")("Tip:")} OpenCode Zen has free models like GPT 5 Nano and Grok Code!`,
      marginTop: 1,
    })
    container.add(freeNote)
  }

  const hint = new TextRenderable(renderer, {
    id: "apikey-hint",
    content: t`
${fg("#64748b")("Press Enter to save | Ctrl+C to exit")}`,
    marginTop: 1,
  })
  container.add(hint)

  input.on(InputRenderableEvents.ENTER, (value: string) => {
    if (value.trim()) {
      setApiKey(provider, value.trim())

      // Set default model based on provider
      if (provider === "opencode-zen") {
        currentModel = OPENCODE_ZEN_MODELS.find((m) => m.id === "gpt-5-nano") || OPENCODE_ZEN_MODELS[0]
      } else {
        currentModel = OPENROUTER_MODELS[0]
      }
      config.defaultModel = currentModel.id
      saveConfig(config)

      renderer.root.remove("apikey-container")
      createMainUI()
    }
  })

  input.focus()
}

function createMainUI() {
  const theme = getTheme()
  
  // Main container
  mainContainer = new BoxRenderable(renderer, {
    id: "main-container",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
  })
  renderer.root.add(mainContainer)

  // Header row
  const headerRow = new BoxRenderable(renderer, {
    id: "header-row",
    flexDirection: "row",
    width: "100%",
    marginBottom: 1,
  })
  mainContainer.add(headerRow)

  headerText = new TextRenderable(renderer, {
    id: "header-text",
    content: t`${bold(fg(theme.colors.primary)("magic-shell"))} ${fg(theme.colors.textMuted)("- natural language to terminal commands")}`,
    flexGrow: 1,
  })
  headerRow.add(headerText)

  // Status indicators
  const statusRow = new BoxRenderable(renderer, {
    id: "status-row",
    flexDirection: "row",
    width: "100%",
    marginBottom: 1,
  })
  mainContainer.add(statusRow)

  cwdText = new TextRenderable(renderer, {
    id: "cwd-text",
    content: t`${fg(theme.colors.textMuted)("cwd:")} ${fg(theme.colors.success)(currentCwd)}`,
    flexGrow: 1,
  })
  statusRow.add(cwdText)

  modelText = new TextRenderable(renderer, {
    id: "model-text",
    content: getModelDisplay(),
  })
  statusRow.add(modelText)

  // Input area
  const inputRow = new BoxRenderable(renderer, {
    id: "input-row",
    flexDirection: "row",
    width: "100%",
    marginBottom: 1,
  })
  mainContainer.add(inputRow)

  const promptText = new TextRenderable(renderer, {
    id: "prompt-text",
    content: t`${fg(theme.colors.success)(">")} `,
    width: 2,
  })
  inputRow.add(promptText)

  inputField = new InputRenderable(renderer, {
    id: "input-field",
    flexGrow: 1,
    height: 1,
    placeholder: "describe what you want to do...",
    backgroundColor: "transparent",
    focusedBackgroundColor: theme.colors.backgroundPanel,
    textColor: theme.colors.text,
    placeholderColor: theme.colors.textMuted,
    cursorColor: theme.colors.primary,
    // Enable paste support
    onPaste: (event) => {
      inputField.insertText(event.text)
    },
  })
  inputRow.add(inputField)

  // Command preview
  commandPreview = new TextRenderable(renderer, {
    id: "command-preview",
    content: "",
    marginBottom: 1,
  })
  mainContainer.add(commandPreview)

  // Safety warning
  safetyWarning = new TextRenderable(renderer, {
    id: "safety-warning",
    content: "",
  })
  mainContainer.add(safetyWarning)

  // Confirmation prompt (hidden by default)
  confirmPrompt = new BoxRenderable(renderer, {
    id: "confirm-prompt",
    flexDirection: "row",
    visible: false,
    marginBottom: 1,
  })
  mainContainer.add(confirmPrompt)

  const confirmText = new TextRenderable(renderer, {
    id: "confirm-text",
    content: t`${fg(theme.colors.warning)("[Enter] Execute")} ${fg(theme.colors.textMuted)("|")} ${fg(theme.colors.error)("[Esc] Cancel")} ${fg(theme.colors.textMuted)("|")} ${fg(theme.colors.primary)("[e] Edit")}`,
  })
  confirmPrompt.add(confirmText)

  // Output area
  outputContainer = new BoxRenderable(renderer, {
    id: "output-container",
    flexGrow: 1,
    border: true,
    borderColor: theme.colors.border,
    borderStyle: "single",
    title: "Output",
    padding: 1,
  })
  mainContainer.add(outputContainer)

  const providerName = config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
  const freeModelsNote = config.provider === "opencode-zen" ? `\n${fg(theme.colors.success)("Free models available!")} Try: grok-code, glm-4.7-free` : ""

  outputText = new TextRenderable(renderer, {
    id: "output-text",
    content: t`${fg(theme.colors.textMuted)(`Ready. Using ${providerName}.`)}${freeModelsNote}

${fg(theme.colors.textMuted)("Type what you want to do, or press")} ${fg(theme.colors.primary)("Ctrl+X P")} ${fg(theme.colors.textMuted)("for command palette.")}`,
  })
  outputContainer.add(outputText)

  // Status bar
  statusText = new TextRenderable(renderer, {
    id: "status-text",
    content: getDryRunStatus(),
    marginTop: 1,
  })
  mainContainer.add(statusText)

  // Event handlers
  inputField.on(InputRenderableEvents.ENTER, handleInput)

  renderer.keyInput.on("keypress", handleKeypress)

  inputField.focus()
}

function getModelDisplay(): StyledText {
  const theme = getTheme()
  const categoryColor =
    currentModel.category === "fast"
      ? theme.colors.success
      : currentModel.category === "smart"
        ? theme.colors.primary
        : theme.colors.secondary
  const providerBadge = currentModel.provider === "opencode-zen" ? fg(theme.colors.accent)("[zen]") : fg(theme.colors.warning)("[or]")
  const freeBadge = currentModel.free ? fg(theme.colors.success)(" FREE") : ""
  return t`${providerBadge} ${fg(categoryColor)(currentModel.name)}${freeBadge}`
}

function getDryRunStatus(): StyledText {
  const theme = getTheme()
  if (dryRunMode) {
    return t`${fg(theme.colors.warning)("[DRY RUN]")} ${fg(theme.colors.textMuted)("Ctrl+X P palette | Ctrl+X M model | Ctrl+X D dry-run")}`
  }
  return t`${fg(theme.colors.textMuted)("Ctrl+X P palette | Ctrl+X M model | Ctrl+X ? help")}`
}

// Refresh all UI elements with current theme colors
function refreshThemeColors() {
  const theme = getTheme()
  
  // Update renderer background
  renderer.setBackgroundColor(theme.colors.background)
  
  // Update header
  if (headerText) {
    headerText.content = t`${bold(fg(theme.colors.primary)("magic-shell"))} ${fg(theme.colors.textMuted)("- natural language to terminal commands")}`
  }
  
  // Update cwd display
  if (cwdText) {
    cwdText.content = t`${fg(theme.colors.textMuted)("cwd:")} ${fg(theme.colors.success)(currentCwd)}`
  }
  
  // Update model display
  if (modelText) {
    modelText.content = getModelDisplay()
  }
  
  // Update status bar
  if (statusText) {
    statusText.content = getDryRunStatus()
  }
  
  // Update output container border
  if (outputContainer) {
    outputContainer.borderColor = theme.colors.border
  }
  
  // Update input field colors
  if (inputField) {
    inputField.focusedBackgroundColor = theme.colors.backgroundPanel
    inputField.textColor = theme.colors.text
    inputField.placeholderColor = theme.colors.textMuted
    inputField.cursorColor = theme.colors.primary
  }
  
  // Update the welcome message
  const providerName = config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
  const freeModelsNote = config.provider === "opencode-zen" ? `\n${fg(theme.colors.success)("Free models available!")} Try: grok-code, glm-4.7-free` : ""
  
  if (outputText) {
    outputText.content = t`${fg(theme.colors.textMuted)(`Ready. Using ${providerName}.`)}${freeModelsNote}

${fg(theme.colors.textMuted)("Type what you want to do, or press")} ${fg(theme.colors.primary)("Ctrl+X P")} ${fg(theme.colors.textMuted)("for command palette.")}`
  }
}

async function handleInput(value: string) {
  const input = value.trim()
  if (!input) return

  inputField.value = ""

  // Handle special commands
  if (input.startsWith("!")) {
    await handleSpecialCommand(input)
    return
  }

  // Check if it looks like a direct shell command
  if (isDirectCommand(input)) {
    await processCommand(input, input)
    return
  }

  // Translate natural language to command
  await translateAndProcess(input)
}

function isDirectCommand(input: string): boolean {
  const directCommands = [
    "ls",
    "pwd",
    "cd",
    "cat",
    "echo",
    "mkdir",
    "touch",
    "rm",
    "cp",
    "mv",
    "git",
    "npm",
    "bun",
    "node",
    "python",
    "pip",
    "brew",
    "apt",
    "docker",
    "kubectl",
  ]
  const firstWord = input.split(/\s+/)[0].toLowerCase()
  return (
    directCommands.includes(firstWord) ||
    input.startsWith("./") ||
    input.startsWith("/") ||
    input.startsWith("~")
  )
}

async function translateAndProcess(input: string) {
  const apiKey = await getApiKey(config.provider)
  if (!apiKey) {
    setOutput(t`${fg("#ef4444")("Error: No API key configured. Run !provider to set up.")}`)
    return
  }

  setOutput(t`${fg("#64748b")("Translating...")}`)

  try {
    const command = await translateToCommand(apiKey, currentModel, input, currentCwd, history)

    commandPreview.content = t`${fg("#64748b")("Command:")} ${fg("#f8fafc")(command)}`

    // Analyze safety
    const safety = analyzeCommand(command, config)

    if (safety.isDangerous) {
      safetyWarning.content = t`${fg(getSeverityColor(safety.severity))(`[${safety.severity.toUpperCase()}] ${safety.reason}`)}`
      pendingCommand = command
      awaitingConfirmation = true
      confirmPrompt.visible = true
      setOutput(t`${fg("#fbbf24")("Command requires confirmation. Press Enter to execute or Esc to cancel.")}`)
    } else {
      safetyWarning.content = ""
      await processCommand(input, command)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setOutput(t`${fg("#ef4444")(`Error: ${message}`)}`)
  }
}

async function processCommand(input: string, command: string) {
  // Handle cd specially
  if (command.startsWith("cd ")) {
    const path = command.slice(3).trim().replace(/^["']|["']$/g, "")
    try {
      const expandedPath = path.startsWith("~") ? path.replace("~", process.env.HOME || "") : path
      process.chdir(expandedPath)
      currentCwd = getCwd()
      cwdText.content = t`${fg("#64748b")("cwd:")} ${fg("#22c55e")(currentCwd)}`
      setOutput(t`${fg("#22c55e")(`Changed directory to ${currentCwd}`)}`)

      addToHistory({
        input,
        command,
        output: `Changed to ${currentCwd}`,
        timestamp: Date.now(),
      })
      history = loadHistory()
    } catch (err) {
      setOutput(t`${fg("#ef4444")(`cd: ${err instanceof Error ? err.message : String(err)}`)}`)
    }
    clearCommandState()
    return
  }

  if (dryRunMode) {
    setOutput(t`${fg("#fbbf24")("[DRY RUN]")} Would execute: ${fg("#f8fafc")(command)}`)
    clearCommandState()
    return
  }

  // Execute command
  setOutput(t`${fg("#64748b")("Executing...")}`)

  try {
    const result = await executeCommand(command)
    setOutput(result || t`${fg("#22c55e")("Command completed successfully")}`)

    addToHistory({
      input,
      command,
      output: result.slice(0, 500),
      timestamp: Date.now(),
    })
    history = loadHistory()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setOutput(t`${fg("#ef4444")(`Error: ${message}`)}`)
  }

  clearCommandState()
}

function executeCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: currentCwd,
      env: process.env,
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (data) => {
      stdout += data.toString()
    })

    child.stderr?.on("data", (data) => {
      stderr += data.toString()
    })

    child.on("error", (error) => {
      reject(error)
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || stderr)
      } else {
        resolve(stderr || stdout || `Command exited with code ${code}`)
      }
    })
  })
}

function clearCommandState() {
  pendingCommand = null
  awaitingConfirmation = false
  confirmPrompt.visible = false
  commandPreview.content = ""
  safetyWarning.content = ""
}

function setOutput(content: string | StyledText) {
  outputText.content = content
}

async function handleSpecialCommand(input: string) {
  const cmd = input.slice(1).toLowerCase().trim()

  switch (cmd.split(/\s+/)[0]) {
    case "help":
      showHelp()
      break
    case "model":
      showModelSelector()
      break
    case "provider":
      await switchProvider()
      break
    case "dry":
      dryRunMode = !dryRunMode
      statusText.content = getDryRunStatus()
      setOutput(t`${fg("#22c55e")(`Dry-run mode: ${dryRunMode ? "ON" : "OFF"}`)}`)
      break
    case "config":
      await showConfig()
      break
    case "history":
      showHistory()
      break
    case "clear":
      setOutput("")
      break
    default:
      // Try to execute as shell command
      if (cmd) {
        await processCommand(input, cmd)
      }
  }
}

function showHelp() {
  const theme = getTheme()
  setOutput(t`${bold(fg(theme.colors.primary)("Magic Shell"))}

${bold(fg(theme.colors.textMuted)("Keyboard Shortcuts (Ctrl+X then...):"))}
${fg(theme.colors.primary)("P")}  ${fg(theme.colors.textMuted)("Command palette")}    ${fg(theme.colors.primary)("M")}  ${fg(theme.colors.textMuted)("Change model")}
${fg(theme.colors.primary)("S")}  ${fg(theme.colors.textMuted)("Switch provider")}    ${fg(theme.colors.primary)("D")}  ${fg(theme.colors.textMuted)("Toggle dry-run")}
${fg(theme.colors.primary)("T")}  ${fg(theme.colors.textMuted)("Change theme")}       ${fg(theme.colors.primary)("H")}  ${fg(theme.colors.textMuted)("Show history")}
${fg(theme.colors.primary)("C")}  ${fg(theme.colors.textMuted)("Show config")}        ${fg(theme.colors.primary)("L")}  ${fg(theme.colors.textMuted)("Clear output")}
${fg(theme.colors.primary)("?")}  ${fg(theme.colors.textMuted)("This help")}          ${fg(theme.colors.primary)("Q")}  ${fg(theme.colors.textMuted)("Exit")}

${bold(fg(theme.colors.textMuted)("Other:"))}
${fg(theme.colors.primary)("Ctrl+C")}  ${fg(theme.colors.textMuted)("Exit / Cancel")}     ${fg(theme.colors.primary)("Esc")}  ${fg(theme.colors.textMuted)("Close palette")}

${bold(fg(theme.colors.textMuted)("Tips:"))}
- Type naturally: "list all files" -> ls -la
- Reference history: "do that again", "undo"
- ${fg(theme.colors.success)("Free models:")} gpt-5-nano, grok-code, glm-4.7-free`)
}

async function showConfig() {
  const theme = getTheme()
  const providerName = config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
  const apiKey = await getApiKey(config.provider)
  const apiKeyStatus = apiKey ? fg(theme.colors.success)("configured") : fg(theme.colors.error)("not set")
  const freeBadge = currentModel.free ? fg(theme.colors.success)(" (FREE)") : ""
  const shellInfo = getShellInfo()

  setOutput(t`${bold(fg(theme.colors.primary)("Current Configuration"))}

${fg(theme.colors.textMuted)("Provider:")}     ${fg(theme.colors.text)(providerName)}
${fg(theme.colors.textMuted)("Model:")}        ${fg(theme.colors.text)(currentModel.name)}${freeBadge}
${fg(theme.colors.textMuted)("Model ID:")}     ${fg(theme.colors.textMuted)(currentModel.id)}
${fg(theme.colors.textMuted)("Category:")}     ${fg(theme.colors.text)(currentModel.category)}
${fg(theme.colors.textMuted)("Theme:")}        ${fg(theme.colors.text)(theme.name)}
${fg(theme.colors.textMuted)("Shell:")}        ${fg(theme.colors.text)(shellInfo.shell)} ${fg(theme.colors.textMuted)(`(${shellInfo.shellPath})`)}
${fg(theme.colors.textMuted)("Platform:")}     ${fg(theme.colors.text)(shellInfo.platform)}${shellInfo.isWSL ? fg(theme.colors.textMuted)(" (WSL)") : ""}
${fg(theme.colors.textMuted)("Safety:")}       ${fg(theme.colors.text)(config.safetyLevel)}
${fg(theme.colors.textMuted)("Dry-run:")}      ${fg(theme.colors.text)(dryRunMode ? "ON" : "OFF")}
${fg(theme.colors.textMuted)("API Key:")}      ${apiKeyStatus}
${fg(theme.colors.textMuted)("History:")}      ${fg(theme.colors.text)(`${history.length} commands`)}`)
}

function showHistory() {
  if (history.length === 0) {
    setOutput(t`${fg("#64748b")("No command history yet.")}`)
    return
  }

  const recent = history.slice(-10)
  const lines = recent.map((entry, i) => {
    const date = new Date(entry.timestamp).toLocaleTimeString()
    return t`${fg("#64748b")(`${i + 1}.`)} ${fg("#94a3b8")(`[${date}]`)} ${fg("#f8fafc")(entry.command)}`
  })

  setOutput(t`${bold(fg("#60a5fa")("Recent Command History"))}

${lines.join("\n")}`)
}

async function switchProvider() {
  // Show provider selector as a popup overlay (like model selector)
  const container = new BoxRenderable(renderer, {
    id: "provider-selector-container",
    position: "absolute",
    left: 2,
    top: 4,
    width: 65,
    height: 12,
    backgroundColor: "#1e293b",
    border: true,
    borderColor: "#60a5fa",
    borderStyle: "single",
    title: "Switch Provider",
    titleAlignment: "center",
    zIndex: 100,
    padding: 1,
  })
  renderer.root.add(container)

  // Check which providers have API keys configured
  const zenKey = await getApiKey("opencode-zen")
  const orKey = await getApiKey("openrouter")

  const options: SelectOption[] = [
    {
      name: `OpenCode Zen${zenKey ? " (configured)" : ""}`,
      description: "Curated models optimized for coding. Has free models!",
      value: "opencode-zen",
    },
    {
      name: `OpenRouter${orKey ? " (configured)" : ""}`,
      description: "Access to many models from various providers",
      value: "openrouter",
    },
  ]

  const selector = new SelectRenderable(renderer, {
    id: "provider-switch-select",
    width: "100%",
    height: 6,
    options,
    backgroundColor: "transparent",
    focusedBackgroundColor: "transparent",
    selectedBackgroundColor: "#334155",
    textColor: "#e2e8f0",
    selectedTextColor: "#60a5fa",
    descriptionColor: "#64748b",
    selectedDescriptionColor: "#94a3b8",
    showDescription: true,
    wrapSelection: true,
  })
  container.add(selector)

  const closeSelector = () => {
    renderer.root.remove("provider-selector-container")
    inputField.focus()
  }

  selector.on(SelectRenderableEvents.ITEM_SELECTED, async (_: number, option: SelectOption) => {
    const newProvider = option.value as Provider
    const existingKey = await getApiKey(newProvider)

    if (existingKey) {
      // Already have a key, just switch
      config.provider = newProvider
      // Set default model for new provider
      const models = newProvider === "opencode-zen" ? OPENCODE_ZEN_MODELS : OPENROUTER_MODELS
      currentModel = models.find((m) => m.id === config.defaultModel) || models[0]
      config.defaultModel = currentModel.id
      saveConfig(config)

      modelText.content = getModelDisplay()
      closeSelector()

      const providerName = newProvider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
      setOutput(t`${fg("#22c55e")(`Switched to ${providerName}. Model: ${currentModel.name}`)}`)
    } else {
      // Need to set up API key - go to full setup
      closeSelector()
      renderer.root.remove("main-container")
      await showApiKeyInput(newProvider)
    }
  })

  // Handle escape to close
  const escHandler = (key: KeyEvent) => {
    if (key.name === "escape") {
      closeSelector()
      renderer.keyInput.off("keypress", escHandler)
    }
  }
  renderer.keyInput.on("keypress", escHandler)

  selector.focus()
}

function showModelSelector() {
  if (modelSelector) {
    renderer.root.remove("model-selector-container")
    modelSelector = null
  }

  const container = new BoxRenderable(renderer, {
    id: "model-selector-container",
    position: "absolute",
    left: 2,
    top: 4,
    width: 75,
    height: 22,
    backgroundColor: "#1e293b",
    border: true,
    borderColor: "#60a5fa",
    borderStyle: "single",
    title: `Select Model (${config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"})`,
    titleAlignment: "center",
    zIndex: 100,
    padding: 1,
  })
  renderer.root.add(container)

  // Filter models by current provider, exclude disabled models
  const allModels = config.provider === "opencode-zen" ? OPENCODE_ZEN_MODELS : OPENROUTER_MODELS
  const availableModels = allModels.filter(m => !m.disabled)

  const options: SelectOption[] = availableModels.map((model) => ({
    name: `${model.name} [${model.category}]${model.free ? " FREE" : ""}`,
    description: model.description,
    value: model,
  }))

  modelSelector = new SelectRenderable(renderer, {
    id: "model-select",
    width: "100%",
    height: 18,
    options,
    backgroundColor: "transparent",
    focusedBackgroundColor: "transparent",
    selectedBackgroundColor: "#334155",
    textColor: "#e2e8f0",
    selectedTextColor: "#60a5fa",
    descriptionColor: "#64748b",
    selectedDescriptionColor: "#94a3b8",
    showDescription: true,
    showScrollIndicator: true,
    wrapSelection: true,
  })
  container.add(modelSelector)

  modelSelector.on(SelectRenderableEvents.ITEM_SELECTED, (_: number, option: SelectOption) => {
    currentModel = option.value as Model
    config.defaultModel = currentModel.id
    saveConfig(config)
    modelText.content = getModelDisplay()

    renderer.root.remove("model-selector-container")
    modelSelector = null
    inputField.focus()

    const freeBadge = currentModel.free ? " (FREE)" : ""
    setOutput(t`${fg("#22c55e")(`Model changed to ${currentModel.name}${freeBadge}`)}`)
  })

  modelSelector.focus()
}

// Theme selector
let themeSelector: SelectRenderable | null = null

function showThemeSelector() {
  if (themeSelector) {
    renderer.root.remove("theme-selector-container")
    themeSelector = null
  }

  const currentTheme = getTheme()

  const container = new BoxRenderable(renderer, {
    id: "theme-selector-container",
    position: "absolute",
    left: "center",
    top: 4,
    width: 45,
    height: themeNames.length + 4,
    backgroundColor: currentTheme.colors.backgroundPanel,
    border: true,
    borderColor: currentTheme.colors.primary,
    borderStyle: "single",
    title: "Select Theme",
    titleAlignment: "center",
    zIndex: 100,
    padding: 1,
  })
  renderer.root.add(container)

  const options: SelectOption[] = themeNames.map((name) => ({
    name: name === currentTheme.name ? `${name} (current)` : name,
    description: "",
    value: name,
  }))

  themeSelector = new SelectRenderable(renderer, {
    id: "theme-select",
    width: "100%",
    height: themeNames.length + 2,
    options,
    backgroundColor: "transparent",
    focusedBackgroundColor: "transparent",
    selectedBackgroundColor: currentTheme.colors.backgroundElement,
    textColor: currentTheme.colors.text,
    selectedTextColor: currentTheme.colors.primary,
    descriptionColor: currentTheme.colors.textMuted,
    selectedDescriptionColor: currentTheme.colors.textMuted,
    showDescription: false,
    wrapSelection: true,
  })
  container.add(themeSelector)

  themeSelector.on(SelectRenderableEvents.ITEM_SELECTED, (_: number, option: SelectOption) => {
    const themeName = option.value as string
    setTheme(themeName)
    
    renderer.root.remove("theme-selector-container")
    themeSelector = null
    
    // Refresh all UI elements with new theme colors
    refreshThemeColors()
    
    const newTheme = getTheme()
    setOutput(t`${fg(newTheme.colors.success)(`Theme changed to ${themeName}`)}`)
    
    inputField.focus()
  })

  // Handle escape to close
  const escHandler = (key: KeyEvent) => {
    if (key.name === "escape") {
      renderer.root.remove("theme-selector-container")
      themeSelector = null
      inputField.focus()
      renderer.keyInput.off("keypress", escHandler)
    }
  }
  renderer.keyInput.on("keypress", escHandler)

  themeSelector.focus()
}

// Command palette state
let commandPalette: SelectRenderable | null = null
let chordMode: "none" | "ctrl-x" = "none" // For Ctrl+X chord sequences

interface PaletteCommand {
  name: string
  description: string
  key: string // Single key shortcut when palette is open
  chord?: string // Chord shortcut (e.g., "p" for Ctrl+X P)
  action: () => void | Promise<void>
}

function getCommandPaletteOptions(): PaletteCommand[] {
  return [
    {
      name: "Command Palette",
      description: "Open this menu",
      key: "p",
      chord: "p",
      action: () => {}, // Already open
    },
    {
      name: "Change Model",
      description: `Current: ${currentModel.name}`,
      key: "m",
      chord: "m",
      action: () => showModelSelector(),
    },
    {
      name: "Switch Provider",
      description: `Current: ${config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"}`,
      key: "s",
      chord: "s",
      action: () => switchProvider(),
    },
    {
      name: "Toggle Dry Run",
      description: dryRunMode ? "Currently ON" : "Currently OFF",
      key: "d",
      chord: "d",
      action: () => {
        dryRunMode = !dryRunMode
        statusText.content = getDryRunStatus()
        setOutput(t`${fg("#22c55e")(`Dry-run mode: ${dryRunMode ? "ON" : "OFF"}`)}`)
      },
    },
    {
      name: "Show Config",
      description: "View current configuration",
      key: "c",
      chord: "c",
      action: () => showConfig(),
    },
    {
      name: "Show History",
      description: `${history.length} commands`,
      key: "h",
      chord: "h",
      action: () => showHistory(),
    },
    {
      name: "Change Theme",
      description: `Current: ${getTheme().name}`,
      key: "t",
      chord: "t",
      action: () => showThemeSelector(),
    },
    {
      name: "Clear Output",
      description: "Clear the output area",
      key: "l",
      chord: "l",
      action: () => setOutput(""),
    },
    {
      name: "Show Help",
      description: "View all commands and shortcuts",
      key: "?",
      chord: "?",
      action: () => showHelp(),
    },
    {
      name: "Exit",
      description: "Close magic-shell",
      key: "q",
      chord: "q",
      action: () => {
        renderer.destroy()
        process.exit(0)
      },
    },
  ]
}

function showCommandPalette() {
  if (commandPalette) {
    closeCommandPalette()
    return
  }

  const commands = getCommandPaletteOptions()

  const container = new BoxRenderable(renderer, {
    id: "command-palette-container",
    position: "absolute",
    left: "center",
    top: 3,
    width: 55,
    height: Math.min(commands.length + 4, 16),
    backgroundColor: "#1e293b",
    border: true,
    borderColor: "#60a5fa",
    borderStyle: "single",
    title: "Command Palette (Ctrl+X ...)",
    titleAlignment: "center",
    zIndex: 200,
    padding: 1,
  })
  renderer.root.add(container)

  const options: SelectOption[] = commands.map((cmd) => ({
    name: cmd.chord 
      ? `[${cmd.key}] ${cmd.name}` 
      : `[${cmd.key}] ${cmd.name}`,
    description: cmd.description,
    value: cmd,
  }))

  commandPalette = new SelectRenderable(renderer, {
    id: "command-palette-select",
    width: "100%",
    height: Math.min(commands.length + 2, 12),
    options,
    backgroundColor: "transparent",
    focusedBackgroundColor: "transparent",
    selectedBackgroundColor: "#334155",
    textColor: "#e2e8f0",
    selectedTextColor: "#60a5fa",
    descriptionColor: "#64748b",
    selectedDescriptionColor: "#94a3b8",
    showDescription: true,
    wrapSelection: true,
  })
  container.add(commandPalette)

  commandPalette.on(SelectRenderableEvents.ITEM_SELECTED, async (_: number, option: SelectOption) => {
    const cmd = option.value as PaletteCommand
    closeCommandPalette()
    await cmd.action()
  })

  commandPalette.focus()
}

function closeCommandPalette() {
  if (commandPalette) {
    renderer.root.remove("command-palette-container")
    commandPalette = null
    inputField?.focus()
  }
}

function handleKeypress(key: KeyEvent) {
  const commands = getCommandPaletteOptions()
  
  // Handle Ctrl+X chord mode
  if (key.ctrl && key.name === "x") {
    chordMode = "ctrl-x"
    // Brief visual feedback could go here
    return
  }

  // If in chord mode, handle the second key
  if (chordMode === "ctrl-x") {
    chordMode = "none"
    
    // Find command matching this chord
    const keyName = key.name || key.sequence
    const cmd = commands.find(c => c.chord === keyName)
    if (cmd) {
      if (cmd.key === "p") {
        showCommandPalette()
      } else {
        cmd.action()
      }
      return
    }
    // Invalid chord, ignore
    return
  }

  // Handle single-key shortcuts when palette is open
  if (commandPalette) {
    const keyName = key.name || key.sequence
    const cmd = commands.find(c => c.key === keyName)
    if (cmd) {
      closeCommandPalette()
      cmd.action()
      return
    }
  }

  // Global exit - Ctrl+C
  if (key.ctrl && key.name === "c") {
    if (commandPalette) {
      closeCommandPalette()
      return
    }
    if (modelSelector) {
      renderer.root.remove("model-selector-container")
      modelSelector = null
      inputField.focus()
      return
    }
    if (providerSelector) {
      renderer.destroy()
      process.exit(0)
    }
    renderer.destroy()
    process.exit(0)
  }

  // Escape to cancel/close
  if (key.name === "escape") {
    chordMode = "none"
    if (commandPalette) {
      closeCommandPalette()
      return
    }
    if (modelSelector) {
      renderer.root.remove("model-selector-container")
      modelSelector = null
      inputField.focus()
      return
    }

    if (awaitingConfirmation) {
      clearCommandState()
      setOutput(t`${fg("#64748b")("Command cancelled.")}`)
      inputField.focus()
    }
  }

  // Enter to confirm dangerous command
  if (key.name === "return" && awaitingConfirmation && pendingCommand) {
    const cmd = pendingCommand
    clearCommandState()
    processCommand("", cmd)
  }

  // 'e' to edit command
  if (key.name === "e" && awaitingConfirmation && pendingCommand) {
    inputField.value = pendingCommand
    clearCommandState()
    inputField.focus()
  }
}

// Run if called directly, export for use by index.ts
if (import.meta.main) {
  main().catch(console.error)
}

export default main
