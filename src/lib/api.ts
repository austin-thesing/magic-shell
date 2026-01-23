import type { CommandHistory, Model, Config } from "./types"
import { detectShell, getShellSyntaxHints, getPlatformPaths, type ShellInfo } from "./shell"
import { detectRepoContext, formatRepoContext } from "./repo-context"

// Determine API type based on model ID for Zen
// Reference: https://opencode.ai/docs/zen/
type ZenApiType = "openai-responses" | "anthropic" | "openai-compatible" | "google"

function getZenApiType(modelId: string): ZenApiType {
  // OpenAI Responses API models (GPT models)
  if (modelId.startsWith("gpt-")) {
    return "openai-responses"
  }
  // Anthropic models AND MiniMax (uses Anthropic endpoint per docs)
  if (modelId.startsWith("claude-") || modelId.startsWith("minimax-")) {
    return "anthropic"
  }
  // Google models
  if (modelId.startsWith("gemini-")) {
    return "google"
  }
  // OpenAI-compatible (Kimi, Qwen, GLM, Grok, Big Pickle, etc.)
  return "openai-compatible"
}

function getZenEndpoint(modelId: string): string {
  const apiType = getZenApiType(modelId)
  switch (apiType) {
    case "openai-responses":
      return "https://opencode.ai/zen/v1/responses"
    case "anthropic":
      return "https://opencode.ai/zen/v1/messages"
    case "google":
      return `https://opencode.ai/zen/v1/models/${modelId}`
    case "openai-compatible":
      return "https://opencode.ai/zen/v1/chat/completions"
  }
}

function buildSystemPrompt(cwd: string, history: CommandHistory[], shellInfo: ShellInfo, repoContextEnabled?: boolean): string {
  const historyContext = formatHistory(history)
  const platformPaths = getPlatformPaths(shellInfo.platform)
  const shellHints = getShellSyntaxHints(shellInfo.shell)

  const platformName = shellInfo.platform === "macos" 
    ? "macOS" 
    : shellInfo.platform === "windows"
      ? "Windows"
      : shellInfo.platform === "linux"
        ? shellInfo.isWSL ? "Linux (WSL)" : "Linux"
        : "Unknown"

  // Build project context section if enabled
  let projectContextSection = ""
  if (repoContextEnabled) {
    const repoContext = detectRepoContext(cwd)
    if (repoContext) {
      projectContextSection = `
Project context:
${formatRepoContext(repoContext)}
`
    }
  }

  return `You are a shell command translator. Convert the user's natural language request into a shell command.

Current environment:
- Platform: ${platformName}
- Shell: ${shellInfo.shell} (${shellInfo.shellPath})
- Working directory: ${cwd}
- Home directory: ${shellInfo.homeDir}
${shellInfo.terminalEmulator ? `- Terminal: ${shellInfo.terminalEmulator}` : ""}
${projectContextSection}
${shellHints}

Recent command history:
${historyContext}

Rules:
- Output ONLY the shell command, nothing else
- No explanations, no markdown, no backticks, no code blocks
- Use the correct syntax for the detected shell (${shellInfo.shell})
- If the request is unclear, make a reasonable assumption
- Prefer simple, common commands over complex one-liners${repoContextEnabled ? `
- Use project-specific commands when relevant (e.g., use the detected package manager and available scripts)` : ""}
- Use the command history for context (e.g., "do that again", "undo", "delete the file I just created")
- If the user asks something that can't be done with a shell command, output a command that prints a helpful message
- For file operations, prefer safer alternatives when possible
- Always quote paths that might contain spaces
- Use ${platformPaths.homePlaceholder} for home directory references
- Use ${platformPaths.nullDevice} for discarding output`
}

function formatHistory(history: CommandHistory[]): string {
  if (history.length === 0) {
    return "No previous commands."
  }

  const recent = history.slice(-5)
  return recent
    .map((entry, i) => {
      let line = `${i + 1}. $ ${entry.command}`
      if (entry.output) {
        const outputLines = entry.output.trim().split("\n").slice(0, 2)
        for (const outputLine of outputLines) {
          line += `\n   ${outputLine.slice(0, 80)}`
        }
      }
      return line
    })
    .join("\n")
}

