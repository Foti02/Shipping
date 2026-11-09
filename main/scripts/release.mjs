// Uso: npm run release -- <major|minor|patch> "cosa cambia"
// Alza la versione in package.json, aggiorna CHANGELOG.md, crea commit e tag vX.Y.Z.
// Non fa push: il push del tag avvia la pubblicazione di .exe e .dmg su GitHub.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [bump, ...rest] = process.argv.slice(2);
const note = rest.join(' ').trim();
const die = (m) => { console.error(m); process.exit(1); };

if (!['major', 'minor', 'patch'].includes(bump) || !note) {
  die('Uso: npm run release -- <major|minor|patch> "cosa cambia"');
}
if (execSync('git status --porcelain').toString().trim()) {
  die('Ci sono modifiche non salvate: fai prima il commit.');
}

execSync(`npm version ${bump} --no-git-tag-version`, { stdio: 'inherit' });
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

const date = new Date().toISOString().slice(0, 10);
const log = readFileSync('CHANGELOG.md', 'utf8');
const entry = `## [${version}] - ${date}\n\n- ${note}\n\n`;
// \r? perche' su Windows git puo' aver convertito il file in CRLF
const updated = log.replace(/(# Changelog\r?\n\r?\n)/, `$1${entry}`);
if (updated === log) die('CHANGELOG.md senza intestazione "# Changelog": versione non scritta.');
writeFileSync('CHANGELOG.md', updated);

execSync('git add package.json package-lock.json CHANGELOG.md', { stdio: 'inherit' });
execSync(`git commit -m "release: v${version}"`, { stdio: 'inherit' });
execSync(`git tag -a v${version} -m "v${version}"`, { stdio: 'inherit' }); // annotato: solo cosi' lo porta `git push --follow-tags`
console.log(`\nVersione ${version} pronta. Per pubblicarla:\n  git push --follow-tags`);
