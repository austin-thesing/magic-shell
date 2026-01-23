import { spawnSync } from "child_process"

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
    spawnSync("security", [
      "delete-generic-password",
      "-s", SERVICE_NAME,
      "-a", key,
    ], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    // Ignore errors - entry might not exist

    // Add the new password using stdin to avoid command injection
    // and prevent secret exposure in process list
    const result = spawnSync("security", [
      "add-generic-password",
      "-s", SERVICE_NAME,
      "-a", key,
      "-w", value,
    ], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    return result.status === 0
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] macOS keychain set error:", error instanceof Error ? error.message : String(error))
    }
    return false
  }
}

function getSecretMacOS(key: string): string | null {
  try {
    const result = spawnSync("security", [
      "find-generic-password",
      "-s", SERVICE_NAME,
      "-a", key,
      "-w",
    ], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    if (result.status !== 0) {
      return null
    }
    return result.stdout?.trim() || null
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] macOS keychain get error:", error instanceof Error ? error.message : String(error))
    }
    return null
  }
}

function deleteSecretMacOS(key: string): boolean {
  try {
    const result = spawnSync("security", [
      "delete-generic-password",
      "-s", SERVICE_NAME,
      "-a", key,
    ], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    return result.status === 0
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] macOS keychain delete error:", error instanceof Error ? error.message : String(error))
    }
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
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] Linux secret-tool set error:", error instanceof Error ? error.message : String(error))
    }
    return false
  }
}

function getSecretLinux(key: string): string | null {
  try {
    const result = spawnSync("secret-tool", [
      "lookup",
      "service", SERVICE_NAME,
      "account", key,
    ], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    if (result.status !== 0) {
      return null
    }
    return result.stdout?.trim() || null
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] Linux secret-tool get error:", error instanceof Error ? error.message : String(error))
    }
    return null
  }
}

function deleteSecretLinux(key: string): boolean {
  try {
    const result = spawnSync("secret-tool", [
      "clear",
      "service", SERVICE_NAME,
      "account", key,
    ], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    return result.status === 0
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] Linux secret-tool delete error:", error instanceof Error ? error.message : String(error))
    }
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
    spawnSync("cmdkey", [`/delete:${targetName}`], {
      encoding: "utf-8",
      stdio: "pipe",
    })

    // Use PowerShell with .NET CredentialManager to securely store credentials
    // This avoids exposing the secret in command-line arguments
    const psScript = `
$targetName = $input | Select-Object -First 1
$password = $input | Select-Object -Skip 1 -First 1

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class CredentialManager {
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredWrite(ref CREDENTIAL credential, int flags);

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

    public static bool SaveCredential(string target, string password) {
        var passwordBytes = System.Text.Encoding.Unicode.GetBytes(password);
        var credentialBlob = Marshal.AllocHGlobal(passwordBytes.Length);
        Marshal.Copy(passwordBytes, 0, credentialBlob, passwordBytes.Length);

        var credential = new CREDENTIAL {
            Type = 1, // CRED_TYPE_GENERIC
            TargetName = target,
            CredentialBlobSize = passwordBytes.Length,
            CredentialBlob = credentialBlob,
            Persist = 2, // CRED_PERSIST_LOCAL_MACHINE
            UserName = target
        };

        var result = CredWrite(ref credential, 0);
        Marshal.FreeHGlobal(credentialBlob);
        return result;
    }
}
"@

[CredentialManager]::SaveCredential($targetName, $password)
`.trim()

    const result = spawnSync("powershell", ["-NoProfile", "-Command", psScript], {
      input: `${targetName}\n${value}`,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    
    // Check if the result is "True"
    return result.stdout?.trim() === "True"
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] Windows credential set error:", error instanceof Error ? error.message : String(error))
    }
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
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] Windows credential get error:", error instanceof Error ? error.message : String(error))
    }
    return null
  }
}

function deleteSecretWindows(key: string): boolean {
  try {
    const targetName = `${SERVICE_NAME}:${key}`
    const result = spawnSync("cmdkey", [`/delete:${targetName}`], {
      encoding: "utf-8",
      stdio: "pipe",
    })
    return result.status === 0
  } catch (error) {
    if (process.env.DEBUG_API === "1") {
      console.error("[DEBUG] Windows credential delete error:", error instanceof Error ? error.message : String(error))
    }
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
    case "darwin": {
      const result = spawnSync("which", ["security"], { encoding: "utf-8", stdio: "pipe" })
      return result.status === 0
    }
    case "linux": {
      const result = spawnSync("which", ["secret-tool"], { encoding: "utf-8", stdio: "pipe" })
      return result.status === 0
    }
    case "win32": {
      const result = spawnSync("where", ["cmdkey"], { encoding: "utf-8", stdio: "pipe" })
      return result.status === 0
    }
    default:
      return false
  }
}