function cleanCommand(command: string): string {
  let cleaned = command

  // Remove markdown code block markers (```bash, ```sh, etc.)
  cleaned = cleaned.replace(/^```[\w]*\n?/gm, "")
  cleaned = cleaned.replace(/\n?```$/gm, "")

  // Remove wrapping backticks (inline code like `command`)
  // Uses separate replacements for clarity
  cleaned = cleaned.replace(/^`+/, "")
  cleaned = cleaned.replace(/`+$/, "")

  // Remove common prefixes LLMs add
  cleaned = cleaned.replace(/^(command:|shell:|bash:|zsh:|sh:)\s*/i, "")

  // Remove any explanation text before the command
  const lines = cleaned.split("\n")
  if (lines.length > 1) {
    // If multiple lines, take the one that looks most like a command
    const commandLine = lines.find(
      (line) =>
        line.trim() &&
        !line.startsWith("#") &&
        !line.startsWith("//") &&
        !line.toLowerCase().startsWith("this") &&
        !line.toLowerCase().startsWith("the")
    )
    if (commandLine) {
      cleaned = commandLine
    } else {
      cleaned = lines[0]
    }
  }

  return cleaned.trim()
}

// OpenRouter API
async function callOpenRouter(
  apiKey: string,
  modelId: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/magic-shell",
      "X-Title": "magic-shell",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput },
      ],
      max_tokens: 500,
      temperature: 0.1,
    }),
  })

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

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error.message)
  }

  return data.choices[0]?.message?.content?.trim() || ""
}

// Debug flag - set to true to see API responses
const DEBUG_API = process.env.DEBUG_API === "1"

function appendDebugInfo(message: string, status: number, responseText: string): string {
  if (!DEBUG_API) return message
  const snippet = responseText.slice(0, 1000)
  return `${message}\n[DEBUG] status=${status} response=${snippet}`
}

// OpenCode Zen - OpenAI Responses API
async function callZenOpenAIResponses(
  apiKey: string,
  modelId: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling OpenAI Responses API`)
    console.error(`[DEBUG] Model: ${modelId}`)
    console.error(`[DEBUG] API Key prefix: ${apiKey.slice(0, 10)}...`)
  }

  const response = await fetch("https://opencode.ai/zen/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      instructions: systemPrompt,
      input: userInput,
      max_output_tokens: 500,
      temperature: 0.1,
      stream: false,
    }),
  })

  const responseText = await response.text()
  
  if (DEBUG_API) {
    console.error(`[DEBUG] OpenAI Responses API Status: ${response.status}`)
    console.error(`[DEBUG] OpenAI Responses API Response: ${responseText.slice(0, 1000)}`)
  }

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status}`
    try {
      const errorData = JSON.parse(responseText)
      if (errorData.error?.message) {
        errorMessage = errorData.error.message
      } else if (errorData.message) {
        errorMessage = errorData.message
      }
    } catch {}
    throw new Error(appendDebugInfo(errorMessage, response.status, responseText))
  }

  let data: any
  try {
    data = JSON.parse(responseText)
  } catch (e) {
    throw new Error(`Invalid JSON response: ${responseText.slice(0, 200)}`)
  }
  
  if (data.error) {
    const errorMessage = data.error.message || data.error
    throw new Error(appendDebugInfo(errorMessage, response.status, responseText))
  }

  // OpenAI Responses API structure:
  // { output: [{ type: "message", content: [{ type: "output_text", text: "..." }] }], ... }
  // or sometimes: { output_text: "..." }
  
  // Try output_text first (simpler response format)
  if (typeof data.output_text === "string") {
    return data.output_text.trim()
  }

  // Try the output array format
  const output = data.output || []
  
  // Look for message type output
  const messageOutput = output.find((o: any) => o.type === "message")
  if (messageOutput?.content) {
    // Content can be array of content blocks
    const textBlock = Array.isArray(messageOutput.content) 
      ? messageOutput.content.find((c: any) => c.type === "output_text" || c.type === "text")
      : messageOutput.content
    
    if (textBlock?.text) {
      return textBlock.text.trim()
    }
    // Sometimes text is directly on the content object
    if (typeof textBlock === "string") {
      return textBlock.trim()
    }
  }

  // Try looking for any text in the output array
  for (const item of output) {
    if (item.text) return item.text.trim()
    if (item.content?.text) return item.content.text.trim()
  }

  // Last resort - stringify and look for text
  const jsonStr = JSON.stringify(data)
  throw new Error(`Unexpected API response format: ${jsonStr.slice(0, 200)}`)
}

