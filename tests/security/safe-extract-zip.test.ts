import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

import { safeExtractZip } from '../../public/services/safeExtractZip.js';

let workDir: string;
let destDir: string;

async function writeZip(name: string, build: (zip: JSZip) => void): Promise<string> {
  const zip = new JSZip();
  build(zip);
  const data = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
  const zipPath = path.join(workDir, name);
  fs.writeFileSync(zipPath, data);
  return zipPath;
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docfai-zip-test-'));
  destDir = path.join(workDir, 'dest');
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('safeExtractZip', () => {
  it('extracts files and folders into the destination', async () => {
    const zipPath = await writeZip('ok.zip', (zip) => {
      zip.file('manifest.json', '{"version":"1"}');
      zip.folder('models');
      zip.file('models/en_de.argosmodel', 'model-bytes');
    });

    await safeExtractZip(zipPath, destDir);

    expect(fs.readFileSync(path.join(destDir, 'manifest.json'), 'utf8')).toBe('{"version":"1"}');
    expect(fs.readFileSync(path.join(destDir, 'models', 'en_de.argosmodel'), 'utf8')).toBe('model-bytes');
  });

  it('rejects entries that escape the destination folder', async () => {
    const zipPath = await writeZip('slip.zip', (zip) => {
      zip.file('../escape.txt', 'pwned');
    });

    await expect(safeExtractZip(zipPath, destDir)).rejects.toThrow();
    expect(fs.existsSync(path.join(workDir, 'escape.txt'))).toBe(false);
  });

  it('rejects symlink entries', async () => {
    const zipPath = await writeZip('symlink.zip', (zip) => {
      zip.file('link', path.join(workDir, 'outside'), { unixPermissions: 0o120777 });
    });

    await expect(safeExtractZip(zipPath, destDir)).rejects.toThrow(/symlink/);
    expect(fs.existsSync(path.join(destDir, 'link'))).toBe(false);
  });
});
