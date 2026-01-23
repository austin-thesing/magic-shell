# Magic Shell

> Transform natural language into terminal commands with built-in safety features.

Magic Shell is an open-source CLI tool that translates plain English (or any natural language) into shell commands using AI. It supports multiple AI providers, includes a beautiful interactive TUI mode, and features a comprehensive safety system to protect you from dangerous commands.

## Features

- **Natural Language Translation**: Describe what you want to do in plain English
- **Multiple AI Providers**: OpenCode Zen (with free models!) and OpenRouter
- **Interactive TUI Mode**: Full-featured terminal interface with themes
- **Command Safety Analysis**: Multi-level safety checks before executing commands
- **Cross-Platform**: macOS, Linux, and Windows support
- **Shell-Aware**: Automatically detects and adapts to your shell (bash, zsh, fish, PowerShell, etc.)
- **Secure Credential Storage**: Uses system keychain (macOS Keychain, Linux secret-tool, Windows Credential Manager)
- **Command History**: Context-aware translations based on your recent commands
- **Beautiful Themes**: 8 built-in themes including Tokyo Night, Catppuccin, Dracula, and more

## Installation

### Quick Install (Recommended)

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/austin-thesing/magic-shell/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/austin-thesing/magic-shell/main/install.ps1 | iex
```

### Via npm

```bash
# Install globally with npm
npm install -g magic-shell

# Or with yarn
yarn global add magic-shell

# Or with pnpm
pnpm add -g magic-shell

# Or with bun
bun add -g magic-shell
```

### Via Homebrew (macOS/Linux)

```bash
brew install austin-thesing/tap/magic-shell
```

### From Source

**Prerequisites:** [Bun](https://bun.sh) runtime (v1.0 or higher)

```bash
# Clone the repository
git clone https://github.com/austin-thesing/magic-shell.git
cd magic-shell

# Install dependencies
bun install

# Build
bun run build

# Link globally (optional)
bun link
```

### Quick Start

```bash
# Run setup to configure your API key
msh --setup

# Or set via environment variable
export OPENCODE_ZEN_API_KEY="your-key-here"
```

## Usage

Magic Shell can be invoked using `magic-shell`, `msh`, or `ms`.

### Basic Commands

```bash
# Translate a query to a command (prints the command)
msh "list all javascript files"
# Output: find . -name "*.js"

# Translate and execute
msh -x "show disk usage"

# Dry run - preview with safety analysis
msh -n "delete all node_modules folders"

# Launch interactive TUI mode
msh -i
# or just
msh
```

### Command Reference

| Command | Description |
|---------|-------------|
| `msh <query>` | Translate query to command and print it |
| `msh -x <query>` | Translate and execute the command |
| `msh -n <query>` | Dry run - show command with safety analysis |
| `msh -i, --interactive` | Launch interactive TUI mode |
| `msh --setup` | Configure API keys and provider |
| `msh --models` | List available models |
| `msh --model <id>` | Set default model |
| `msh --provider <name>` | Set provider (opencode-zen or openrouter) |
| `msh --themes` | List available themes |
| `msh --theme <name>` | Set color theme |
| `msh --help` | Show help |

### Examples

```bash
# File operations
msh "find all files larger than 100MB"
msh "count lines of code in this project"
msh "show the 10 most recently modified files"

# Git operations
msh "undo my last commit but keep changes"
msh "show commits from the last week"
msh "create a branch from main called feature-login"

# System operations
msh "check which process is using port 3000"
msh "show memory usage"
msh "list all running docker containers"

# Execute directly
msh -x "show current git branch"