// OpenCode Zen - Anthropic Messages API
async function callZenAnthropic(
  apiKey: string,
  modelId: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling Anthropic Messages API`)
    console.error(`[DEBUG] Model: ${modelId}`)
    console.error(`[DEBUG] API Key prefix: ${apiKey.slice(0, 10)}...`)
  }

  const response = await fetch("https://opencode.ai/zen/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      system: systemPrompt,
      messages: [{ role: "user", content: userInput }],
      max_tokens: 500,
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `API request failed: ${response.status}`
    try {
      const errorData = JSON.parse(errorText)
      if (errorData.error?.message) {
        errorMessage = errorData.error.message
      }
    } catch {}
    throw new Error(appendDebugInfo(errorMessage, response.status, errorText))
  }

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error.message)
  }

  // Anthropic Messages API returns content array
  const textContent = data.content?.find((c: any) => c.type === "text")
  return textContent?.text?.trim() || ""
}

// OpenCode Zen - OpenAI-compatible Chat Completions
async function callZenOpenAICompatible(
  apiKey: string,
  modelId: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling OpenAI-compatible Chat Completions API`)
    console.error(`[DEBUG] Model: ${modelId}`)
  }

  const response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput },
      ],
      max_tokens: 500,
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `API request failed: ${response.status}`
    try {
      const errorData = JSON.parse(errorText)
      if (errorData.error?.message) {
        errorMessage = errorData.error.message
      }
    } catch {}
    throw new Error(appendDebugInfo(errorMessage, response.status, errorText))
  }

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error.message)
  }

  const choice = data.choices?.[0]
  const messageContent = choice?.message?.content
  if (typeof messageContent === "string") {
    return messageContent.trim()
  }
  if (Array.isArray(messageContent)) {
    const textBlocks = messageContent
      .map((block) => (typeof block === "string" ? block : block?.text))
      .filter(Boolean)
    if (textBlocks.length > 0) {
      return textBlocks.join("").trim()
    }
  }
  if (typeof choice?.text === "string") {
    return choice.text.trim()
  }

  return ""
}

// OpenCode Zen - Google (Gemini)
// Gemini uses the generateContent endpoint format
async function callZenGoogle(
  apiKey: string,
  modelId: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  // Zen Gemini endpoint: /v1/models/{model}
  const endpoint = `https://opencode.ai/zen/v1/models/${modelId}`
  
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling Google Gemini API`)
    console.error(`[DEBUG] Model: ${modelId}`)
    console.error(`[DEBUG] Endpoint: ${endpoint}`)
  }
  
  const prompt = `${systemPrompt}\n\nUser request: ${userInput}`
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: prompt }] },
      ],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.1,
      },
    }),
  })

  const responseText = await response.text()
  
  if (DEBUG_API) {
    console.error(`[DEBUG] Gemini API Status: ${response.status}`)
    console.error(`[DEBUG] Gemini API Response: ${responseText.slice(0, 1000)}`)
  }

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status}`
    try {
      const errorData = JSON.parse(responseText)
      if (errorData.error?.message) {
        errorMessage = errorData.error.message
      }
    } catch {}
    throw new Error(appendDebugInfo(errorMessage, response.status, responseText))
  }

  let data: any
  try {
    data = JSON.parse(responseText)
  } catch (e) {
    throw new Error(`Invalid JSON response: ${responseText.slice(0, 200)}`)
  }
  
  if (data.error) {
    throw new Error(appendDebugInfo(data.error.message, response.status, responseText))
  }

  // Google returns candidates array
  const candidate = data.candidates?.[0]
  const textPart = candidate?.content?.parts?.find((p: any) => p.text)
  return textPart?.text?.trim() || ""
}

// Cache shell info to avoid repeated detection
let cachedShellInfo: ShellInfo | null = null

export function getShellInfo(): ShellInfo {
  if (!cachedShellInfo) {
    cachedShellInfo = detectShell()
  }
  return cachedShellInfo
}

export async function translateToCommand(
  apiKey: string,
  model: Model,
  userInput: string,
  cwd: string,
  history: CommandHistory[] = [],
  repoContextEnabled?: boolean
): Promise<string> {
  const shellInfo = getShellInfo()
  const systemPrompt = buildSystemPrompt(cwd, history, shellInfo, repoContextEnabled)
  let rawCommand: string

  if (model.provider === "openrouter") {
    rawCommand = await callOpenRouter(apiKey, model.id, systemPrompt, userInput)
  } else {
    // OpenCode Zen - determine API type
    const apiType = getZenApiType(model.id)
    switch (apiType) {
      case "openai-responses":
        rawCommand = await callZenOpenAIResponses(apiKey, model.id, systemPrompt, userInput)
        break
      case "anthropic":
        rawCommand = await callZenAnthropic(apiKey, model.id, systemPrompt, userInput)
        break
      case "google":
        rawCommand = await callZenGoogle(apiKey, model.id, systemPrompt, userInput)
        break
      case "openai-compatible":
        rawCommand = await callZenOpenAICompatible(apiKey, model.id, systemPrompt, userInput)
        break
    }
  }

  const cleaned = cleanCommand(rawCommand)
  if (!cleaned) {
    throw new Error("Model returned an empty command. Try another model or rephrase your request.")
  }
  return cleaned
}
