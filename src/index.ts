#!/usr/bin/env bun

/**
 * Magic Shell - Natural language to terminal commands
 *
 * Usage:
 *   msh "list all files"           # Translate and print command
 *   msh -x "delete node_modules"   # Translate and execute
 *   msh -n "find large files"      # Dry run (show what would execute)
 *   msh --setup                    # Configure API keys
 *   msh --add-model                # Add custom model (LM Studio, Ollama, etc.)
 *   msh --list-custom              # List custom models
 *   msh --remove-model <id>        # Remove custom model
 *   msh --help                     # Show help
 *
 *   mshell                         # Interactive TUI mode (separate command)
 */

import { spawn } from "child_process";
import { cwd as getCwd } from "process";
import { OPENCODE_ZEN_MODELS, OPENROUTER_MODELS, ALL_MODELS, type Model, type Provider, type CustomModel } from "./lib/types";
import { loadConfig, saveConfig, getApiKey, setApiKey, loadHistory, addCustomModel, removeCustomModel, getCustomModels, getCustomModel } from "./lib/config";
import { analyzeCommand } from "./lib/safety";
import { translateToCommand, getShellInfo } from "./lib/api";
import { getAnsiColors, getTheme, setTheme, themes, themeNames, loadTheme } from "./lib/theme";
import { checkForUpdates, dismissUpdate, getCurrentVersion, forceCheckForUpdates } from "./lib/update-checker";

// Load theme from config
loadTheme();

// Get ANSI colors from current theme
const getColors = () => {
  const t = getAnsiColors();
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
  };
};

let colors = getColors();

function printHelp() {
  console.log(`
${colors.bold}${colors.primary}magic-shell${colors.reset} - Natural language to terminal commands

${colors.bold}USAGE${colors.reset}
  msh <query>              Translate query to command and print it
  msh -x <query>           Translate and execute the command
  msh -n <query>           Dry run - show command with safety analysis
  msh --setup              Configure API keys and provider
  msh --models             List available models
  msh --model <id>         Set default model (including custom)
  msh --add-model          Add custom model (LM Studio, Ollama, etc.)
  msh --list-custom        List custom models
  msh --remove-model <id>  Remove custom model
  msh --provider <name>    Set provider (opencode-zen or openrouter)
  msh --themes             List available themes
  msh --theme <name>       Set color theme
  msh --repo-context       Enable project context detection
  msh --no-repo-context    Disable project context detection
  msh --safety <level>     Set safety level (strict, moderate, relaxed)
  msh --version            Show version
  msh --check-update       Check for updates
  msh --help               Show this help

${colors.bold}TUI MODE${colors.reset}
  mshell                   Launch interactive TUI with themes, history, shortcuts

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}# Just get the command${colors.reset}
  msh "list all javascript files"
  
  ${colors.dim}# Execute directly${colors.reset}
  msh -x "show disk usage"
  
  ${colors.dim}# Check what would run${colors.reset}
  msh -n "delete all log files"
  
  ${colors.dim}# Use project context (knows your npm scripts, etc)${colors.reset}
  msh -r "run the dev server"
  
  ${colors.dim}# Pipe to clipboard (macOS)${colors.reset}
  msh "find large files" | pbcopy

${colors.bold}THEMES${colors.reset}
  opencode, tokyonight, catppuccin, gruvbox, nord, dracula, one-dark, matrix

${colors.bold}ENVIRONMENT${colors.reset}
  OPENCODE_ZEN_API_KEY     API key for OpenCode Zen
  OPENROUTER_API_KEY       API key for OpenRouter

${colors.bold}CONFIG${colors.reset}
  ~/.magic-shell/config.json
`);
}

