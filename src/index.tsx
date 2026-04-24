import React from 'react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'ink';
import { App } from './tui/app.js';

export function main(): void {
  render(<App />);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (entryPath && modulePath === entryPath) {
  main();
}
