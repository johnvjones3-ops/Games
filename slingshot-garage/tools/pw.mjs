// Resolve Playwright from the project, NODE_PATH, or a global install.
import { createRequire } from 'node:module';

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const paths = [process.env.NODE_PATH, '/opt/node-tools/node_modules'].filter(Boolean);
  try {
    return require('playwright');
  } catch {
    return require(require.resolve('playwright', { paths }));
  }
}