function printModels() {
  const config = loadConfig();
  const customModels = getCustomModels();

  console.log(`\n${colors.bold}OpenCode Zen Models${colors.reset}`);
  console.log(`${colors.dim}(* = free, X = temporarily disabled)${colors.reset}\n`);

  const sortedZenModels = [...OPENCODE_ZEN_MODELS].sort((a, b) => a.name.localeCompare(b.name));
  for (const model of sortedZenModels) {
    const isCurrent = config.provider === "opencode-zen" && config.defaultModel === model.id;
    const marker = isCurrent ? colors.success + "→ " : "  ";
    const free = model.free ? colors.success + " *" + colors.reset : "";
    const disabled = model.disabled ? colors.error + " X" + colors.reset : "";
    const category = colors.dim + `[${model.category}]` + colors.reset;
    const name = model.disabled ? colors.dim + model.id + colors.reset : model.id;
    console.log(`${marker}${name}${free}${disabled} ${category}`);
    if (model.disabled && model.disabledReason) {
      console.log(`    ${colors.error}${model.disabledReason}${colors.reset}`);
    } else {
      console.log(`    ${colors.dim}${model.description}${colors.reset}`);
    }
  }

  console.log(`\n${colors.bold}OpenRouter Models${colors.reset}\n`);

  const sortedRouterModels = [...OPENROUTER_MODELS].sort((a, b) => a.name.localeCompare(b.name));
  for (const model of sortedRouterModels) {
    const isCurrent = config.provider === "openrouter" && config.defaultModel === model.id;
    const marker = isCurrent ? colors.success + "→ " : "  ";
    const free = model.free ? colors.success + " *" + colors.reset : "";
    const disabled = model.disabled ? colors.error + " X" + colors.reset : "";
    const category = colors.dim + `[${model.category}]` + colors.reset;
    const name = model.disabled ? colors.dim + model.id + colors.reset : model.id;
    console.log(`${marker}${name}${free}${disabled} ${category}`);
    if (model.disabled && model.disabledReason) {
      console.log(`    ${colors.error}${model.disabledReason}${colors.reset}`);
    } else {
      console.log(`    ${colors.dim}${model.description}${colors.reset}`);
    }
  }

  // Custom models section
  if (customModels.length > 0) {
    console.log(`\n${colors.bold}Custom Models${colors.reset} ${colors.info}(custom)${colors.reset}\n`);
    const sortedCustomModels = [...customModels].sort((a, b) => a.name.localeCompare(b.name));
    for (const model of sortedCustomModels) {
      const isCurrent = config.defaultModel === model.id;
      const marker = isCurrent ? colors.success + "→ " : "  ";
      const category = colors.dim + `[${model.category}]` + colors.reset;
      console.log(`${marker}${model.id} ${colors.info}(custom)${colors.reset} ${category}`);
      console.log(`    ${colors.dim}${model.name} - ${model.baseUrl}${colors.reset}`);
    }
  }

  console.log();
}

/**
 * Validate API key format based on provider
 * Returns error message if invalid, null if valid
 */
function validateApiKey(key: string, provider: Provider): string | null {
  const trimmed = key.trim();

  if (trimmed.length === 0) {
    return "API key cannot be empty";
  }

  if (trimmed.length < 20) {
    return "API key seems too short (expected at least 20 characters)";
  }

  // Both providers use sk- prefix (OpenRouter uses sk-or-, OpenCode Zen uses sk-)
  if (!trimmed.startsWith("sk-")) {
    const providerName = provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter";
    return `${providerName} API keys typically start with 'sk-'`;
  }

  // Check for common copy-paste errors
  if (trimmed.includes(" ")) {
    return "API key contains spaces - check for copy-paste errors";
  }

  if (trimmed.includes("\n") || trimmed.includes("\r")) {
    return "API key contains newlines - check for copy-paste errors";
  }

  return null;
}

