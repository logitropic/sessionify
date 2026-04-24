import { parseSessionFile } from './session/parser.js';
import { convertSessionFile } from './session/converter.js';
import { detectSessionFormat } from './session/detector.js';
import type { Platform } from './session/types.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const USAGE = `
Sessionify - Convert AI session history between platforms

Usage:
  sessionify <file> [options]
  sessionify --detect <file>

Options:
  --target <platform>   Target platform: claude-code, codex, gemini (required)
  --output <dir>        Output directory
  --detect              Detect and show file format
  -h, --help            Show this help message

Examples:
  sessionify ./session.ndjson --target codex
  sessionify ./session.json --target claude-code --output ./output
  sessionify ./session.jsonl --detect
`.trim();

async function detectFile(filePath: string): Promise<void> {
  const result = await detectSessionFormat(filePath);
  if (result) {
    console.log(`Format: ${result.platform} (${result.format.variant})`);
    console.log(`Confidence: ${Math.round(result.confidence * 100)}%`);
  } else {
    console.log('Unknown format');
    process.exit(1);
  }
}

async function convertFile(filePath: string, target: Platform, outputDir?: string): Promise<void> {
  const result = await convertSessionFile({
    sourcePath: filePath,
    targetPlatform: target,
    ...(outputDir ? { outputDir } : {}),
  });
  console.log(`Converted: ${result.outputPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(USAGE);
    process.exit(0);
  }

  const detectIndex = args.indexOf('--detect');
  if (detectIndex >= 0) {
    const filePath = args[detectIndex + 1];
    if (!filePath) {
      console.error('Error: --detect requires a file path');
      process.exit(1);
    }
    await detectFile(filePath);
    return;
  }

  const targetIndex = args.indexOf('--target');
  const outputIndex = args.indexOf('--output');

  const filePath = args[0];
  const target = args[targetIndex + 1] as Platform | undefined;
  const outputDir = args[outputIndex + 1];

  if (!filePath) {
    console.error('Error: File path required');
    console.log(USAGE);
    process.exit(1);
  }

  if (!target) {
    console.error('Error: --target platform required (claude-code, codex, gemini)');
    process.exit(1);
  }

  if (!['claude-code', 'codex', 'gemini'].includes(target)) {
    console.error(`Error: Invalid platform "${target}". Must be claude-code, codex, or gemini`);
    process.exit(1);
  }

  await convertFile(filePath, target, outputDir);
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
