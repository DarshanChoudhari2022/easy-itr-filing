import ts from 'typescript';
import { readdir, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compile without a bundler so missing Node ESM extensions fail here as in production.
const temporary = await mkdtemp(resolve('node_modules/.crypto-api-smoke-'));
try {
  await writeFile(join(temporary, 'package.json'), '{"type":"module"}');
  const handlers = [];
  async function compile(source, output) {
    await mkdir(output, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      const input = join(source, entry.name);
      if (entry.isDirectory()) { await compile(input, join(output, entry.name)); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      const target = join(output, entry.name.replace(/\.ts$/, '.js'));
      const result = ts.transpileModule(await readFile(input, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      });
      await writeFile(target, result.outputText);
      if (!entry.name.startsWith('_')) handlers.push(target);
    }
  }
  await compile(resolve('api/crypto'), temporary);
  for (const file of handlers) {
    const { default: handler } = await import(pathToFileURL(file).href);
    let status = 200, body;
    const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return this; }, end() {} };
    await handler({ method: file.includes('upload') || file.endsWith('compute-tax.js') ? 'POST' : 'GET', headers: {}, query: {}, body: {} }, res);
    if (status !== 401 || body?.success !== false) throw new Error('Unauthenticated API did not return JSON 401: ' + file);
  }
  console.log('Production ESM import and JSON authentication checks passed for ' + handlers.length + ' crypto handlers.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
