// Builds dist/ when installed from git (npx github:bitovvnew/civarena). Skips if already built or no toolchain.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
if (existsSync('dist/cli.js') && existsSync('dist/web/index.html')) process.exit(0);
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch {
  console.warn('civarena: build skipped (dev dependencies missing). Run `npm install && npm run build`.');
}
