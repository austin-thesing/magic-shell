/**
 * Theme system compatible with OpenCode themes
 * Themes from: https://github.com/anomalyco/opencode/tree/dev/packages/opencode/src/cli/cmd/tui/context/theme
 */

import { loadConfig, saveConfig } from "./config"

export interface ThemeColors {
  // Core UI
  primary: string
  secondary: string
  accent: string
  
  // Semantic
  error: string
  warning: string
  success: string
  info: string
  
  // Text
  text: string
  textMuted: string
  
  // Backgrounds
  background: string
  backgroundPanel: string
  backgroundElement: string
  
  // Borders
  border: string
  borderActive: string
  borderSubtle: string
}

export interface Theme {
  name: string
  colors: ThemeColors
}

// OpenCode default theme
const opencode: Theme = {
  name: "opencode",
  colors: {
    primary: "#fab283",
    secondary: "#5c9cf5",
    accent: "#9d7cd8",
    error: "#e06c75",
    warning: "#f5a742",
    success: "#7fd88f",
    info: "#56b6c2",
    text: "#eeeeee",
    textMuted: "#808080",
    background: "#0a0a0a",
    backgroundPanel: "#141414",
    backgroundElement: "#1e1e1e",
    border: "#484848",
    borderActive: "#606060",
    borderSubtle: "#3c3c3c",
  },
}

// Tokyo Night
const tokyonight: Theme = {
  name: "tokyonight",
  colors: {
    primary: "#82aaff",
    secondary: "#c099ff",
    accent: "#ff966c",
    error: "#ff757f",
    warning: "#ff966c",
    success: "#c3e88d",
    info: "#82aaff",
    text: "#c8d3f5",
    textMuted: "#828bb8",
    background: "#1a1b26",
    backgroundPanel: "#1e2030",
    backgroundElement: "#222436",
    border: "#737aa2",
    borderActive: "#9099b2",
    borderSubtle: "#545c7e",
  },
}

// Catppuccin Mocha
const catppuccin: Theme = {
  name: "catppuccin",
  colors: {
    primary: "#89b4fa",
    secondary: "#cba6f7",
    accent: "#f5c2e7",
    error: "#f38ba8",
    warning: "#f9e2af",
    success: "#a6e3a1",
    info: "#94e2d5",
    text: "#cdd6f4",
    textMuted: "#bac2de",
    background: "#1e1e2e",
    backgroundPanel: "#181825",
    backgroundElement: "#11111b",
    border: "#313244",
    borderActive: "#45475a",
    borderSubtle: "#585b70",
  },
}

// Gruvbox Dark
const gruvbox: Theme = {
  name: "gruvbox",
  colors: {
    primary: "#83a598",
    secondary: "#d3869b",
    accent: "#8ec07c",
    error: "#fb4934",
    warning: "#fe8019",
    success: "#b8bb26",
    info: "#fabd2f",
    text: "#ebdbb2",
    textMuted: "#928374",
    background: "#282828",
    backgroundPanel: "#3c3836",
    backgroundElement: "#504945",
    border: "#665c54",
    borderActive: "#ebdbb2",
    borderSubtle: "#504945",
  },
}

// Nord
const nord: Theme = {
  name: "nord",
  colors: {
    primary: "#88C0D0",
    secondary: "#81A1C1",
    accent: "#8FBCBB",
    error: "#BF616A",
    warning: "#D08770",
    success: "#A3BE8C",
    info: "#88C0D0",
    text: "#ECEFF4",
    textMuted: "#8B95A7",
    background: "#2E3440",
    backgroundPanel: "#3B4252",
    backgroundElement: "#434C5E",
    border: "#434C5E",
    borderActive: "#4C566A",
    borderSubtle: "#434C5E",
  },
}

// Dracula
const dracula: Theme = {
  name: "dracula",
  colors: {
    primary: "#bd93f9",
    secondary: "#ff79c6",
    accent: "#8be9fd",
    error: "#ff5555",
    warning: "#ffb86c",
    success: "#50fa7b",
    info: "#8be9fd",
    text: "#f8f8f2",
    textMuted: "#6272a4",
    background: "#282a36",
    backgroundPanel: "#21222c",
    backgroundElement: "#1e1f29",
    border: "#44475a",
    borderActive: "#6272a4",
    borderSubtle: "#383a46",
  },
}

// One Dark
const oneDark: Theme = {
  name: "one-dark",
  colors: {
    primary: "#61afef",
    secondary: "#c678dd",
    accent: "#56b6c2",
    error: "#e06c75",
    warning: "#d19a66",
    success: "#98c379",
    info: "#61afef",
    text: "#abb2bf",
    textMuted: "#5c6370",
    background: "#282c34",
    backgroundPanel: "#21252b",
    backgroundElement: "#1e2227",
    border: "#3e4451",
    borderActive: "#4d5566",
    borderSubtle: "#353b45",
  },
}

// Matrix (fun one)
const matrix: Theme = {
  name: "matrix",
  colors: {
    primary: "#00ff00",
    secondary: "#00cc00",
    accent: "#00ff66",
    error: "#ff0000",
    warning: "#ffff00",
    success: "#00ff00",
    info: "#00ffff",
    text: "#00ff00",
    textMuted: "#008800",
    background: "#000000",
    backgroundPanel: "#001100",
    backgroundElement: "#002200",
    border: "#003300",
    borderActive: "#00ff00",
    borderSubtle: "#002200",
  },
}

// All available themes
export const themes: Record<string, Theme> = {
  opencode,
  tokyonight,
  catppuccin,
  gruvbox,
  nord,
  dracula,
  "one-dark": oneDark,
  matrix,
}

export const themeNames = Object.keys(themes)

// Current theme (loaded from config)
let currentTheme: Theme = opencode

export function getTheme(): Theme {
  return currentTheme
}

export function setTheme(name: string): boolean {
  const theme = themes[name]
  if (!theme) return false
  
  currentTheme = theme
  
  // Save to config
  const config = loadConfig()
  ;(config as any).theme = name
  saveConfig(config)
  
  return true
}

export function loadTheme(): void {
  const config = loadConfig()
  const themeName = (config as any).theme || "opencode"
  currentTheme = themes[themeName] || opencode
}

// Helper to convert hex to ANSI 24-bit color escape code
function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `\x1b[38;2;${r};${g};${b}m`
}

// ANSI escape codes using current theme
export function getAnsiColors() {
  const t = currentTheme.colors
  return {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    
    primary: hexToAnsi(t.primary),
    secondary: hexToAnsi(t.secondary),
    accent: hexToAnsi(t.accent),
    
    text: hexToAnsi(t.text),
    textMuted: hexToAnsi(t.textMuted),
    
    error: hexToAnsi(t.error),
    warning: hexToAnsi(t.warning),
    success: hexToAnsi(t.success),
    info: hexToAnsi(t.info),
  }
}

// Initialize theme on module load
loadTheme()
