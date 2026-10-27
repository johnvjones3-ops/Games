// Bundles the game into one self-contained HTML file (dist/slingshot-garage.html)
// that runs from file:// or any static host. No dependencies: each ES module is
// wrapped in a function scope and its named imports/exports are rewired.
//   node tools/build-single.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const modules = new Map();
const order = [];

const varName = (file) => '__m_' + relative(root, file).replace(/[^a-zA-Z0-9]/g, '_');

function load(file) {
  if (modules.has(file)) return;
  modules.set(file, null);
  let code = readFileSync(file, 'utf8');
  const deps = [];
  code = code.replace(IMPORT_RE, (_, names, spec) => {
    const dep = normalize(join(dirname(file), spec));
    deps.push(dep);
    const binds = names.split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => { const [a, b] = n.split(/\s+as\s+/); return b ? `${a}: ${b}` : a; });
    return `const { ${binds.join(', ')} } = ${varName(dep)};`;
  });
  if (/^\s*import\s/m.test(code)) throw new Error(`Unsupported import form in ${file}`);
  const exported = [];
  code = code.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (_, names) => {
    for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) {
      const [a, b] = n.split(/\s+as\s+/);
      exported.push(b ? `${b}: ${a}` : a);
    }
    return '';
  });
  code = code.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  if (/^export\s/m.test(code)) throw new Error(`Unsupported export form in ${file}`);
  for (const d of deps) load(d);
  modules.set(file, { code, exported });
  order.push(file);
}

load(join(root, 'src/main.js'));

const js = ['window.SINGLE_FILE = true;']
  .concat(order.map((f) => {
    const m = modules.get(f);
    return `// ---- ${relative(root, f)} ----\nconst ${varName(f)} = (() => {\n${m.code}\nreturn { ${m.exported.join(', ')} };\n})();`;
  }))
  .join('\n');

const css = readFileSync(join(root, 'styles.css'), 'utf8');
const svgIcon = readFileSync(join(root, 'icons/icon.svg'));
const pngIcon = readFileSync(join(root, 'icons/icon-180.png'));
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${svgIcon.toString('base64')}">`)
  .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="data:image/png;base64,${pngIcon.toString('base64')}">`)
  .replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist/slingshot-garage.html');
writeFileSync(out, html);
console.log(`wrote ${relative(root, out)} (${(html.length / 1024).toFixed(0)} KB, ${order.length} modules)`);

// Hosts that supply their own document skeleton (e.g. claude.ai artifacts) get
// just the title, styles, body content and script.
if (process.argv.includes('--fragment')) {
  const title = html.match(/<title>[^<]*<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const fragment = `${title}\n${style}\n${body.trim()}\n`;
  const fragOut = join(root, 'dist/slingshot-garage.fragment.html');
  writeFileSync(fragOut, fragment);
  console.log(`wrote ${relative(root, fragOut)} (${(fragment.length / 1024).toFixed(0)} KB)`);
}