# Pipe to clipboard (macOS)
msh "compress this folder to a zip file" | pbcopy
```

## Interactive TUI Mode

Launch with `msh` or `msh -i` for a full interactive experience.

### Keyboard Shortcuts

All shortcuts use the `Ctrl+X` chord (press Ctrl+X, then the key):

| Shortcut | Action |
|----------|--------|
| `Ctrl+X P` | Open command palette |
| `Ctrl+X M` | Change model |
| `Ctrl+X S` | Switch provider |
| `Ctrl+X D` | Toggle dry-run mode |
| `Ctrl+X T` | Change theme |
| `Ctrl+X H` | Show history |
| `Ctrl+X C` | Show config |
| `Ctrl+X L` | Clear output |
| `Ctrl+X ?` | Show help |
| `Ctrl+X Q` | Exit |
| `Ctrl+C` | Exit / Cancel |
| `Esc` | Close dialogs |

### Direct Commands in TUI

You can also type commands directly in the TUI:

- `!help` - Show help
- `!model` - Change model
- `!provider` - Switch provider
- `!dry` - Toggle dry-run mode
- `!config` - Show current configuration
- `!history` - Show command history
- `!clear` - Clear output

## AI Providers

### OpenCode Zen (Recommended)

OpenCode Zen provides curated models optimized for coding tasks, including **free models**.

**Free Models:**
- `grok-code` - xAI's Grok Code Fast 1
- `glm-4.7-free` - GLM 4.7
- `minimax-m2.1-free` - MiniMax M2.1
- `big-pickle` - Stealth model

**Premium Models:**
- Claude Sonnet 4.5, Claude Opus 4.5
- Gemini 3 Flash, Gemini 3 Pro
- Kimi K2, Kimi K2 Thinking
- Qwen3 Coder 480B
- And more...

Get your API key at: https://opencode.ai/auth

### OpenRouter

Access to a wide variety of models from different providers.

**Free Models:**
- MiMo V2 Flash
- DeepSeek V3
- Gemini 2.5 Flash

**Premium Models:**
- Claude Sonnet 4.5, Claude Opus 4.5
- GPT 5.2 Codex
- Gemini 2.5 Pro
- DeepSeek R1
- And many more...

Get your API key at: https://openrouter.ai/keys

## Safety System

Magic Shell includes a comprehensive safety analysis system that categorizes commands by risk level:

### Severity Levels

| Level | Description | Examples |
|-------|-------------|----------|
| **Critical** | Could cause irreversible system damage | `rm -rf /`, fork bombs, disk overwrites |
| **High** | Significant changes or data loss risk | `sudo rm`, `kill -9 -1`, `shutdown` |
| **Medium** | Requires elevated privileges | `sudo`, `chmod`, package removal |
| **Low** | Worth reviewing | `git checkout`, `npm install` |

### Safety Levels

Configure your preferred safety level:

- **Strict**: Confirm all potentially risky commands
- **Moderate** (default): Confirm high and critical severity commands
- **Relaxed**: Only confirm critical severity commands

### Blocked Commands

Certain dangerous patterns are always blocked:
- Fork bombs
- Direct disk writes (`> /dev/sda`)
- Filesystem formatting (`mkfs`)
- Recursive permission changes on root (`chmod -R 777 /`)

## Configuration

Configuration is stored in `~/.magic-shell/config.json`.

### Config Options

```json
{
  "provider": "opencode-zen",
  "defaultModel": "grok-code",
  "safetyLevel": "moderate",
  "dryRunByDefault": false,
  "theme": "opencode",
  "blockedCommands": [...],
  "confirmedDangerousPatterns": [...]
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCODE_ZEN_API_KEY` | API key for OpenCode Zen |
| `OPENROUTER_API_KEY` | API key for OpenRouter |
| `DEBUG_API=1` | Enable API response debugging |

## Themes

Magic Shell includes 8 beautiful themes:

- `opencode` (default) - Orange and blue tones
- `tokyonight` - Soft purple and blue
- `catppuccin` - Pastel Mocha variant
- `gruvbox` - Retro warm tones
- `nord` - Arctic cool blues
- `dracula` - Purple vampire vibes
- `one-dark` - Atom-inspired
- `matrix` - Classic green terminal

Change themes:
```bash
# CLI
msh --theme tokyonight

# TUI
Ctrl+X T
```

## Shell Support

Magic Shell automatically detects and adapts to your shell:

- **Bash** - Full support with bash-specific syntax
- **Zsh** - Extended globbing and array syntax
- **Fish** - Fish-specific syntax (no `$()`, different variable syntax)
- **PowerShell / pwsh** - Cmdlet syntax and object pipelines
- **CMD** - Windows command syntax
- **Nushell** - Structured data syntax
- **POSIX sh** - Portable fallback

## Platform Support

| Platform | Shell Detection | Keychain Storage |
|----------|-----------------|------------------|
| macOS | Full | macOS Keychain |
| Linux | Full | libsecret (secret-tool) |
| Windows | Full | Credential Manager |
| WSL | Full (detected) | libsecret |

## Development

```bash
# Run in development mode
bun run dev

# Run TUI in development mode
bun run dev:tui

# Type check
bun run typecheck

# Build for distribution
bun run build
```

### Project Structure

```
src/
  index.ts          # CLI entry point
  cli.ts            # TUI mode
  lib/
    types.ts        # Type definitions and model configs
    config.ts       # Configuration management
    api.ts          # AI provider integrations
    safety.ts       # Command safety analysis
    theme.ts        # Theme system
    keychain.ts     # Secure credential storage
    shell.ts        # Shell/platform detection
```

## Publishing to npm

### Prerequisites

1. Create an npm account at https://www.npmjs.com/signup
2. Login to npm:
   ```bash
   npm login
   ```

### Preparing for Release

1. **Update package.json** - Ensure these fields are set correctly:

   ```json
   {
     "name": "magic-shell",
     "version": "0.1.0",
     "description": "Natural language to terminal commands with safety features",
     "main": "dist/index.js",
     "bin": {
       "magic-shell": "./dist/index.js",
       "msh": "./dist/index.js",
       "ms": "./dist/index.js"
     },
     "files": [
       "dist",
       "README.md",
       "LICENSE"
     ],
     "repository": {
       "type": "git",
       "url": "https://github.com/austin-thesing/magic-shell.git"
     },
     "homepage": "https://github.com/austin-thesing/magic-shell#readme",
     "bugs": {
       "url": "https://github.com/austin-thesing/magic-shell/issues"
     },
     "keywords": [
       "cli",
       "terminal",
       "natural-language",
       "shell",
       "ai",
       "openrouter",
       "opencode",
       "command-line"
     ],
     "author": "Your Name <your@email.com>",
     "license": "MIT"
   }
   ```

2. **Build the project:**
   ```bash
   bun run build
   ```

3. **Test locally before publishing:**
   ```bash
   # Create a tarball
   npm pack
   
   # Install it globally to test
   npm install -g ./magic-shell-0.1.0.tgz
   
   # Test it works
   msh --help
   
   # Uninstall test version
   npm uninstall -g magic-shell
   ```

### Publishing

```bash
# Publish to npm (first time)
npm publish

# Publish with public access (for scoped packages like @your-username/magic-shell)
npm publish --access public
```

### Releasing New Versions

1. **Update version** (follows [semver](https://semver.org/)):
   ```bash
   # Patch release (bug fixes): 0.1.0 -> 0.1.1
   npm version patch
   
   # Minor release (new features): 0.1.0 -> 0.2.0
   npm version minor
   
   # Major release (breaking changes): 0.1.0 -> 1.0.0
   npm version major
   ```

2. **Push tags to GitHub:**
   ```bash
   git push origin main --tags
   ```

3. **Publish the new version:**
   ```bash
   npm publish
   ```

### Automated Releases with GitHub Actions

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install
      
      - name: Build
        run: bun run build
      
      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

Add your npm token to GitHub:
1. Generate token at https://www.npmjs.com/settings/tokens (use "Automation" type)
2. Add to repository secrets as `NPM_TOKEN`

### Version Management Tips

- Use `npm version` commands - they automatically:
  - Update `package.json` version
  - Create a git commit
  - Create a git tag

- Consider using [Changesets](https://github.com/changesets/changesets) for monorepo or complex versioning

- Add a `prepublishOnly` script to ensure builds are fresh:
  ```json
  {
    "scripts": {
      "prepublishOnly": "bun run build"
    }
  }
  ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Bun](https://bun.sh)
- TUI powered by [@opentui/core](https://github.com/opentui/core)
- Theme colors inspired by [OpenCode](https://github.com/anomalyco/opencode)

---

**Magic Shell** - Type what you mean, execute what you need.
