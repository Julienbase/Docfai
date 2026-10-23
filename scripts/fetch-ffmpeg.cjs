/**
 * Fetches the pinned FFmpeg build into vendor/ffmpeg/win32/<arch>/.
 *
 * Downloads the gyan.dev "essentials" release build (GPL-3.0-or-later),
 * verifies its SHA-256 against the pin below, and extracts ffmpeg.exe,
 * ffprobe.exe and the build's LICENSE into the vendor directory.
 * electron-builder packs these via extraResources; public/electron.js
 * uses them directly in dev mode.
 *
 * Skips the download when the vendored binaries already match the pin.
 * To upgrade: update PIN below (version + sha256 from
 * https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-<version>-essentials_build.zip.sha256),
 * mirror the matching ffmpeg source tarball to R2 (see docs/DEPLOYMENT.md),
 * and update THIRD-PARTY-NOTICES.txt.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PIN = {
  version: '8.1.2',
  url: 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip',
  sha256: 'db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec'
};

const arch = process.arch === 'x64' ? 'x64' : 'ia32';
const vendorDir = path.join(__dirname, '..', 'vendor', 'ffmpeg', 'win32', arch);
const versionMarker = path.join(vendorDir, 'VERSION.txt');

function isUpToDate() {
  try {
    return (
      fs.readFileSync(versionMarker, 'utf8').trim() === PIN.version &&
      fs.existsSync(path.join(vendorDir, 'ffmpeg.exe')) &&
      fs.existsSync(path.join(vendorDir, 'ffprobe.exe'))
    );
  } catch {
    return false;
  }
}

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft === 0) return reject(new Error('Too many redirects'));
        return resolve(download(res.headers.location, dest, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastPct = -10;
      const file = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) {
          const pct = Math.floor((received / total) * 100);
          if (pct >= lastPct + 10) {
            lastPct = pct;
            console.log(`  downloading... ${pct}%`);
          }
        }
      });
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sha256Of(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function main() {
  if (isUpToDate()) {
    console.log(`FFmpeg ${PIN.version} already vendored at ${vendorDir} - skipping.`);
    return;
  }

  console.log(`Fetching FFmpeg ${PIN.version} (gyan.dev essentials build)...`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docfai-ffmpeg-'));
  const zipPath = path.join(tmpDir, 'ffmpeg.zip');

  try {
    await download(PIN.url, zipPath);

    const actual = sha256Of(zipPath);
    if (actual !== PIN.sha256) {
      throw new Error(
        `SHA-256 mismatch for ${PIN.url}\n  expected: ${PIN.sha256}\n  actual:   ${actual}\n` +
        'The download may be corrupted or tampered with. Aborting.'
      );
    }
    console.log('  SHA-256 verified.');

    const extractDir = path.join(tmpDir, 'extracted');
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`
    ], { stdio: 'inherit' });

    const buildRoot = path.join(extractDir, `ffmpeg-${PIN.version}-essentials_build`);
    fs.mkdirSync(vendorDir, { recursive: true });
    fs.copyFileSync(path.join(buildRoot, 'bin', 'ffmpeg.exe'), path.join(vendorDir, 'ffmpeg.exe'));
    fs.copyFileSync(path.join(buildRoot, 'bin', 'ffprobe.exe'), path.join(vendorDir, 'ffprobe.exe'));
    fs.copyFileSync(path.join(buildRoot, 'LICENSE'), path.join(vendorDir, 'LICENSE.txt'));
    fs.writeFileSync(versionMarker, `${PIN.version}\n`);

    console.log(`FFmpeg ${PIN.version} vendored to ${vendorDir}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