async function setup() {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log(`\n${colors.bold}${colors.cyan}Magic Shell Setup${colors.reset}\n`);

  // Provider selection
  console.log("Select provider:");
  console.log("  1. OpenCode Zen (recommended, has free models)");
  console.log("  2. OpenRouter");

  const providerChoice = await question("\nChoice [1]: ");
  const provider: Provider = providerChoice === "2" ? "openrouter" : "opencode-zen";

  // API key
  const existingKey = await getApiKey(provider);
  if (existingKey) {
    const useExisting = await question(`\nAPI key already configured. Keep it? [Y/n]: `);
    if (useExisting.toLowerCase() !== "n") {
      console.log(`${colors.green}✓ Using existing API key${colors.reset}`);
    } else {
      const url = provider === "opencode-zen" ? "https://opencode.ai/auth" : "https://openrouter.ai/keys";
      console.log(`\nGet your API key from: ${colors.cyan}${url}${colors.reset}`);

      let validKey = false;
      while (!validKey) {
        const newKey = await question("Enter API key: ");
        if (!newKey.trim()) {
          console.log(`${colors.yellow}Keeping existing API key${colors.reset}`);
          break;
        }

        const validationError = validateApiKey(newKey, provider);
        if (validationError) {
          console.log(`${colors.yellow}Warning: ${validationError}${colors.reset}`);
          const proceed = await question("Continue anyway? [y/N]: ");
          if (proceed.toLowerCase() !== "y") {
            continue;
          }
        }

        await setApiKey(provider, newKey.trim());
        console.log(`${colors.green}✓ API key saved${colors.reset}`);
        validKey = true;
      }
    }
  } else {
    const url = provider === "opencode-zen" ? "https://opencode.ai/auth" : "https://openrouter.ai/keys";
    console.log(`\nGet your API key from: ${colors.cyan}${url}${colors.reset}`);

    let validKey = false;
    while (!validKey) {
      const newKey = await question("Enter API key: ");
      if (!newKey.trim()) {
        console.log(`${colors.red}No API key provided. Exiting.${colors.reset}`);
        rl.close();
        process.exit(1);
      }

      const validationError = validateApiKey(newKey, provider);
      if (validationError) {
        console.log(`${colors.yellow}Warning: ${validationError}${colors.reset}`);
        const proceed = await question("Continue anyway? [y/N]: ");
        if (proceed.toLowerCase() !== "y") {
          continue;
        }
      }

      await setApiKey(provider, newKey.trim());
      console.log(`${colors.green}✓ API key saved${colors.reset}`);
      validKey = true;
    }
  }

  // Model selection
  const models = provider === "opencode-zen" ? OPENCODE_ZEN_MODELS : OPENROUTER_MODELS;
  const freeModels = models.filter((m) => m.free);

  console.log("\nRecommended models:");
  const displayModels = freeModels.length > 0 ? freeModels.slice(0, 5) : models.slice(0, 5);
  displayModels.forEach((m, i) => {
    const free = m.free ? colors.green + " (free)" + colors.reset : "";
    console.log(`  ${i + 1}. ${m.name}${free} - ${m.description}`);
  });

  const modelChoice = await question(`\nChoice [1]: `);
  const modelIndex = parseInt(modelChoice || "1") - 1;
  const selectedModel = displayModels[modelIndex] || displayModels[0];

  const config = loadConfig();
  config.provider = provider;
  config.defaultModel = selectedModel.id;
  saveConfig(config);

  console.log(`\n${colors.green}✓ Setup complete!${colors.reset}`);
  console.log(`  Provider: ${provider === "opencode-zen" ? "OpenCode Zen" : "OpenRouter"}`);
  console.log(`  Model: ${selectedModel.name}`);
  console.log(`\nTry: ${colors.cyan}msh "list all files"${colors.reset}\n`);

  rl.close();
}

function executeCommand(command: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd: getCwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      resolve({ code: 1, output: error.message });
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 0, output: stdout || stderr });
    });
  });
}

