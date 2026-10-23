// safeExtractZip.js - Extract a zip archive without letting any entry escape the destination
//
// Replaces extract-zip, which has unpatched symlink path traversal issues
// (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3). The whole extraction is rejected
// if any entry is a symlink or resolves outside the destination folder.

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) reject(err);
      else resolve(zipfile);
    });
  });
}

function openEntryStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    });
  });
}

/**
 * Extract zipPath into destPath.
 * @param {string} zipPath
 * @param {string} destPath
 */
export async function safeExtractZip(zipPath, destPath) {
  const root = path.resolve(destPath);
  await fs.promises.mkdir(root, { recursive: true });

  const zipfile = await openZip(zipPath);

  await new Promise((resolve, reject) => {
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      try { zipfile.close(); } catch { /* already closed */ }
      reject(err);
    };

    zipfile.on('error', fail);
    zipfile.on('end', () => { if (!failed) resolve(); });

    zipfile.on('entry', async (entry) => {
      try {
        const mode = (entry.externalFileAttributes >>> 16) & S_IFMT;
        if (mode === S_IFLNK) {
          throw new Error(`Refusing to extract symlink entry: ${entry.fileName}`);
        }

        const target = path.resolve(root, entry.fileName);
        if (target !== root && !target.startsWith(root + path.sep)) {
          throw new Error(`Refusing to extract entry outside destination: ${entry.fileName}`);
        }

        if (entry.fileName.endsWith('/')) {
          await fs.promises.mkdir(target, { recursive: true });
        } else {
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          const stream = await openEntryStream(zipfile, entry);
          await pipeline(stream, fs.createWriteStream(target));
        }
        zipfile.readEntry();
      } catch (err) {
        fail(err);
      }
    });

    zipfile.readEntry();
  });
}
