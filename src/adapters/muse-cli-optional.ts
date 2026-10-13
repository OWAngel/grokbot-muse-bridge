import { spawn } from "node:child_process";
import type { BridgeConfig } from "../config.js";
import type { MessageEnvelope } from "../types/envelope.js";

/**
 * EXPERIMENTAL optional outbound into Muse via community `muse-cli`.
 *
 * WARNING:
 * - Not an official Meta Muse peer API.
 * - Shelling into muse-cli may violate Muse Terms of Service.
 * - Default is OFF (MUSE_CLI_ENABLED=false). Use at your own risk.
 * - This project does NOT reverse-engineer Muse's Noise/WebSocket gateway.
 */

export interface MuseCliResult {
  ok: boolean;
  skipped?: boolean;
  experimental: true;
  stdout?: string;
  stderr?: string;
  error?: string;
}

function which(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

export async function sendViaMuseCli(
  config: BridgeConfig,
  msg: MessageEnvelope,
): Promise<MuseCliResult> {
  if (!config.museCliEnabled) {
    return {
      ok: false,
      skipped: true,
      experimental: true,
      error: "MUSE_CLI_ENABLED is false (default). Optional Muse CLI push is off.",
    };
  }

  const present = await which(config.museCliBin);
  if (!present) {
    return {
      ok: false,
      skipped: true,
      experimental: true,
      error: `${config.museCliBin} not found on PATH`,
    };
  }

  const payload = [
    `[from:${msg.from}]`,
    `[thread:${msg.thread_id}]`,
    `[message_id:${msg.id}]`,
    msg.reply_to ? `[reply_to:${msg.reply_to}]` : "",
    "",
    msg.body,
  ]
    .filter(Boolean)
    .join("\n");

  return new Promise((resolve) => {
    // Community CLIs vary; try a conservative `send` subcommand with stdin text.
    // If the binary expects different args, operators can wrap it.
    const child = spawn(config.museCliBin, ["send", "--text", payload], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        experimental: true,
        error: err.message,
        stdout,
        stderr,
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, experimental: true, stdout, stderr });
      } else {
        resolve({
          ok: false,
          experimental: true,
          error: `${config.museCliBin} exited ${code}`,
          stdout,
          stderr,
        });
      }
    });
  });
}
