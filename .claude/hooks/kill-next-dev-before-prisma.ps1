# PreToolUse hook: when Claude is about to run a Bash command that touches
# Prisma's client (migrate / generate / deploy / npm run build), kill the
# Next.js dev server first. On Windows, `next dev` keeps a handle on
# node_modules/.prisma/client/query_engine-windows.dll.node, which makes
# `prisma generate` fail with EPERM (rename .tmp -> .node).
#
# Stdin: Claude Code PreToolUse JSON payload.
# Stdout: optional JSON with a systemMessage shown to the user.
# Side effect: terminates ONLY node processes whose command line contains
# both "next" and "dev" (matches `next dev` / `npm run dev`). Claude Code
# itself, MCP servers, and other node processes are untouched.

$ErrorActionPreference = "Stop"

try {
    $payload = [Console]::In.ReadToEnd()
    $json = $payload | ConvertFrom-Json
} catch {
    exit 0
}

$cmd = $json.tool_input.command
if ([string]::IsNullOrEmpty($cmd)) { exit 0 }

# Match the commands that ultimately invoke `prisma generate`.
$trigger = $cmd -match 'prisma\s+(migrate|generate|deploy)' `
       -or $cmd -match 'db:(migrate|deploy|generate)' `
       -or $cmd -match 'npm\s+run\s+build'

if (-not $trigger) { exit 0 }

$killed = @()
try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
        Where-Object {
            $line = $_.CommandLine
            $line -and ($line -match '\bnext\b') -and ($line -match '\bdev\b')
        } |
        ForEach-Object {
            try {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
                $killed += $_.ProcessId
            } catch {
                # Process already gone or no permission — fine, move on.
            }
        }
} catch {
    # CIM not available or query failed — don't block the tool call.
    exit 0
}

if ($killed.Count -gt 0) {
    $msg = "Stopped Next.js dev server (PID $($killed -join ', ')) so Prisma can regenerate its client DLL."
    @{ systemMessage = $msg } | ConvertTo-Json -Compress | Write-Output
}

exit 0
