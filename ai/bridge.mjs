import readline from 'node:readline';
import { handleJsonlLine } from './bridge-core.mjs';
import { createRuntime } from './index.mjs';

const runtime = createRuntime({ env: process.env });
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) process.stdout.write(`${JSON.stringify(await handleJsonlLine(line, runtime))}\n`);