// Add custom model (interactive)
async function setupCustomModel() {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log(`\n${colors.bold}${colors.cyan}Add Custom Model${colors.reset}`);
  console.log(`For LM Studio, Ollama, or any OpenAI-compatible endpoint\n`);

  // Model ID (for referencing)
  const id = await question("Model ID (for referencing, e.g., my-local-llama): ");
  if (!id.trim()) {
    console.log(`${colors.red}Model ID is required${colors.reset}`);
    rl.close();
    return;
  }

  // Check if already exists
  const existing = getCustomModels().find((m) => m.id === id.trim());
  if (existing) {
    const replace = await question(`Model "${id}" already exists. Replace? [y/N]: `);
    if (replace.toLowerCase() !== "y") {
      console.log(`${colors.gray}Cancelled${colors.reset}`);
      rl.close();
      return;
    }
  }

  // Display name
  const name = await question("Display name (e.g., 'Local Llama 3.2'): ");
  if (!name.trim()) {
    console.log(`${colors.red}Display name is required${colors.reset}`);
    rl.close();
    return;
  }

  const description = await question("Description (optional, for model list): ");

  // API model ID
  const modelId = await question("API model ID (sent to server, e.g., llama-3.2-3b): ");
  if (!modelId.trim()) {
    console.log(`${colors.red}API model ID is required${colors.reset}`);
    rl.close();
    return;
  }

  // Base URL
  const defaultUrl = "http://127.0.0.1:1234/v1";
  const baseUrlInput = await question(`Base URL [${defaultUrl}]: `);
  const baseUrl = baseUrlInput.trim() || defaultUrl;

  // API key
  const apiKey = await question("API key (optional, press Enter to skip): ");

  // Context length
  const contextLengthInput = await question("Context length [8192]: ");
  const contextLength = parseInt(contextLengthInput) || 8192;

  // Category
  console.log("\nCategory:");
  console.log("  1. fast");
  console.log("  2. smart");
  console.log("  3. reasoning");
  const categoryChoice = await question("Choice [2]: ");
  const categories = ["fast", "smart", "reasoning"] as const;
  let choice = parseInt(categoryChoice, 10);
  if (Number.isNaN(choice) || choice < 1 || choice > categories.length) {
    choice = 2;
  }
  const category = categories[choice - 1];

  // Create and save
  const customModel: CustomModel = {
    id: id.trim(),
    name: name.trim(),
    description: description.trim() || undefined,
    modelId: modelId.trim(),
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim() || undefined,
    contextLength,
    category,
  };

  try {
    await addCustomModel(customModel);
    console.log(`\n${colors.green}✓ Added custom model "${id}"${colors.reset}`);
    console.log(`${colors.dim}Test with: msh --model ${id} "hello world"${colors.reset}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${colors.error}Error: ${message}${colors.reset}`);
  }

  rl.close();
}

// Simple spinner for loading states
function createSpinner(message: string) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const isTTY = process.stderr.isTTY;

  const interval = isTTY
    ? setInterval(() => {
        process.stderr.write(`\r${colors.primary}${frames[i]}${colors.reset} ${colors.dim}${message}${colors.reset}`);
        i = (i + 1) % frames.length;
      }, 80)
    : null;

  // For non-TTY, just print once
  if (!isTTY) {
    process.stderr.write(`${colors.dim}${message}...${colors.reset}\n`);
  }

  return {
    stop: () => {
      if (interval) {
        clearInterval(interval);
        process.stderr.write("\r\x1b[K"); // Clear line
      }
    },
  };
}

