import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type LanguageModel } from "ai";

import type { CommandHistory, Model, Config, CustomModel } from "./types";
import { isCustomModel } from "./types";
import { detectShell, getShellSyntaxHints, getPlatformPaths, type ShellInfo } from "./shell";
import { detectRepoContext, formatRepoContext } from "./repo-context";

// Determine API type based on model ID for Zen
// Reference: https://opencode.ai/docs/zen/
type ZenApiType = "openai-responses" | "anthropic" | "openai-compatible" | "google";

function getZenApiType(modelId: string): ZenApiType {
  // Zen has a small handful of models that don't follow the ID prefix convention.
  // Keep these overrides in sync with https://opencode.ai/docs/zen/
  if (modelId === "minimax-m2.1-free") {
    return "anthropic";
  }

  // OpenAI Responses API models (GPT models)
  if (modelId.startsWith("gpt-")) {
    return "openai-responses";
  }
  // Anthropic models use the Messages API
  if (modelId.startsWith("claude-")) {
    return "anthropic";
  }
  // Google models
  if (modelId.startsWith("gemini-")) {
    return "google";
  }
  // OpenAI-compatible (Kimi, Qwen, GLM, Grok, Big Pickle, etc.)
  return "openai-compatible";
}

const ZEN_BASE_URL = "https://opencode.ai/zen/v1";

function buildSystemPrompt(cwd: string, history: CommandHistory[], shellInfo: ShellInfo, repoContextEnabled?: boolean): string {
  const historyContext = formatHistory(history);
  const platformPaths = getPlatformPaths(shellInfo.platform);
  const shellHints = getShellSyntaxHints(shellInfo.shell);

  const platformName = shellInfo.platform === "macos" ? "macOS" : shellInfo.platform === "windows" ? "Windows" : shellInfo.platform === "linux" ? (shellInfo.isWSL ? "Linux (WSL)" : "Linux") : "Unknown";

  // Build project context section if enabled
  let projectContextSection = "";
  if (repoContextEnabled) {
    const repoContext = detectRepoContext(cwd);
    if (repoContext) {
      projectContextSection = `
Project context:
${formatRepoContext(repoContext)}
`;
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
- Prefer simple, common commands over complex one-liners${
    repoContextEnabled
      ? `
- Use project-specific commands when relevant (e.g., use the detected package manager and available scripts)`
      : ""
  }
- Use the command history for context (e.g., "do that again", "undo", "delete the file I just created")
- If the user asks something that can't be done with a shell command, output a command that prints a helpful message
- For file operations, prefer safer alternatives when possible
- Always quote paths that might contain spaces
- Use ${platformPaths.homePlaceholder} for home directory references
- Use ${platformPaths.nullDevice} for discarding output`;
}

function formatHistory(history: CommandHistory[]): string {
  if (history.length === 0) {
    return "No previous commands.";
  }

  const recent = history.slice(-5);
  return recent
    .map((entry, i) => {
      let line = `${i + 1}. $ ${entry.command}`;
      if (entry.output) {
        const outputLines = entry.output.trim().split("\n").slice(0, 2);
        for (const outputLine of outputLines) {
          line += `\n   ${outputLine.slice(0, 80)}`;
        }
      }
      return line;
    })
    .join("\n");
}

function cleanCommand(command: string): string {
  let cleaned = command;

  // Remove markdown code block markers (```bash, ```sh, etc.)
  cleaned = cleaned.replace(/^```[\w]*\n?/gm, "");
  cleaned = cleaned.replace(/\n?```$/gm, "");

  // Remove wrapping backticks (inline code like `command`)
  // Uses separate replacements for clarity
  cleaned = cleaned.replace(/^`+/, "");
  cleaned = cleaned.replace(/`+$/, "");

  // Remove common prefixes LLMs add
  cleaned = cleaned.replace(/^(command:|shell:|bash:|zsh:|sh:)\s*/i, "");

  // Remove any explanation text before the command
  const lines = cleaned.split("\n");
  if (lines.length > 1) {
    // If multiple lines, take the one that looks most like a command
    const commandLine = lines.find((line) => line.trim() && !line.startsWith("#") && !line.startsWith("//") && !line.toLowerCase().startsWith("this") && !line.toLowerCase().startsWith("the"));
    if (commandLine) {
      cleaned = commandLine;
    } else {
      cleaned = lines[0];
    }
  }

  return cleaned.trim();
}

// OpenRouter API
async function callOpenRouter(apiKey: string, modelId: string, systemPrompt: string, userInput: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API request failed: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.choices[0]?.message?.content?.trim() || "";
}

// Debug flag - set to true to see API responses
const DEBUG_API = process.env.DEBUG_API === "1";

async function generateZenText(model: LanguageModel, systemPrompt: string, userInput: string): Promise<string> {
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: userInput,
    maxOutputTokens: 500,
    temperature: 0.1,
  });

  return text.trim();
}

// OpenCode Zen - OpenAI Responses API
async function callZenOpenAIResponses(apiKey: string, modelId: string, systemPrompt: string, userInput: string): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling OpenAI Responses API`);
    console.error(`[DEBUG] Model: ${modelId}`);
    console.error(`[DEBUG] API Key prefix: ${apiKey.slice(0, 10)}...`);
  }
  const openai = createOpenAI({
    apiKey,
    baseURL: ZEN_BASE_URL,
  });

  try {
    return await generateZenText(openai(modelId), systemPrompt, userInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (DEBUG_API) {
      console.error(`[DEBUG] OpenAI Responses API Error: ${message}`);
    }
    throw new Error(message);
  }
}

// OpenCode Zen - Anthropic Messages API
async function callZenAnthropic(apiKey: string, modelId: string, systemPrompt: string, userInput: string): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling Anthropic Messages API`);
    console.error(`[DEBUG] Model: ${modelId}`);
    console.error(`[DEBUG] API Key prefix: ${apiKey.slice(0, 10)}...`);
  }
  const anthropic = createAnthropic({
    apiKey,
    baseURL: ZEN_BASE_URL,
  });

  try {
    return await generateZenText(anthropic(modelId), systemPrompt, userInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (DEBUG_API) {
      console.error(`[DEBUG] Anthropic Messages API Error: ${message}`);
    }
    throw new Error(message);
  }
}

// OpenCode Zen - OpenAI-compatible Chat Completions
async function callZenOpenAICompatible(apiKey: string, modelId: string, systemPrompt: string, userInput: string): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling OpenAI-compatible Chat Completions API`);
    console.error(`[DEBUG] Model: ${modelId}`);
  }
  const openaiCompatible = createOpenAICompatible({
    name: "opencode-zen",
    apiKey,
    baseURL: ZEN_BASE_URL,
  });

  try {
    return await generateZenText(openaiCompatible(modelId), systemPrompt, userInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (DEBUG_API) {
      console.error(`[DEBUG] OpenAI-compatible API Error: ${message}`);
    }
    throw new Error(message);
  }
}

