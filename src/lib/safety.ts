import type { SafetyAnalysis, Config } from "./types"

// Patterns that are always dangerous
const CRITICAL_PATTERNS = [
  /rm\s+(-[rf]+\s+)*[\/~](\s|$)/, // rm -rf / or ~
  /rm\s+(-[rf]+\s+)*\/\*/, // rm -rf /*
  /rm\s+-[rf]*\s+--no-preserve-root/, // rm with no-preserve-root
  />\s*\/dev\/sd[a-z]/, // overwrite disk
  /dd\s+.*of=\/dev\/sd[a-z]/, // dd to disk
  /mkfs\./, // format filesystem
  /:\(\)\s*\{.*\}/, // fork bomb
  /chmod\s+(-R\s+)?777\s+\//, // chmod 777 /
  /wget.*\|\s*(ba)?sh/, // pipe wget to shell
  /curl.*\|\s*(ba)?sh/, // pipe curl to shell
]

// Patterns that are high severity but may be intentional
const HIGH_PATTERNS = [
  /rm\s+-[rf]+/, // rm with force/recursive
  /sudo\s+rm/, // sudo rm
  />\s*\/etc\//, // overwrite /etc files
  /chmod\s+-R/, // recursive chmod
  /chown\s+-R/, // recursive chown
  /kill\s+-9\s+-1/, // kill all processes
  /killall/, // kill by name
  /pkill/, // pattern kill
  /shutdown/, // shutdown system
  /reboot/, // reboot system
  /systemctl\s+(stop|disable)/, // systemctl dangerous ops
  /service\s+.*\s+stop/, // stop services
]

// Patterns that are medium severity - common but need attention
const MEDIUM_PATTERNS = [
  /sudo\s+/, // any sudo command
  /rm\s+/, // any rm command
  /mv\s+.*\//, // move to root paths
  /cp\s+-[rf]/, // force/recursive copy
  /chmod\s+/, // any chmod
  /chown\s+/, // any chown
  /apt\s+(remove|purge)/, // package removal
  /brew\s+uninstall/, // brew uninstall
  /npm\s+uninstall\s+-g/, // global npm uninstall
  /pip\s+uninstall/, // pip uninstall
  /git\s+push\s+.*--force/, // force push
  /git\s+reset\s+--hard/, // hard reset
  /docker\s+rm/, // docker remove
  /docker\s+system\s+prune/, // docker prune
]

// Patterns that are low severity but worth noting
const LOW_PATTERNS = [
  /git\s+checkout/, // git checkout (may lose changes)
  /git\s+stash/, // git stash
  /npm\s+install/, // npm install (modifies node_modules)
  /pip\s+install/, // pip install
  /brew\s+install/, // brew install
  /apt\s+install/, // apt install
]

export function analyzeCommand(command: string, config: Config): SafetyAnalysis {
  const normalizedCommand = command.toLowerCase().trim()

  // Check blocked commands first
  for (const blocked of config.blockedCommands) {
    if (normalizedCommand.includes(blocked.toLowerCase())) {
      return {
        isDangerous: true,
        severity: "critical",
        reason: `Command contains blocked pattern: ${blocked}`,
        patterns: [blocked],
      }
    }
  }

  const matchedPatterns: string[] = []
  let highestSeverity: SafetyAnalysis["severity"] = "low"

  // Check critical patterns
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      matchedPatterns.push(pattern.source)
      highestSeverity = "critical"
    }
  }

  // Check high patterns
  if (highestSeverity !== "critical") {
    for (const pattern of HIGH_PATTERNS) {
      if (pattern.test(normalizedCommand)) {
        matchedPatterns.push(pattern.source)
        highestSeverity = "high"
      }
    }
  }

  // Check medium patterns
  for (const pattern of MEDIUM_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      matchedPatterns.push(pattern.source)
      if (highestSeverity === "low") {
        highestSeverity = "medium"
      }
    }
  }

  // Check low patterns (only if nothing else matched)
  if (matchedPatterns.length === 0) {
    for (const pattern of LOW_PATTERNS) {
      if (pattern.test(normalizedCommand)) {
        matchedPatterns.push(pattern.source)
      }
    }
  }

  // Determine if dangerous based on safety level
  let isDangerous = false
  if (config.safetyLevel === "strict") {
    isDangerous = matchedPatterns.length > 0
  } else if (config.safetyLevel === "moderate") {
    isDangerous = highestSeverity === "critical" || highestSeverity === "high"
  } else {
    // relaxed
    isDangerous = highestSeverity === "critical"
  }

  // Check if user has previously confirmed this pattern
  const wasConfirmed = config.confirmedDangerousPatterns.some((p) =>
    normalizedCommand.includes(p.toLowerCase())
  )

  if (wasConfirmed && highestSeverity !== "critical") {
    isDangerous = false
  }

  return {
    isDangerous,
    severity: matchedPatterns.length > 0 ? highestSeverity : "low",
    reason: isDangerous ? getSeverityMessage(highestSeverity) : undefined,
    patterns: matchedPatterns,
  }
}

function getSeverityMessage(severity: SafetyAnalysis["severity"]): string {
  switch (severity) {
    case "critical":
      return "This command could cause irreversible damage to your system!"
    case "high":
      return "This command may cause significant changes or data loss."
    case "medium":
      return "This command requires elevated privileges or modifies system state."
    case "low":
      return "This command may make changes worth reviewing."
  }
}

export function getSeverityColor(severity: SafetyAnalysis["severity"]): string {
  switch (severity) {
    case "critical":
      return "#FF0000" // red
    case "high":
      return "#FF6600" // orange
    case "medium":
      return "#FFCC00" // yellow
    case "low":
      return "#00CC00" // green
  }
}
