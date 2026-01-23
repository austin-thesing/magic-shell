#!/usr/bin/env bun

import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  ScrollBoxRenderable,
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
  type ChatMessage,
  type SafetyAnalysis,
} from "./lib/types"
import { loadConfig, saveConfig, getApiKey, setApiKey, loadHistory, addToHistory } from "./lib/config"
import { analyzeCommand, getSeverityColor } from "./lib/safety"
import { translateToCommand, getShellInfo } from "./lib/api"
import { getTheme, setTheme, themes, themeNames, loadTheme } from "./lib/theme"

// Global state
let renderer: CliRenderer
let currentModel: Model = OPENCODE_ZEN_MODELS[0] // Default to Big Pickle
let config: Config
let history: CommandHistory[] = []
let currentCwd = getCwd()
let dryRunMode = false

// Chat state
let chatMessages: ChatMessage[] = []
let messageIdCounter = 0
let selectedMessageIndex = -1 // -1 means input is focused, >= 0 means a message is selected

// UI Elements
let mainContainer: BoxRenderable
let headerText: TextRenderable
let statusBarText: TextRenderable
let chatScrollBox: ScrollBoxRenderable
let inputField: InputRenderable
let helpBarText: TextRenderable
let modelSelector: SelectRenderable | null = null
let providerSelector: SelectRenderable | null = null

// Pending command state (for the most recent assistant message awaiting confirmation)
let pendingMessageId: string | null = null
let awaitingConfirmation = false