// Custom model (LM Studio, Ollama, etc.)
async function callCustomModel(model: CustomModel, systemPrompt: string, userInput: string): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling Custom Model`);
    console.error(`[DEBUG] Model: ${model.modelId}`);
    console.error(`[DEBUG] Base URL: ${model.baseUrl}`);
  }
  const openaiCompatible = createOpenAICompatible({
    name: "custom",
    apiKey: model.apiKey || "not-needed",
    baseURL: model.baseUrl,
  });

  try {
    return await generateZenText(openaiCompatible(model.modelId), systemPrompt, userInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (DEBUG_API) {
      console.error(`[DEBUG] Custom Model Error: ${message}`);
    }
    throw new Error(message);
  }
}

// OpenCode Zen - Google (Gemini)
// Gemini uses the generateContent endpoint format
async function callZenGoogle(apiKey: string, modelId: string, systemPrompt: string, userInput: string): Promise<string> {
  if (DEBUG_API) {
    console.error(`[DEBUG] Calling Google Gemini API`);
    console.error(`[DEBUG] Model: ${modelId}`);
  }
  const google = createGoogleGenerativeAI({
    apiKey,
    baseURL: `https://opencode.ai/zen/v1/models/${modelId}`,
  });

  try {
    return await generateZenText(google(modelId), systemPrompt, userInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (DEBUG_API) {
      console.error(`[DEBUG] Google Gemini API Error: ${message}`);
    }
    throw new Error(message);
  }
}

// Cache shell info to avoid repeated detection
let cachedShellInfo: ShellInfo | null = null;

export function getShellInfo(): ShellInfo {
  if (!cachedShellInfo) {
    cachedShellInfo = detectShell();
  }
  return cachedShellInfo;
}

export async function translateToCommand(apiKey: string, model: Model | CustomModel, userInput: string, cwd: string, history: CommandHistory[] = [], repoContextEnabled?: boolean): Promise<string> {
  const shellInfo = getShellInfo();
  const systemPrompt = buildSystemPrompt(cwd, history, shellInfo, repoContextEnabled);
  let rawCommand: string;

  // Handle custom models (LM Studio, Ollama, etc.)
  if (isCustomModel(model)) {
    rawCommand = await callCustomModel(model, systemPrompt, userInput);
  } else if (model.provider === "openrouter") {
    rawCommand = await callOpenRouter(apiKey, model.id, systemPrompt, userInput);
  } else {
    // OpenCode Zen - determine API type
    const apiType = getZenApiType(model.id);
    switch (apiType) {
      case "openai-responses":
        rawCommand = await callZenOpenAIResponses(apiKey, model.id, systemPrompt, userInput);
        break;
      case "anthropic":
        rawCommand = await callZenAnthropic(apiKey, model.id, systemPrompt, userInput);
        break;
      case "google":
        rawCommand = await callZenGoogle(apiKey, model.id, systemPrompt, userInput);
        break;
      case "openai-compatible":
        rawCommand = await callZenOpenAICompatible(apiKey, model.id, systemPrompt, userInput);
        break;
    }
  }

  const cleaned = cleanCommand(rawCommand);
  if (!cleaned) {
    throw new Error("Model returned an empty command. Try another model or rephrase your request.");
  }
  return cleaned;
}
