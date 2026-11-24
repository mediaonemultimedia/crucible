import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dir = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ? resolve(process.argv[2]) : resolve(dir, '../build/smooth-roster.html');
const result = await build({
  entryPoints: [resolve(dir, 'roster/gallery.js')],
  bundle: true,
  format: 'iife',
  define: { LOOKDEV_RACE: 'true' },
  minify: true,
  write: false,
});
const template = await readFile(resolve(dir, 'roster/template.html'), 'utf8');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, template.replace('/* BUNDLE */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
console.log(out);
