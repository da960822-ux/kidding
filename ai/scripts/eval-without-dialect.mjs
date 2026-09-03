// Evaluation-only bridge: same runtime and prompts, without advisory context.
import readline from 'node:readline';
import { handleJsonlLine } from '../bridge-core.mjs';
import { createRuntime } from '../index.mjs';

const runtime = createRuntime({ env: process.env, dialectReference: null });
for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  process.stdout.write(`${JSON.stringify(await handleJsonlLine(line, runtime))}\n`);
}
