/**
 * Back up the storage root: the metadata database plus every tenant's files.
 *
 * There was no backup story at all — `db.sqlite` and the design/upload files on
 * the PVC were the only copy of everything clients had made. This takes a
 * consistent snapshot without stopping the server:
 *
 *   - the database is snapshotted with SQLite's `VACUUM INTO`, which writes a
 *     complete, defragmented copy even while other connections are writing, so
 *     there is no need to copy the `-wal`/`-shm` files or quiesce anything;
 *   - `templates/` and `users/` are copied as-is;
 *   - a manifest records what was taken, so a restore can be checked.
 *
 * Usage:
 *   node scripts/backup-storage.mjs [--out <dir>] [--keep <n>] [--label <name>]
 *
 * `--out` defaults to `backups/` at the project root. Point it at a **different
 * volume** in production: a backup that lives beside the thing it backs up is
 * not a backup. `--keep` prunes older runs of this script in that directory.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getStoragePaths, storageConfig } from '../api/storagePaths.js';

const parseArgs = (argv) => {
  const args = { out: null, keep: 0, label: null };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (argv[i] === '--out' && next) args.out = next;
    else if (argv[i] === '--keep' && next) args.keep = Number(next) || 0;
    else if (argv[i] === '--label' && next) args.label = next;
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const paths = getStoragePaths();
const outRoot = path.resolve(args.out ?? path.join(storageConfig.projectRoot, 'backups'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(outRoot, args.label ? `${stamp}-${args.label}` : stamp);

const databaseFile = path.join(paths.storageRoot, 'db.sqlite');
if (!existsSync(databaseFile)) {
  console.error(`No database at ${databaseFile}. Is STORAGE_ROOT right?`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });
console.log(`Backing up ${paths.storageRoot}`);
console.log(`         to ${target}`);

/**
 * A consistent database copy. `VACUUM INTO` refuses to overwrite, and the path
 * is a SQL literal rather than a bound parameter, so it is quoted by hand.
 */
const snapshotFile = path.join(target, 'db.sqlite');
const db = new DatabaseSync(databaseFile, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${snapshotFile.replaceAll("'", "''")}'`);
} finally {
  db.close();
}

const countFiles = (dir) => {
  if (!existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  };
  walk(dir);
  return { files, bytes };
};

/**
 * Everything under the storage root, except the live database — that is already
 * snapshotted above, and copying it while it is being written would produce a
 * torn file. Walking the root rather than naming `users/` and `templates/` means
 * a layout change, or an extra directory someone drops in, is still backed up.
 */
const DATABASE_FILES = new Set(['db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm']);
const storageCopy = path.join(target, 'storage');
cpSync(paths.storageRoot, storageCopy, {
  recursive: true,
  filter: (from) => !DATABASE_FILES.has(path.basename(from)),
});

const copied = { storage: countFiles(storageCopy) };

// Directories overridden to live outside the storage root have to be fetched
// separately, or a restore would silently lose them.
const isInside = (candidate) => {
  const relative = path.relative(paths.storageRoot, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
for (const [name, dir] of [
  ['templates', paths.templatesDir],
  ['uploads', paths.uploadsDir],
  ['designs', paths.designsDir],
]) {
  if (isInside(dir) || !existsSync(dir)) continue;
  cpSync(dir, path.join(target, 'external', name), { recursive: true });
  copied[`external/${name}`] = countFiles(dir);
}

const manifest = {
  takenAt: new Date().toISOString(),
  storageRoot: paths.storageRoot,
  database: { file: 'db.sqlite', bytes: statSync(snapshotFile).size },
  copied,
  note:
    'Restore by copying storage/ back onto a volume and pointing STORAGE_ROOT at it. ' +
    'db.sqlite in this directory is the snapshot; the live one is never copied.',
};
writeFileSync(
  path.join(target, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const human = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(`  db.sqlite            ${human(manifest.database.bytes)} (snapshot)`);
for (const [name, info] of Object.entries(copied)) {
  console.log(`  ${name.padEnd(20)} ${info.files} files, ${human(info.bytes)}`);
}

if (args.keep > 0) {
  const runs = readdirSync(outRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const stale of runs.slice(args.keep)) {
    rmSync(path.join(outRoot, stale), { recursive: true, force: true });
    console.log(`  pruned ${stale}`);
  }
}

console.log('Done.');