// Helper to generate message IDs
function generateMessageId(): string {
  return `msg-${++messageIdCounter}`
}

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
${fg("#22c55e")("Tip:")} OpenCode Zen has free models like Big Pickle and GLM 4.7!`,
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
        currentModel = OPENCODE_ZEN_MODELS.find((m) => m.id === "big-pickle") || OPENCODE_ZEN_MODELS[0]
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
  
  // Main container - full screen flex column
  mainContainer = new BoxRenderable(renderer, {
    id: "main-container",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
  })
  renderer.root.add(mainContainer)

  // === Header Row ===
  const headerRow = new BoxRenderable(renderer, {
    id: "header-row",
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    marginBottom: 1,
  })
  mainContainer.add(headerRow)

  headerText = new TextRenderable(renderer, {
    id: "header-text",
    content: t`${bold(fg(theme.colors.primary)("magic-shell"))}`,
    flexGrow: 1,
  })
  headerRow.add(headerText)

  // === Status Bar (provider, model info, safe indicator) ===
  statusBarText = new TextRenderable(renderer, {
    id: "status-bar-text",
    content: getStatusBarContent(),
    marginBottom: 1,
  })
  mainContainer.add(statusBarText)

  // === Chat History (scrollable) ===
  chatScrollBox = new ScrollBoxRenderable(renderer, {
    id: "chat-scroll-box",
    flexGrow: 1,
    width: "100%",
    scrollY: true,
    scrollX: false,
    stickyScroll: true,
    stickyStart: "bottom",
    rootOptions: {
      border: true,
      borderColor: theme.colors.border,
      borderStyle: "single",
    },
    viewportOptions: {
      backgroundColor: theme.colors.background,
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
    },
    contentOptions: {
      flexDirection: "column",
      gap: 1,
    },
  })
  mainContainer.add(chatScrollBox)

  // Add welcome message
  addSystemMessage(getWelcomeMessage())

  // === Input Row (at bottom) ===
  const inputRow = new BoxRenderable(renderer, {
    id: "input-row",
    flexDirection: "row",
    width: "100%",
    marginTop: 1,
    alignItems: "center",
  })
  mainContainer.add(inputRow)

  const promptText = new TextRenderable(renderer, {
    id: "prompt-text",
    content: t`${fg(theme.colors.primary)("~>")} `,
    width: 3,
    height: 1,
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
    onPaste: (event) => {
      inputField.insertText(event.text)
    },
  })
  inputRow.add(inputField)

  // === Help Bar (bottom) ===
  helpBarText = new TextRenderable(renderer, {
    id: "help-bar-text",
    content: getHelpBarContent(),
    marginTop: 1,
  })
  mainContainer.add(helpBarText)

  // Event handlers
  inputField.on(InputRenderableEvents.ENTER, handleInput)
  renderer.keyInput.on("keypress", handleKeypress)

  inputField.focus()
}

// === Chat Message Rendering Helpers ===

function getStatusBarContent(): StyledText {
  const theme = getTheme()
  const providerName = config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
  const safeModeIndicator = dryRunMode 
    ? fg(theme.colors.warning)("[DRY RUN]")
    : ""
  const safetyLevelColor = config.safetyLevel === "strict" 
    ? theme.colors.warning 
    : config.safetyLevel === "relaxed" 
      ? theme.colors.error 
      : theme.colors.success
  const safetyIndicator = fg(safetyLevelColor)(`[${config.safetyLevel}]`)
  const repoContextIndicator = config.repoContext
    ? fg(theme.colors.info)("[Repo]")
    : ""
  
  return t`${fg(theme.colors.textMuted)("Provider:")} ${fg(theme.colors.text)(providerName)}  ${fg(theme.colors.textMuted)("Model:")} ${fg(theme.colors.text)(currentModel.name)}  ${safetyIndicator}${safeModeIndicator ? " " : ""}${safeModeIndicator}${repoContextIndicator ? " " : ""}${repoContextIndicator}`
}

function getHelpBarContent(): StyledText {
  const theme = getTheme()
  if (awaitingConfirmation) {
    return t`${fg(theme.colors.warning)(">>> Press Enter to execute command <<<")} ${fg(theme.colors.textMuted)("|")} ${fg(theme.colors.error)("Esc")}${fg(theme.colors.textMuted)(" Cancel")} ${fg(theme.colors.primary)("e")}${fg(theme.colors.textMuted)(" Edit")} ${fg(theme.colors.primary)("c")}${fg(theme.colors.textMuted)(" Copy")}`
  }
  return t`${fg(theme.colors.primary)("Ctrl+X P")}${fg(theme.colors.textMuted)(" Commands")}  ${fg(theme.colors.primary)("Ctrl+Y")}${fg(theme.colors.textMuted)(" Safety")}  ${fg(theme.colors.primary)("Ctrl+Z")}${fg(theme.colors.textMuted)(" Exit")}`
}

function getWelcomeMessage(): string {
  const providerName = config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
  const freeNote = config.provider === "opencode-zen" 
    ? "\nFree models: big-pickle" 
    : ""
  return `Ready. Using ${providerName}.${freeNote}\nType what you want to do, or press Ctrl+X P for command palette.`
}

function addSystemMessage(content: string): ChatMessage {
  const msg: ChatMessage = {
    id: generateMessageId(),
    type: "system",
    content,
    timestamp: Date.now(),
  }
  chatMessages.push(msg)
  renderMessage(msg)
  return msg
}

function addUserMessage(content: string): ChatMessage {
  const msg: ChatMessage = {
    id: generateMessageId(),
    type: "user",
    content,
    timestamp: Date.now(),
  }
  chatMessages.push(msg)
  renderMessage(msg)
  return msg
}

function addAssistantMessage(content: string, command: string, safety: SafetyAnalysis): ChatMessage {
  const msg: ChatMessage = {
    id: generateMessageId(),
    type: "assistant",
    content,
    command,
    safety,
    timestamp: Date.now(),
    executed: false,
  }
  chatMessages.push(msg)
  renderMessage(msg)
  return msg
}

function addResultMessage(content: string, exitCode?: number): ChatMessage {
  const msg: ChatMessage = {
    id: generateMessageId(),
    type: "result",
    content,
    timestamp: Date.now(),
    exitCode,
  }
  chatMessages.push(msg)
  renderMessage(msg)
  return msg
}

function renderMessage(msg: ChatMessage): void {
  const theme = getTheme()
  const msgBox = createMessageRenderable(msg, theme)
  chatScrollBox.add(msgBox)
}

function createMessageRenderable(msg: ChatMessage, theme: ReturnType<typeof getTheme>): BoxRenderable {
  switch (msg.type) {
    case "user":
      return createUserMessageRenderable(msg, theme)
    case "assistant":
      return createAssistantMessageRenderable(msg, theme)
    case "result":
      return createResultMessageRenderable(msg, theme)
    case "system":
    default:
      return createSystemMessageRenderable(msg, theme)
  }
}

function createUserMessageRenderable(msg: ChatMessage, theme: ReturnType<typeof getTheme>): BoxRenderable {
  const box = new BoxRenderable(renderer, {
    id: `msg-${msg.id}`,
    flexDirection: "row",
    width: "100%",
  })
  
  const text = new TextRenderable(renderer, {
    id: `msg-${msg.id}-text`,
    content: t`${fg(theme.colors.success)(">")} ${fg(theme.colors.text)(msg.content)}`,
  })
  box.add(text)
  
  return box
}

function createAssistantMessageRenderable(msg: ChatMessage, theme: ReturnType<typeof getTheme>): BoxRenderable {
  const isSelected = pendingMessageId === msg.id
  
  // Card container
  const card = new BoxRenderable(renderer, {
    id: `msg-${msg.id}`,
    flexDirection: "column",
    width: "100%",
    border: true,
    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
    borderStyle: "single",
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: theme.colors.backgroundPanel,
  })
  
  // Command line
  const commandText = new TextRenderable(renderer, {
    id: `msg-${msg.id}-cmd`,
    content: t`${fg(theme.colors.textMuted)("Command:")} ${fg(theme.colors.text)(msg.command || "")}`,
  })
  card.add(commandText)
  
  // Safety badge
  if (msg.safety) {
    const severityColor = getSeverityColor(msg.safety.severity)
    const severityText = msg.safety.isDangerous 
      ? `${msg.safety.severity.toUpperCase()} risk${msg.safety.reason ? ` - ${msg.safety.reason}` : ""}`
      : "Low risk"
    
    const safetyText = new TextRenderable(renderer, {
      id: `msg-${msg.id}-safety`,
      content: t`${fg(severityColor)("●")} ${fg(theme.colors.textMuted)(severityText)}`,
    })
    card.add(safetyText)
  }
  
  // Actions hint (only if awaiting confirmation for this message)
  if (isSelected && !msg.executed) {
    const actionsText = new TextRenderable(renderer, {
      id: `msg-${msg.id}-actions`,
      content: t`${fg(theme.colors.warning)("Press Enter to run")} ${fg(theme.colors.textMuted)("|")} ${fg(theme.colors.primary)("[c]")} ${fg(theme.colors.textMuted)("Copy")} ${fg(theme.colors.primary)("[e]")} ${fg(theme.colors.textMuted)("Edit")} ${fg(theme.colors.error)("[Esc]")} ${fg(theme.colors.textMuted)("Cancel")}`,
    })
    card.add(actionsText)
  }
  
  // Executed badge
  if (msg.executed) {
    const wasAutoRun = !msg.safety?.isDangerous
    const execLabel = wasAutoRun ? "Auto-executed (safe)" : "Executed"
    const execText = new TextRenderable(renderer, {
      id: `msg-${msg.id}-exec`,
      content: t`${fg(theme.colors.success)("✓")} ${fg(theme.colors.success)(execLabel)}`,
    })
    card.add(execText)
  }
  
  return card
}

function createResultMessageRenderable(msg: ChatMessage, theme: ReturnType<typeof getTheme>): BoxRenderable {
  const isSuccess = msg.exitCode === undefined || msg.exitCode === 0
  const isExpanded = msg.expanded ?? false
  const hasOutput = msg.content && msg.content.trim().length > 0
  const outputLines = hasOutput ? msg.content.trim().split("\n") : []
  const isLongOutput = outputLines.length > 5
  const PREVIEW_LINES = 3
  
  const card = new BoxRenderable(renderer, {
    id: `msg-${msg.id}`,
    flexDirection: "column",
    width: "100%",
    border: true,
    borderColor: isSuccess ? theme.colors.success : theme.colors.error,
    borderStyle: "single",
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: theme.colors.backgroundPanel,
    // Click to expand/collapse
    onMouseDown: isLongOutput ? () => {
      toggleResultExpand(msg.id)
    } : undefined,
  })
  
  // Status line with expand/collapse indicator
  const statusIcon = isSuccess ? "✓" : "✗"
  const statusColor = isSuccess ? theme.colors.success : theme.colors.error
  const statusLabel = isSuccess ? "Executed successfully" : `Exit code: ${msg.exitCode}`
  const expandIcon = isLongOutput ? (isExpanded ? "▼" : "▶") : ""
  const lineCount = isLongOutput ? ` (${outputLines.length} lines)` : ""
  
  const statusText = new TextRenderable(renderer, {
    id: `msg-${msg.id}-status`,
    content: t`${fg(statusColor)(statusIcon)} ${fg(theme.colors.text)(statusLabel)}${fg(theme.colors.textMuted)(lineCount)} ${fg(theme.colors.primary)(expandIcon)}`,
  })
  card.add(statusText)
  
  // Output display
  if (hasOutput) {
    let displayContent: string
    
    if (isExpanded || !isLongOutput) {
      // Show full output
      displayContent = msg.content.trim()
    } else {
      // Show preview with truncation indicator
      const previewLines = outputLines.slice(0, PREVIEW_LINES)
      displayContent = previewLines.join("\n") + `\n... ${outputLines.length - PREVIEW_LINES} more lines`
    }
    
    const outputText = new TextRenderable(renderer, {
      id: `msg-${msg.id}-output`,
      content: t`${fg(theme.colors.textMuted)(displayContent)}`,
    })
    card.add(outputText)
    
    // Show expand/collapse hint for long output
    if (isLongOutput) {
      const hintText = new TextRenderable(renderer, {
        id: `msg-${msg.id}-hint`,
        content: t`${fg(theme.colors.primary)("[o]")} ${fg(theme.colors.textMuted)(isExpanded ? "Collapse" : "Expand output")}`,
      })
      card.add(hintText)
    }
  }
  
  return card
}

function createSystemMessageRenderable(msg: ChatMessage, theme: ReturnType<typeof getTheme>): BoxRenderable {
  const box = new BoxRenderable(renderer, {
    id: `msg-${msg.id}`,
    flexDirection: "column",
    width: "100%",
  })
  
  const text = new TextRenderable(renderer, {
    id: `msg-${msg.id}-text`,
    content: t`${fg(theme.colors.textMuted)(msg.content)}`,
  })
  box.add(text)
  
  return box
}

function updateAssistantMessage(msgId: string, updates: Partial<ChatMessage>): void {
  const msgIndex = chatMessages.findIndex(m => m.id === msgId)
  if (msgIndex === -1) return
  
  const msg = chatMessages[msgIndex]
  Object.assign(msg, updates)
  
  // Re-render the message by removing and re-adding
  chatScrollBox.remove(`msg-${msgId}`)
  const theme = getTheme()
  const newBox = createMessageRenderable(msg, theme)
  // Insert at correct position (after user message)
  chatScrollBox.add(newBox)
}

function updateResultMessage(msgId: string, updates: Partial<ChatMessage>): void {
  const msgIndex = chatMessages.findIndex(m => m.id === msgId)
  if (msgIndex === -1) return
  
  const msg = chatMessages[msgIndex]
  Object.assign(msg, updates)
  
  // Re-render the message
  chatScrollBox.remove(`msg-${msgId}`)
  const theme = getTheme()
  const newBox = createMessageRenderable(msg, theme)
  chatScrollBox.add(newBox)
}

function toggleResultExpand(msgId: string): void {
  const msg = chatMessages.find(m => m.id === msgId)
  if (!msg || msg.type !== "result") return
  
  // Only toggle if it has content worth expanding
  const outputLines = msg.content?.trim().split("\n") || []
  if (outputLines.length <= 5) return // Not long enough to need expand
  
  // Toggle expanded state
  updateResultMessage(msgId, { expanded: !msg.expanded })
}

function toggleLastResultExpand(): void {
  // Find the most recent result message
  const resultMessages = chatMessages.filter(m => m.type === "result")
  if (resultMessages.length === 0) return
  
  const lastResult = resultMessages[resultMessages.length - 1]
  toggleResultExpand(lastResult.id)
}

// Refresh all UI elements with current theme colors
function refreshThemeColors() {
  const theme = getTheme()
  
  // Update renderer background
  renderer.setBackgroundColor(theme.colors.background)
  
  // Update header
  if (headerText) {
    headerText.content = t`${bold(fg(theme.colors.primary)("magic-shell"))}`
  }
  
  // Update status bar
  if (statusBarText) {
    statusBarText.content = getStatusBarContent()
  }

  
  // Update help bar
  if (helpBarText) {
    helpBarText.content = getHelpBarContent()
  }
  
  // Update chat scroll box border
  if (chatScrollBox) {
    chatScrollBox.rootOptions = {
      borderColor: theme.colors.border,
    }
  }
  
  // Update input field colors
  if (inputField) {
    inputField.focusedBackgroundColor = theme.colors.backgroundPanel
    inputField.textColor = theme.colors.text
    inputField.placeholderColor = theme.colors.textMuted
    inputField.cursorColor = theme.colors.primary
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

  // Add user message to chat
  addUserMessage(input)

  // Check if it looks like a direct shell command
  if (isDirectCommand(input)) {
    await processDirectCommand(input, input)
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
    addSystemMessage("Error: No API key configured. Run !provider to set up.")
    return
  }

  // Show a temporary "translating" system message
  const loadingMsg = addSystemMessage("Translating...")

  try {
    const command = await translateToCommand(apiKey, currentModel, input, currentCwd, history, config.repoContext)

    // Remove the loading message
    chatScrollBox.remove(`msg-${loadingMsg.id}`)
    chatMessages = chatMessages.filter(m => m.id !== loadingMsg.id)

    // Analyze safety
    const safety = analyzeCommand(command, config)

    // Add assistant message with the translated command
    const assistantMsg = addAssistantMessage(input, command, safety)

    if (safety.isDangerous) {
      // Mark this message as pending confirmation
      pendingMessageId = assistantMsg.id
      awaitingConfirmation = true
      helpBarText.content = getHelpBarContent()
    } else {
      // Safe command - execute immediately
      await executeAndShowResult(input, command, assistantMsg.id)
    }
  } catch (error) {
    // Remove loading message on error
    chatScrollBox.remove(`msg-${loadingMsg.id}`)
    chatMessages = chatMessages.filter(m => m.id !== loadingMsg.id)
    
    const message = error instanceof Error ? error.message : String(error)
    addSystemMessage(`Error: ${message}`)
  }
}

// Process a direct shell command (not translated)
async function processDirectCommand(input: string, command: string) {
  // Analyze safety even for direct commands
  const safety = analyzeCommand(command, config)
  const assistantMsg = addAssistantMessage(input, command, safety)
  
  if (safety.isDangerous) {
    pendingMessageId = assistantMsg.id
    awaitingConfirmation = true
    helpBarText.content = getHelpBarContent()
  } else {
    await executeAndShowResult(input, command, assistantMsg.id)
  }
}

// Execute a command and show result in chat
async function executeAndShowResult(input: string, command: string, assistantMsgId: string) {
  // Handle cd specially
  if (command.startsWith("cd ")) {
    const path = command.slice(3).trim().replace(/^["']|["']$/g, "")
    try {
      const expandedPath = path.startsWith("~") ? path.replace("~", process.env.HOME || "") : path
      process.chdir(expandedPath)
      currentCwd = getCwd()
      
      // Update status bar with new cwd info
      statusBarText.content = getStatusBarContent()
      
      addResultMessage(`Changed directory to ${currentCwd}`, 0)

      addToHistory({
        input,
        command,
        output: `Changed to ${currentCwd}`,
        timestamp: Date.now(),
      })
      history = loadHistory()
      
      // Mark assistant message as executed
      updateAssistantMessage(assistantMsgId, { executed: true })
    } catch (err) {
      addResultMessage(`cd: ${err instanceof Error ? err.message : String(err)}`, 1)
    }
    clearCommandState()
    return
  }

  if (dryRunMode) {
    addResultMessage(`[DRY RUN] Would execute: ${command}`, 0)
    updateAssistantMessage(assistantMsgId, { executed: true })
    clearCommandState()
    return
  }

  // Execute command
  try {
    const { output, exitCode } = await executeCommandWithCode(command)
    addResultMessage(output || "Command completed successfully", exitCode)

    addToHistory({
      input,
      command,
      output: output.slice(0, 500),
      timestamp: Date.now(),
    })
    history = loadHistory()
    
    // Mark assistant message as executed
    updateAssistantMessage(assistantMsgId, { executed: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    addResultMessage(`Error: ${message}`, 1)
  }

  clearCommandState()
}

interface CommandResult {
  output: string
  exitCode: number
}

function executeCommandWithCode(command: string): Promise<CommandResult> {
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
      const exitCode = code ?? 0
      const output = stdout || stderr || (exitCode === 0 ? "" : `Command exited with code ${exitCode}`)
      resolve({ output, exitCode })
    })
  })
}

function clearCommandState() {
  pendingMessageId = null
  awaitingConfirmation = false
  helpBarText.content = getHelpBarContent()
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
      statusBarText.content = getStatusBarContent()
      addSystemMessage(`Dry-run mode: ${dryRunMode ? "ON" : "OFF"}`)
      break
    case "config":
      await showConfig()
      break
    case "history":
      showHistory()
      break
    case "clear":
      clearChat()
      break
    default:
      // Try to execute as shell command
      if (cmd) {
        addUserMessage(cmd)
        await processDirectCommand(input, cmd)
      }
  }
}

function clearChat() {
  // Remove all messages from scroll box and array
  for (const msg of chatMessages) {
    chatScrollBox.remove(`msg-${msg.id}`)
  }
  chatMessages = []
  // Add fresh welcome message
  addSystemMessage(getWelcomeMessage())
}

function showHelp() {
  const helpText = `Direct Shortcuts:
Ctrl+Y  Cycle safety level (strict/moderate/relaxed)
Ctrl+Z  Exit magic-shell
Ctrl+C  Cancel / Close popup

Chord Shortcuts (Ctrl+X then...):
P  Command palette    M  Change model
S  Switch provider    D  Toggle dry-run
T  Change theme       R  Toggle repo context
H  Show history       L  Clear chat
C  Show config        ?  This help

Safety Levels:
- strict:   Confirm ALL potentially dangerous commands
- moderate: Confirm high/critical severity commands (default)
- relaxed:  Only confirm critical commands

Tips:
- Type naturally: "list all files" -> ls -la
- Reference history: "do that again", "undo"
- Enable repo context to use project scripts (Ctrl+X R)`
  
  addSystemMessage(helpText)
}

async function showConfig() {
  const theme = getTheme()
  const providerName = config.provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
  const apiKey = await getApiKey(config.provider)
  const apiKeyStatus = apiKey ? "configured" : "not set"
  const freeBadge = currentModel.free ? " (FREE)" : ""
  const shellInfo = getShellInfo()

  const configText = `Current Configuration

Provider:     ${providerName}
Model:        ${currentModel.name}${freeBadge}
Model ID:     ${currentModel.id}
Category:     ${currentModel.category}
Theme:        ${theme.name}
Shell:        ${shellInfo.shell} (${shellInfo.shellPath})
Platform:     ${shellInfo.platform}${shellInfo.isWSL ? " (WSL)" : ""}
Safety:       ${config.safetyLevel}
Dry-run:      ${dryRunMode ? "ON" : "OFF"}
Repo context: ${config.repoContext ? "ON" : "OFF"}
API Key:      ${apiKeyStatus}
History:      ${history.length} commands`

  addSystemMessage(configText)
}

function showHistory() {
  if (history.length === 0) {
    addSystemMessage("No command history yet.")
    return
  }

  const recent = history.slice(-10)
  const lines = recent.map((entry, i) => {
    const date = new Date(entry.timestamp).toLocaleTimeString()
    return `${i + 1}. [${date}] ${entry.command}`
  })

  addSystemMessage(`Recent Command History\n\n${lines.join("\n")}`)
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

      // Update status bar to show new provider/model
      statusBarText.content = getStatusBarContent()
      closeSelector()

      const providerName = newProvider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"
      addSystemMessage(`Switched to ${providerName}. Model: ${currentModel.name}`)
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
    
    // Update status bar to show new model
    statusBarText.content = getStatusBarContent()

    renderer.root.remove("model-selector-container")
    modelSelector = null
    inputField.focus()

    const freeBadge = currentModel.free ? " (FREE)" : ""
    addSystemMessage(`Model changed to ${currentModel.name}${freeBadge}`)
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

  // Center horizontally: (terminal width - container width) / 2
  // Using a reasonable default for typical terminals
  const themeContainerWidth = 45
  const terminalWidth = process.stdout.columns || 80
  const themeContainerLeft = Math.max(2, Math.floor((terminalWidth - themeContainerWidth) / 2))

  const container = new BoxRenderable(renderer, {
    id: "theme-selector-container",
    position: "absolute",
    left: themeContainerLeft,
    top: 4,
    width: themeContainerWidth,
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
    
    addSystemMessage(`Theme changed to ${themeName}`)
    
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
        statusBarText.content = getStatusBarContent()
        addSystemMessage(`Dry-run mode: ${dryRunMode ? "ON" : "OFF"}`)
      },
    },
    {
      name: "Cycle Safety Level",
      description: `Current: ${config.safetyLevel}`,
      key: "y",
      chord: "y",
      action: () => {
        // Cycle: moderate -> strict -> relaxed -> moderate
        const levels: Array<"strict" | "moderate" | "relaxed"> = ["moderate", "strict", "relaxed"]
        const currentIndex = levels.indexOf(config.safetyLevel)
        const nextIndex = (currentIndex + 1) % levels.length
        config.safetyLevel = levels[nextIndex]
        saveConfig(config)
        statusBarText.content = getStatusBarContent()
        const descriptions: Record<string, string> = {
          strict: "confirms ALL potentially dangerous commands",
          moderate: "confirms high/critical severity commands",
          relaxed: "only confirms critical commands",
        }
        addSystemMessage(`Safety level: ${config.safetyLevel} (${descriptions[config.safetyLevel]})`)
      },
    },
    {
      name: "Toggle Project Context",
      description: config.repoContext ? "Currently ON (sends script names to AI)" : "Currently OFF",
      key: "r",
      chord: "r",
      action: () => {
        config.repoContext = !config.repoContext
        saveConfig(config)
        statusBarText.content = getStatusBarContent()
        addSystemMessage(`Project context: ${config.repoContext ? "ON - AI can see your package.json scripts, Makefile targets, etc." : "OFF"}`)
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
      name: "Clear Chat",
      description: "Clear the chat history",
      key: "l",
      chord: "l",
      action: () => clearChat(),
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

  // Center horizontally: (terminal width - container width) / 2
  const paletteWidth = 55
  const termWidth = process.stdout.columns || 80
  const paletteLeft = Math.max(2, Math.floor((termWidth - paletteWidth) / 2))

  const container = new BoxRenderable(renderer, {
    id: "command-palette-container",
    position: "absolute",
    left: paletteLeft,
    top: 3,
    width: paletteWidth,
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
  
  // Handle Ctrl+Y - direct safety level toggle (no chord needed)
  if (key.ctrl && key.name === "y") {
    // Cycle: moderate -> strict -> relaxed -> moderate
    const levels: Array<"strict" | "moderate" | "relaxed"> = ["moderate", "strict", "relaxed"]
    const currentIndex = levels.indexOf(config.safetyLevel)
    const nextIndex = (currentIndex + 1) % levels.length
    config.safetyLevel = levels[nextIndex]
    saveConfig(config)
    statusBarText.content = getStatusBarContent()
    const descriptions: Record<string, string> = {
      strict: "confirms ALL potentially dangerous commands",
      moderate: "confirms high/critical severity commands",
      relaxed: "only confirms critical commands",
    }
    addSystemMessage(`Safety level: ${config.safetyLevel} (${descriptions[config.safetyLevel]})`)
    return
  }
  
  // Handle Ctrl+Z - exit the TUI
  if (key.ctrl && key.name === "z") {
    renderer.destroy()
    process.exit(0)
  }
  
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

  // Ctrl+C - close popups/cancel operations, but don't exit
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
    if (themeSelector) {
      renderer.root.remove("theme-selector-container")
      themeSelector = null
      inputField.focus()
      return
    }
    if (awaitingConfirmation && pendingMessageId) {
      clearCommandState()
      addSystemMessage("Command cancelled.")
      inputField.focus()
      return
    }
    // During initial setup, allow Ctrl+C to exit
    if (providerSelector) {
      renderer.destroy()
      process.exit(0)
    }
    // Otherwise just show hint about how to exit
    addSystemMessage("Press Ctrl+Z to exit.")
    return
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

    if (awaitingConfirmation && pendingMessageId) {
      clearCommandState()
      addSystemMessage("Command cancelled.")
      inputField.focus()
    }
  }

  // Enter to confirm dangerous command
  if (key.name === "return" && awaitingConfirmation && pendingMessageId) {
    const msg = chatMessages.find(m => m.id === pendingMessageId)
    if (msg && msg.command) {
      const command = msg.command
      const msgId = pendingMessageId
      clearCommandState()
      executeAndShowResult(msg.content, command, msgId)
    }
  }

  // 'e' to edit command
  if (key.name === "e" && awaitingConfirmation && pendingMessageId) {
    const msg = chatMessages.find(m => m.id === pendingMessageId)
    if (msg && msg.command) {
      inputField.value = msg.command
      clearCommandState()
      inputField.focus()
    }
  }
  
  // 'c' to copy command to clipboard (macOS)
  if (key.name === "c" && awaitingConfirmation && pendingMessageId) {
    const msg = chatMessages.find(m => m.id === pendingMessageId)
    if (msg && msg.command) {
      // Use pbcopy on macOS, or xclip on Linux
      const copyCmd = process.platform === "darwin" ? "pbcopy" : "xclip -selection clipboard"
      const child = spawn(copyCmd, { shell: true })
      child.stdin?.write(msg.command)
      child.stdin?.end()
      addSystemMessage(`Copied to clipboard: ${msg.command}`)
    }
  }
  
  // 'o' to toggle expand/collapse on the most recent result message
  if (key.name === "o" && !awaitingConfirmation && !commandPalette && !modelSelector) {
    toggleLastResultExpand()
  }
}

// Run if called directly, export for use by index.ts
if (import.meta.main) {
  main().catch(console.error)
}

export default main
