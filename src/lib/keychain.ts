import { execSync, spawnSync } from "child_process"

const SERVICE_NAME = "magic-shell"

/**
 * Store a secret in the system keychain/credential manager
 * - macOS: Keychain
 * - Linux: libsecret (secret-tool)
 * - Windows: Credential Manager (cmdkey)
 */
export async function setSecret(key: string, value: string): Promise<boolean> {
  switch (process.platform) {
    case "darwin":
      return setSecretMacOS(key, value)
    case "linux":
      return setSecretLinux(key, value)
    case "win32":
      return setSecretWindows(key, value)
    default:
      return false
  }
}

/**
 * Retrieve a secret from the system keychain/credential manager
 */
export async function getSecret(key: string): Promise<string | null> {
  switch (process.platform) {
    case "darwin":
      return getSecretMacOS(key)
    case "linux":
      return getSecretLinux(key)
    case "win32":
      return getSecretWindows(key)
    default:
      return null
  }
}

/**
 * Delete a secret from the system keychain/credential manager
 */
export async function deleteSecret(key: string): Promise<boolean> {
  switch (process.platform) {
    case "darwin":
      return deleteSecretMacOS(key)
    case "linux":
      return deleteSecretLinux(key)
    case "win32":
      return deleteSecretWindows(key)
    default:
      return false
  }
}

// =============================================================================
// macOS implementation using `security` command
// =============================================================================

function setSecretMacOS(key: string, value: string): boolean {
  try {
    // First try to delete any existing entry (ignore errors)
    try {
      execSync(
        `security delete-generic-password -s "${SERVICE_NAME}" -a "${key}" 2>/dev/null`,
        { encoding: "utf-8" }
      )
    } catch {
      // Ignore - entry might not exist
    }

    // Add the new password
    execSync(
      `security add-generic-password -s "${SERVICE_NAME}" -a "${key}" -w "${value}"`,
      { encoding: "utf-8" }
    )
    return true
  } catch {
    return false
  }
}

function getSecretMacOS(key: string): string | null {
  try {
    const result = execSync(
      `security find-generic-password -s "${SERVICE_NAME}" -a "${key}" -w 2>/dev/null`,
      { encoding: "utf-8" }
    )
    return result.trim()
  } catch {
    return null
  }
}

function deleteSecretMacOS(key: string): boolean {
  try {
    execSync(
      `security delete-generic-password -s "${SERVICE_NAME}" -a "${key}" 2>/dev/null`,
      { encoding: "utf-8" }
    )
    return true
  } catch {
    return false
  }
}

// =============================================================================
// Linux implementation using `secret-tool` (libsecret)
// =============================================================================

function setSecretLinux(key: string, value: string): boolean {
  try {
    // secret-tool reads password from stdin
    const result = spawnSync("secret-tool", [
      "store",
      "--label", `${SERVICE_NAME} ${key}`,
      "service", SERVICE_NAME,
      "account", key,
    ], {
      input: value,
      encoding: "utf-8",
    })
    return result.status === 0
  } catch {
    return false
  }
}

function getSecretLinux(key: string): string | null {
  try {
    const result = execSync(
      `secret-tool lookup service "${SERVICE_NAME}" account "${key}" 2>/dev/null`,
      { encoding: "utf-8" }
    )
    return result.trim() || null
  } catch {
    return null
  }
}

function deleteSecretLinux(key: string): boolean {
  try {
    execSync(
      `secret-tool clear service "${SERVICE_NAME}" account "${key}" 2>/dev/null`,
      { encoding: "utf-8" }
    )
    return true
  } catch {
    return false
  }
}

// =============================================================================
// Windows implementation using PowerShell and Windows Credential Manager
// =============================================================================

function setSecretWindows(key: string, value: string): boolean {
  try {
    const targetName = `${SERVICE_NAME}:${key}`
    
    // First remove existing credential (ignore errors)
    try {
      execSync(`cmdkey /delete:${targetName}`, {
        encoding: "utf-8",
        stdio: "pipe",
      })
    } catch {
      // Ignore
    }

    // Add new credential using cmdkey
    // Escape special characters in the value
    const escapedValue = value.replace(/"/g, '""')
    execSync(`cmdkey /generic:${targetName} /user:${targetName} /pass:"${escapedValue}"`, {
      encoding: "utf-8",
      stdio: "pipe",
    })
    return true
  } catch {
    return false
  }
}

function getSecretWindows(key: string): string | null {
  try {
    const targetName = `${SERVICE_NAME}:${key}`
    
    // Use PowerShell to retrieve from Windows Credential Manager via .NET
    const psScript = `
[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
try {
  $vault = New-Object Windows.Security.Credentials.PasswordVault
  $cred = $vault.Retrieve('${targetName}', '${targetName}')
  $cred.RetrievePassword()
  Write-Output $cred.Password
} catch {
  # Try alternative method using CredRead
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredentialManager {
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
    
    [DllImport("advapi32.dll")]
    public static extern void CredFree(IntPtr credential);
    
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    
    public static string GetPassword(string target) {
        IntPtr credPtr;
        if (CredRead(target, 1, 0, out credPtr)) {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            string password = Marshal.PtrToStringUni(cred.CredentialBlob, cred.CredentialBlobSize / 2);
            CredFree(credPtr);
            return password;
        }
        return null;
    }
}
"@
  $result = [CredentialManager]::GetPassword('${targetName}')
  if ($result) { Write-Output $result }
}
`.trim()

    const result = spawnSync("powershell", ["-NoProfile", "-Command", psScript], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    
    const password = result.stdout?.trim()
    return password || null
  } catch {
    return null
  }
}

function deleteSecretWindows(key: string): boolean {
  try {
    const targetName = `${SERVICE_NAME}:${key}`
    execSync(`cmdkey /delete:${targetName}`, {
      encoding: "utf-8",
      stdio: "pipe",
    })
    return true
  } catch {
    return false
  }
}

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Check if secure storage is available on this platform
 */
export function isSecureStorageAvailable(): boolean {
  switch (process.platform) {
    case "darwin":
      try {
        execSync("which security", { encoding: "utf-8", stdio: "pipe" })
        return true
      } catch {
        return false
      }
    case "linux":
      try {
        execSync("which secret-tool", { encoding: "utf-8", stdio: "pipe" })
        return true
      } catch {
        return false
      }
    case "win32":
      // cmdkey is always available on Windows
      try {
        execSync("where cmdkey", { encoding: "utf-8", stdio: "pipe" })
        return true
      } catch {
        return false
      }
    default:
      return false
  }
}
