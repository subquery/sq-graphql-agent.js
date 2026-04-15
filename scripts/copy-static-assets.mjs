import {copyFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

const assets = [
  {
    source: resolve(rootDir, 'src/codex/query.graphql'),
    destination: resolve(rootDir, 'dist/src/codex/query.graphql'),
  },
  {
    source: resolve(rootDir, 'src/codex/full_schema.graphql'),
    destination: resolve(rootDir, 'dist/src/codex/full_schema.graphql'),
  },
];

await Promise.all(
  assets.map(async ({source, destination}) => {
    await mkdir(dirname(destination), {recursive: true});
    await copyFile(source, destination);
  })
);