async function translate(query: string, options: { execute?: boolean; dryRun?: boolean; repoContext?: boolean }) {
  const config = loadConfig();
  const apiKey = await getApiKey(config.provider);

  // Find current model - check custom models first
  const customModel = await getCustomModel(config.defaultModel);
  const builtInModel = ALL_MODELS.find((m) => m.id === config.defaultModel);
  const model = customModel || builtInModel || (config.provider === "opencode-zen" ? OPENCODE_ZEN_MODELS[0] : OPENROUTER_MODELS[0]);

  // Check if we need an API key
  if (!customModel && !apiKey) {
    console.error(`${colors.red}Error: No API key configured.${colors.reset}`);
    console.error(`Run: ${colors.cyan}msh --setup${colors.reset}`);
    process.exit(1);
  }

  const history = loadHistory();
  const cwd = getCwd();

  // Use repo context from options (flag) or config
  const useRepoContext = options.repoContext ?? config.repoContext ?? false;

  // Show loading spinner
  const spinner = createSpinner(`Translating with ${customModel ? customModel.name : (model as Model).name}`);

  try {
    const command = await translateToCommand(apiKey, model, query, cwd, history, useRepoContext);
    spinner.stop();

    if (options.dryRun) {
      // Dry run - show command and safety analysis
      const safety = analyzeCommand(command, config);

      console.log(`${colors.dim}Query:${colors.reset} ${query}`);
      console.log(`${colors.dim}Model:${colors.reset} ${model.name}`);
      if (useRepoContext) {
        console.log(`${colors.dim}Project context:${colors.reset} enabled`);
      }
      console.log();
      console.log(`${colors.bold}Command:${colors.reset} ${command}`);

      if (safety.isDangerous) {
        const severityColor = safety.severity === "critical" ? colors.red : safety.severity === "high" ? colors.red : safety.severity === "medium" ? colors.yellow : colors.gray;
        console.log();
        console.log(`${severityColor}[${safety.severity.toUpperCase()}]${colors.reset} ${safety.reason}`);
      } else {
        console.log(`${colors.green}✓ Command appears safe${colors.reset}`);
      }
    } else if (options.execute) {
      // Execute mode
      const safety = analyzeCommand(command, config);

      if (safety.isDangerous && safety.severity !== "low") {
        console.error(`${colors.dim}Command:${colors.reset} ${command}`);
        const severityColor = safety.severity === "critical" ? colors.red : safety.severity === "high" ? colors.red : colors.yellow;
        console.error(`${severityColor}[${safety.severity.toUpperCase()}]${colors.reset} ${safety.reason}`);
        console.error(`${colors.yellow}Use -n to preview, or run the command manually.${colors.reset}`);
        process.exit(1);
      }

      const result = await executeCommand(command);
      process.exit(result.code);
    } else {
      // Default - just output the command (can be piped)
      console.log(command);
    }
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${colors.red}Error: ${message}${colors.reset}`);
    process.exit(1);
  }
}

// Show update notification if available (non-blocking)
async function showUpdateNotification() {
  try {
    const update = await checkForUpdates();
    if (update?.hasUpdate) {
      console.error(`${colors.cyan}┌─────────────────────────────────────────────────┐${colors.reset}`);
      console.error(
        `${colors.cyan}│${colors.reset}  ${colors.bold}Update available!${colors.reset} ${colors.dim}${update.currentVersion}${colors.reset} → ${colors.green}${update.latestVersion}${colors.reset}          ${colors.cyan}│${colors.reset}`,
      );
      console.error(`${colors.cyan}│${colors.reset}  Run: ${colors.yellow}${update.updateCommand}${colors.reset}   ${colors.cyan}│${colors.reset}`);
      console.error(`${colors.cyan}└─────────────────────────────────────────────────┘${colors.reset}`);
      console.error();
    }
  } catch {
    // Silently ignore update check errors
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Check for updates in background (don't block)
  const updatePromise = args.length > 0 && !args[0].startsWith("-i") ? showUpdateNotification() : Promise.resolve();

  if (args.length === 0) {
    // No args - show help pointing to mshell
    console.log(`${colors.bold}${colors.primary}magic-shell${colors.reset} - Natural language to terminal commands\n`);
    console.log(`${colors.bold}Quick CLI:${colors.reset}`);
    console.log(`  msh "your query"     Translate and print command`);
    console.log(`  msh -x "query"       Translate and execute`);
    console.log(`  msh -n "query"       Dry run with safety analysis`);
    console.log(`  msh --setup          Configure API key`);
    console.log(`  msh --help           Full help\n`);
    console.log(`${colors.bold}Interactive TUI:${colors.reset}`);
    console.log(`  ${colors.primary}mshell${colors.reset}               Launch TUI with themes, history, shortcuts\n`);
    return;
  }

  if (args[0] === "--help" || args[0] === "-h") {
    await updatePromise;
    printHelp();
    return;
  }

  if (args[0] === "--version" || args[0] === "-v") {
    console.log(`magic-shell v${getCurrentVersion()}`);
    return;
  }

  if (args[0] === "--check-update") {
    const update = await forceCheckForUpdates();
    if (update?.hasUpdate) {
      console.log(`${colors.green}Update available!${colors.reset} ${update.currentVersion} → ${update.latestVersion}`);
      console.log(`Run: ${colors.cyan}${update.updateCommand}${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ You're running the latest version (${getCurrentVersion()})${colors.reset}`);
    }
    return;
  }

  if (args[0] === "--setup") {
    await updatePromise;
    await setup();
    return;
  }

  if (args[0] === "--models") {
    await updatePromise;
    printModels();
    return;
  }

  if (args[0] === "--add-model") {
    await setupCustomModel();
    return;
  }

  if (args[0] === "--list-custom") {
    const customModels = getCustomModels();
    if (customModels.length === 0) {
      console.log(`${colors.dim}No custom models configured.${colors.reset}`);
      console.log(`Add one with: ${colors.primary}msh --add-model${colors.reset}`);
    } else {
      console.log(`\n${colors.bold}Custom Models${colors.reset}\n`);
      for (const model of customModels) {
        console.log(`${colors.info}${model.id}${colors.reset} - ${model.name}`);
        console.log(`  ${colors.dim}Model: ${model.modelId}${colors.reset}`);
        console.log(`  ${colors.dim}URL: ${model.baseUrl}${colors.reset}`);
        console.log(`  ${colors.dim}Category: ${model.category}${colors.reset}`);
        console.log();
      }
    }
    return;
  }

  if (args[0] === "--remove-model" && !args[1]) {
    console.error(`${colors.error}Model ID is required for --remove-model${colors.reset}`);
    process.exit(1);
  }

  if (args[0] === "--remove-model" && args[1]) {
    const modelId = args[1];
    const removed = await removeCustomModel(modelId);
    if (removed) {
      console.log(`${colors.success}✓ Removed custom model "${modelId}"${colors.reset}`);
    } else {
      console.error(`${colors.error}Custom model "${modelId}" not found${colors.reset}`);
      process.exit(1);
    }
    return;
  }

  if (args[0] === "--model" && args[1]) {
    const modelId = args[1];
    // Check custom models first
    const customModel = getCustomModels().find((m) => m.id === modelId);
    if (customModel) {
      const config = loadConfig();
      config.defaultModel = modelId;
      config.provider = "custom";
      saveConfig(config);
      console.log(`${colors.success}✓ Default model set to ${customModel.name}${colors.reset}`);
      console.log(`${colors.dim}(Custom model: ${customModel.baseUrl})${colors.reset}`);
      return;
    }

    const model = ALL_MODELS.find((m) => m.id === modelId);
    if (!model) {
      console.error(`${colors.error}Unknown model: ${modelId}${colors.reset}`);
      console.error(`Run ${colors.primary}msh --models${colors.reset} to see available models.`);
      process.exit(1);
    }
    if (model.disabled) {
      console.error(`${colors.error}Model ${model.name} is temporarily disabled: ${model.disabledReason}${colors.reset}`);
      console.error(`Run ${colors.primary}msh --models${colors.reset} to see available models.`);
      process.exit(1);
    }
    const config = loadConfig();
    config.defaultModel = modelId;
    config.provider = model.provider;
    saveConfig(config);
    console.log(`${colors.success}✓ Default model set to ${model.name}${colors.reset}`);
    return;
  }

  if (args[0] === "--provider" && args[1]) {
    const provider = args[1] as Provider;
    if (provider !== "opencode-zen" && provider !== "openrouter") {
      console.error(`${colors.error}Unknown provider: ${provider}${colors.reset}`);
      console.error(`Valid providers: opencode-zen, openrouter`);
      process.exit(1);
    }
    const config = loadConfig();
    config.provider = provider;
    // Reset to first non-disabled model of new provider
    const models = provider === "opencode-zen" ? OPENCODE_ZEN_MODELS : OPENROUTER_MODELS;
    const firstAvailable = models.find((m) => !m.disabled) || models[0];
    config.defaultModel = firstAvailable.id;
    saveConfig(config);
    console.log(`${colors.success}✓ Provider set to ${provider}${colors.reset}`);
    return;
  }

  if (args[0] === "--themes") {
    const currentTheme = getTheme();
    console.log(`\n${colors.bold}Available Themes${colors.reset}\n`);
    for (const name of themeNames) {
      const theme = themes[name];
      const isCurrent = name === currentTheme.name;
      const marker = isCurrent ? colors.success + "→ " + colors.reset : "  ";
      console.log(`${marker}${name}`);
    }
    console.log();
    return;
  }

  if (args[0] === "--theme" && args[1]) {
    const themeName = args[1];
    if (!themes[themeName]) {
      console.error(`${colors.error}Unknown theme: ${themeName}${colors.reset}`);
      console.error(`Available themes: ${themeNames.join(", ")}`);
      process.exit(1);
    }
    setTheme(themeName);
    colors = getColors(); // Refresh colors
    console.log(`${colors.success}✓ Theme set to ${themeName}${colors.reset}`);
    return;
  }

  // Handle --repo-context toggle
  if (args[0] === "--repo-context") {
    const config = loadConfig();
    config.repoContext = true;
    saveConfig(config);
    console.log(`${colors.success}✓ Project context enabled${colors.reset}`);
    console.log(`${colors.dim}Magic Shell will now detect package.json scripts, Makefile targets, etc.${colors.reset}`);
    return;
  }

  if (args[0] === "--no-repo-context") {
    const config = loadConfig();
    config.repoContext = false;
    saveConfig(config);
    console.log(`${colors.success}✓ Project context disabled${colors.reset}`);
    return;
  }

  if (args[0] === "--safety" && args[1]) {
    const level = args[1].toLowerCase();
    if (level !== "strict" && level !== "moderate" && level !== "relaxed") {
      console.error(`${colors.error}Unknown safety level: ${level}${colors.reset}`);
      console.error(`Valid levels: strict, moderate, relaxed`);
      console.error(`  strict   - Confirm all potentially dangerous commands`);
      console.error(`  moderate - Confirm high/critical severity commands (default)`);
      console.error(`  relaxed  - Only confirm critical commands`);
      process.exit(1);
    }
    const config = loadConfig();
    config.safetyLevel = level as "strict" | "moderate" | "relaxed";
    saveConfig(config);
    console.log(`${colors.success}✓ Safety level set to ${level}${colors.reset}`);
    return;
  }

  // Parse flags and query
  let execute = false;
  let dryRun = false;
  let repoContext: boolean | undefined = undefined;
  let queryParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-x" || arg === "--execute") {
      execute = true;
    } else if (arg === "-n" || arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "-r" || arg === "--repo-context") {
      repoContext = true;
    } else if (arg === "--no-repo-context") {
      repoContext = false;
    } else if (!arg.startsWith("-")) {
      queryParts.push(arg);
    }
  }

  const query = queryParts.join(" ");

  if (!query) {
    console.error(`${colors.red}Error: No query provided${colors.reset}`);
    console.error(`Usage: msh "your query here"`);
    process.exit(1);
  }

  await translate(query, { execute, dryRun, repoContext });
}

main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
