/**
 * Build Translation Module Package
 *
 * Creates a zip archive containing the Python runtime, translation models,
 * and translate.py script for on-demand download by users.
 *
 * Usage: node scripts/build-translation-module.js
 *
 * Output:
 *   dist/translation-module.zip          - The module archive
 *   dist/translation-module-manifest.json - Manifest with hash and metadata
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PYTHON_RUNTIME_DIR = path.join(projectRoot, 'python', 'runtime');
const PYTHON_MODELS_DIR = path.join(projectRoot, 'python', 'models');
const TRANSLATE_SCRIPT = path.join(projectRoot, 'python', 'translate.py');
const OUTPUT_DIR = path.join(projectRoot, 'dist');
const OUTPUT_ZIP = path.join(OUTPUT_DIR, 'translation-module.zip');
const OUTPUT_MANIFEST = path.join(OUTPUT_DIR, 'translation-module-manifest.json');
// Where you will host the built files (written into the manifest)
const TRANSLATION_MODULE_BASE_URL = (process.env.DOCFAI_TRANSLATION_URL || 'https://example.com/translation').replace(/\/+$/, '');

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
const MODULE_VERSION = '1.0.0';

function checkPrerequisites() {
  console.log('Checking prerequisites...');

  if (!fs.existsSync(PYTHON_RUNTIME_DIR)) {
    console.error(`ERROR: Python runtime not found at: ${PYTHON_RUNTIME_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(PYTHON_MODELS_DIR)) {
    console.error(`ERROR: Translation models not found at: ${PYTHON_MODELS_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(TRANSLATE_SCRIPT)) {
    console.error(`ERROR: translate.py not found at: ${TRANSLATE_SCRIPT}`);
    process.exit(1);
  }

  // Check for 7-Zip (commonly available on Windows)
  const sevenZipPaths = [
    '7z',
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe'
  ];

  for (const szPath of sevenZipPaths) {
    try {
      execSync(`"${szPath}" --help`, { stdio: 'ignore' });
      console.log(`  7-Zip found: ${szPath}`);
      return szPath;
    } catch {
      // Try next path
    }
  }

  // Fallback to PowerShell Compress-Archive
  console.log('  7-Zip not found, will use PowerShell Compress-Archive (slower)');
  return 'powershell';
}

function computeSHA256(filePath) {
  console.log('Computing SHA-256 hash...');
  const fileBuffer = fs.readFileSync(filePath);
  const hash = createHash('sha256').update(fileBuffer).digest('hex');
  console.log(`  Hash: ${hash}`);
  return hash;
}

function computeModelHashes() {
  console.log('Computing translation model hashes...');
  const hashes = {};
  const modelFiles = fs.readdirSync(PYTHON_MODELS_DIR)
    .filter(f => f.endsWith('.argosmodel'))
    .sort();

  for (const model of modelFiles) {
    const modelPath = path.join(PYTHON_MODELS_DIR, model);
    hashes[model] = createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex');
    console.log(`  ${model}: ${hashes[model]}`);
  }

  return hashes;
}

async function buildZip(tool) {
  console.log('\nBuilding translation module zip...');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Remove existing zip if present
  if (fs.existsSync(OUTPUT_ZIP)) {
    fs.unlinkSync(OUTPUT_ZIP);
    console.log('  Removed existing zip');
  }

  // We need to create a zip with this structure:
  //   runtime/...
  //   models/*.argosmodel
  //   translate.py

  // Create a temporary staging directory
  const stagingDir = path.join(OUTPUT_DIR, '_translation-module-staging');
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  // Create symlinks/junctions to avoid copying (Windows junctions for directories)
  console.log('  Staging files...');

  try {
    // Use directory junctions on Windows (don't require admin)
    execSync(`mklink /J "${path.join(stagingDir, 'runtime')}" "${PYTHON_RUNTIME_DIR}"`, {
      stdio: 'ignore',
      shell: 'cmd.exe'
    });
  } catch {
    // Fallback: copy (slow but works)
    console.log('  Junction failed, copying runtime directory (this may take a while)...');
    execSync(`xcopy "${PYTHON_RUNTIME_DIR}" "${path.join(stagingDir, 'runtime')}" /E /I /Q /Y`, {
      stdio: 'inherit',
      shell: 'cmd.exe'
    });
  }

  // Copy models
  const modelsStaging = path.join(stagingDir, 'models');
  fs.mkdirSync(modelsStaging, { recursive: true });
  const modelFiles = fs.readdirSync(PYTHON_MODELS_DIR).filter(f => f.endsWith('.argosmodel'));
  for (const model of modelFiles) {
    fs.copyFileSync(path.join(PYTHON_MODELS_DIR, model), path.join(modelsStaging, model));
    console.log(`  Copied model: ${model}`);
  }

  // Copy translate.py
  fs.copyFileSync(TRANSLATE_SCRIPT, path.join(stagingDir, 'translate.py'));
  console.log('  Copied translate.py');

  // Create zip using spawn (no timeout) since this can take 10+ minutes for ~1.6GB
  console.log('  Creating zip archive (this may take 10-20 minutes for ~1.6GB)...');
  console.log('  Please be patient...');

  if (tool !== 'powershell') {
    execSync(`"${tool}" a -tzip -mx=5 "${OUTPUT_ZIP}" *`, {
      stdio: 'inherit',
      cwd: stagingDir
    });
  } else {
    // PowerShell Compress-Archive via spawn (no timeout limit)
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell', [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${OUTPUT_ZIP}' -CompressionLevel Optimal -Force`
      ], { stdio: 'inherit' });

      ps.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PowerShell exited with code ${code}`));
      });
      ps.on('error', reject);
    });
  }

  // Cleanup staging directory
  console.log('  Cleaning up staging directory...');
  // Remove junction first (don't delete through it)
  try {
    execSync(`rmdir "${path.join(stagingDir, 'runtime')}"`, { stdio: 'ignore', shell: 'cmd.exe' });
  } catch {
    // If it's a real copy, rmSync will handle it
  }
  fs.rmSync(stagingDir, { recursive: true, force: true });

  if (!fs.existsSync(OUTPUT_ZIP)) {
    console.error('ERROR: Zip file was not created');
    process.exit(1);
  }

  const stats = fs.statSync(OUTPUT_ZIP);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n  Zip created: ${OUTPUT_ZIP} (${sizeMB} MB)`);

  return stats.size;
}

function createManifest(zipSize, sha256, modelHashes) {
  console.log('\nCreating manifest...');

  const manifest = {
    version: MODULE_VERSION,
    appVersion: packageJson.version,
    sha256: sha256,
    size: zipSize,
    requiredDiskSpace: Math.ceil(zipSize * 2.5), // Estimate: zip + extracted
    filename: 'translation-module.zip',
    downloadUrl: `${TRANSLATION_MODULE_BASE_URL}/translation-module.zip`,
    manifestUrl: `${TRANSLATION_MODULE_BASE_URL}/translation-module-manifest.json`,
    contents: {
      runtime: 'Python 3.11 with argostranslate',
      models: ['translate-en_de.argosmodel', 'translate-de_en.argosmodel'],
      script: 'translate.py'
    },
    modelHashes,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest created: ${OUTPUT_MANIFEST}`);

  return manifest;
}

function printNextSteps(manifest) {
  console.log('\n' + '='.repeat(60));
  console.log('BUILD COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nModule version: ${manifest.version}`);
  console.log(`Zip size: ${(manifest.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`SHA-256: ${manifest.sha256}`);
  console.log(`\nFiles ready for upload:`);
  console.log(`  ${OUTPUT_ZIP}`);
  console.log(`  ${OUTPUT_MANIFEST}`);
  console.log(`\nNext steps - Upload both files to your hosting location:`);
  console.log(`\n  Upload both files to:`);
  console.log(`    ${TRANSLATION_MODULE_BASE_URL}/translation-module.zip`);
  console.log(`    ${TRANSLATION_MODULE_BASE_URL}/translation-module-manifest.json`);
  console.log('\n' + '='.repeat(60));
}

// Main
async function main() {
  console.log('='.repeat(60));
  console.log('Docfai Translation Module Builder');
  console.log('='.repeat(60));

  const tool = checkPrerequisites();
  const zipSize = await buildZip(tool);
  const sha256 = computeSHA256(OUTPUT_ZIP);
  const modelHashes = computeModelHashes();
  const manifest = createManifest(zipSize, sha256, modelHashes);
  printNextSteps(manifest);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
