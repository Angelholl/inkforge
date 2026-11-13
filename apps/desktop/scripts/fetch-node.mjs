// Fetch the pinned standalone node.exe for the desktop sidecar.
// Reads apps/desktop/NODE_VERSION, downloads the matching win-x64 binary from
// nodejs.org and writes it to src-tauri/resources/runtime/node.exe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const versionFile = path.join(desktopDir, 'NODE_VERSION');
const destDir = path.join(desktopDir, 'src-tauri', 'resources', 'runtime');
const destFile = path.join(destDir, 'node.exe');

async function main() {
  const version = fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '');
  if (!version) {
    throw new Error(`NODE_VERSION is empty: ${versionFile}`);
  }

  const url = `https://nodejs.org/dist/v${version}/win-x64/node.exe`;
  console.log(`Downloading Node ${version} from ${url}`);

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }

  fs.mkdirSync(destDir, { recursive: true });

  const out = fs.createWriteStream(destFile);
  try {
    for await (const chunk of res.body) {
      if (!out.write(chunk)) {
        await new Promise((resolve) => out.once('drain', resolve));
      }
    }
  } finally {
    await new Promise((resolve, reject) => {
      out.end((err) => (err ? reject(err) : resolve()));
    });
  }

  const { size } = fs.statSync(destFile);
  console.log(`Saved ${destFile} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(`fetch-node failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
