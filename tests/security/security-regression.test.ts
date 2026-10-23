/**
 * Security Regression Tests
 *
 * Scans source code to ensure security anti-patterns don't reappear.
 * These tests catch regressions in secrets, IPC exposure, file handling and CI.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

describe('Security Regression: Secrets Exposure', () => {
  it('no source files contain real Stripe secret keys', () => {
    const allFiles = getAllSourceFiles();

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // Match actual Stripe secret keys (not placeholders)
      const hasRealKey =
        /sk_live_[a-zA-Z0-9]{20,}/.test(content) ||
        /sk_test_51[a-zA-Z0-9]{20,}/.test(content);
      expect(
        hasRealKey,
        `${path.relative(process.cwd(), file)} contains a real Stripe key`
      ).toBe(false);
    }
  });

  it('no source files contain real webhook signing secrets', () => {
    const allFiles = getAllSourceFiles();

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const hasWebhookSecret = /whsec_[a-zA-Z0-9]{20,}/.test(content);
      expect(
        hasWebhookSecret,
        `${path.relative(process.cwd(), file)} contains a webhook secret`
      ).toBe(false);
    }
  });
});

describe('Security Regression: Preload IPC', () => {
  it('generic preload IPC helpers enforce explicit channel allowlists', () => {
    const preloadPath = path.join(PUBLIC_DIR, 'preload.cjs');
    const content = fs.readFileSync(preloadPath, 'utf-8');

    expect(content).toContain('ALLOWED_GENERIC_LISTEN_CHANNELS');
    expect(content).toContain('ALLOWED_GENERIC_SEND_CHANNELS');
    expect(content).toContain('assertAllowedChannel(channel, ALLOWED_GENERIC_LISTEN_CHANNELS, \'onMessage\')');
    expect(content).toContain('assertAllowedChannel(channel, ALLOWED_GENERIC_SEND_CHANNELS, \'sendMessage\')');
    expect(content).toContain('assertAllowedChannel(channel, ALLOWED_GENERIC_LISTEN_CHANNELS, \'removeListener\')');
  });

  it('generic preload listen allowlist is empty (no backend callbacks)', () => {
    const preloadPath = path.join(PUBLIC_DIR, 'preload.cjs');
    const content = fs.readFileSync(preloadPath, 'utf-8');
    const allowlistMatch = content.match(/const ALLOWED_GENERIC_LISTEN_CHANNELS = new Set\(\[([\s\S]*?)\]\);/);

    expect(allowlistMatch, 'listen allowlist should be declared').not.toBeNull();
    expect((allowlistMatch?.[1] || '').trim()).toBe('');
  });
});

describe('Security Regression: Main Process File IPC', () => {
  it('safe-file protocol uses boundary-aware path checks', () => {
    const electronPath = path.join(PUBLIC_DIR, 'electron.js');
    const content = fs.readFileSync(electronPath, 'utf-8');
    const handlerMatch = content.match(/protocol\.registerFileProtocol\('safe-file'[\s\S]*?\n  \}\);/);

    expect(handlerMatch, 'safe-file protocol handler should exist').not.toBeNull();
    const handler = handlerMatch?.[0] || '';
    expect(handler).toContain('isPathInside(filePath, recordingsDir)');
    expect(handler).toContain('isPathInside(filePath, projectsDir)');
    expect(handler).not.toContain('filePath.startsWith(recordingsDir)');
    expect(handler).not.toContain('filePath.startsWith(projectsDir)');
  });

  it('version and backup file handlers enforce path validation helpers', () => {
    const electronPath = path.join(PUBLIC_DIR, 'electron.js');
    const content = fs.readFileSync(electronPath, 'utf-8');

    expect(content).toContain('function isProjectVersionFile');
    expect(content).toContain('function isAllowedBackupWritePath');
    expect(content).toContain('function isAllowedBackupReadPath');
    expect(content).toContain('selectedBackupDirectories');
    expect(content).toContain('selectedImportFiles');

    expect(content).toContain('if (!isAllowedBackupWritePath(filePath))');
    expect(content).toContain('if (!isAllowedBackupReadPath(sourcePath) || !isAllowedBackupWritePath(destPath))');
    expect(content).toContain('if (!isProjectVersionFile(filePath))');
    expect(content).toContain('if (!isProjectVersionsDir(projectVersionsDir))');
  });

  it('delete-version-file validates path before unlink', () => {
    const electronPath = path.join(PUBLIC_DIR, 'electron.js');
    const content = fs.readFileSync(electronPath, 'utf-8');
    const handlerMatch = content.match(/ipcMain\.handle\('delete-version-file'[\s\S]*?\/\/ Move\/rename a directory/);

    expect(handlerMatch, 'delete-version-file handler should exist').not.toBeNull();
    const handler = handlerMatch?.[0] || '';
    expect(handler.indexOf('isProjectVersionFile(filePath)')).toBeLessThan(handler.indexOf('fs.promises.unlink(filePath)'));
  });

  it('external URL opens are restricted to an explicit host allowlist', () => {
    const electronPath = path.join(PUBLIC_DIR, 'electron.js');
    const content = fs.readFileSync(electronPath, 'utf-8');

    expect(content).toContain('const ALLOWED_EXTERNAL_HOSTS = new Set([');
    expect(content).toContain('if (!ALLOWED_EXTERNAL_HOSTS.has(parsedUrl.hostname))');
  });
});

describe('Security Regression: electronTest Environment Exposure', () => {
  it('electronTest.getEnv exposes only the filtered public env object', () => {
    const preloadPath = path.join(PUBLIC_DIR, 'preload.cjs');
    const content = fs.readFileSync(preloadPath, 'utf-8');

    expect(content).toContain('getEnv: () => electronEnvObject');
    expect(content).not.toContain('getEnv: () => envVars');
  });
});

describe('Security Regression: CI Security Checks', () => {
  it('CI audit focuses on production dependencies', () => {
    const ciPath = path.resolve(__dirname, '../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf-8');

    expect(content).toContain('npm audit --omit=dev --audit-level=high');
  });

  it('GitHub Actions are pinned to immutable commit SHAs', () => {
    const ciPath = path.resolve(__dirname, '../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf-8');
    const usesLines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- uses:') || line.startsWith('uses:'));

    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line, `${line} should be pinned to a full commit SHA`).toMatch(/@[a-f0-9]{40}(?:\s|$)/);
      expect(line, `${line} should not use a mutable version tag`).not.toMatch(/@v\d+(?:\s|$)/);
    }
  });
});

describe('Security Regression: Filename Sanitization', () => {
  it('main-process project filename sanitizer handles Windows edge cases', () => {
    const electronPath = path.join(PUBLIC_DIR, 'electron.js');
    const content = fs.readFileSync(electronPath, 'utf-8');

    expect(content).toContain('WINDOWS_RESERVED_FILENAME_RE');
    expect(content).toContain('con|prn|aux|nul|com[1-9]|lpt[1-9]');
    expect(content).toContain('[<>:"/\\\\|?*\\x00-\\x1F\\x7F]');
    expect(content).toContain('replace(/[. ]+$/g,');
    expect(content).toContain('function sanitizeProjectFileName');
  });

  it('project file save/delete handlers use centralized filename sanitization', () => {
    const electronPath = path.join(PUBLIC_DIR, 'electron.js');
    const content = fs.readFileSync(electronPath, 'utf-8');

    expect(content).toContain("sanitizeProjectFileName(fileName, 'recording')");
    expect(content).toContain("sanitizeProjectFileName(fileName, 'screenshot.png')");
    expect(content).toContain("sanitizeProjectFileName(fileName, 'export')");
    expect(content).toContain("sanitizeProjectFileName(fileName, 'upload')");
    expect(content).toContain("sanitizeProjectFileName(fileName, 'diagram')");
  });

  it('renderer filename utilities reject control chars and reserved Windows names', () => {
    const utilsPath = path.join(SRC_DIR, 'lib', 'utils.ts');
    const projectFileServicePath = path.join(SRC_DIR, 'services', 'ProjectFileService.ts');
    const utilsContent = fs.readFileSync(utilsPath, 'utf-8');
    const projectFileServiceContent = fs.readFileSync(projectFileServicePath, 'utf-8');

    expect(utilsContent).toContain('[\\x00-\\x1F\\x7F]');
    expect(utilsContent).toContain('con|prn|aux|nul|com[1-9]|lpt[1-9]');
    expect(utilsContent).toContain('untitled_file');

    expect(projectFileServiceContent).toContain('WINDOWS_RESERVED_FILENAME_RE');
    expect(projectFileServiceContent).toContain('[<>:"/\\\\|?*\\x00-\\x1F\\x7F]');
    expect(projectFileServiceContent).toContain('untitled_project');
  });
});

describe('Security Regression: Translation Module Integrity', () => {
  it('translation module builder emits pinned model hashes in the manifest', () => {
    const builderPath = path.resolve(__dirname, '../../scripts/build-translation-module.js');
    const content = fs.readFileSync(builderPath, 'utf-8');

    expect(content).toContain('function computeModelHashes');
    expect(content).toContain("filter(f => f.endsWith('.argosmodel'))");
    expect(content).toContain('modelHashes');
    expect(content).toContain('createManifest(zipSize, sha256, modelHashes)');
  });

  it('translation module download verifies archive and extracted model hashes', () => {
    const managerPath = path.join(PUBLIC_DIR, 'services', 'TranslationModuleManager.js');
    const content = fs.readFileSync(managerPath, 'utf-8');

    expect(content).toContain('_validateRemoteManifest(manifest)');
    expect(content).toContain('Translation module manifest is missing model hashes');
    expect(content).toContain('await this._verifyModelHashes(remoteManifest.modelHashes)');
    expect(content).toContain('Translation model verification failed');
    expect(content).toContain("modelName.includes('/') || modelName.includes('\\\\')");
  });
});

// Helper: get all source files (excluding node_modules, .env files, etc.)
function getAllSourceFiles(): string[] {
  const files: string[] = [];
  const dirs = [SRC_DIR, PUBLIC_DIR, path.resolve(__dirname, '../../scripts')];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    collectFiles(dir, files);
  }

  return files;
}

function collectFiles(dir: string, files: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      collectFiles(fullPath, files);
    } else if (
      entry.name.endsWith('.ts') ||
      entry.name.endsWith('.tsx') ||
      entry.name.endsWith('.js') ||
      entry.name.endsWith('.cjs')
    ) {
      // Skip .env and config files
      if (entry.name.startsWith('.env')) continue;
      files.push(fullPath);
    }
  }
}
