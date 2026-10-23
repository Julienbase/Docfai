/**
 * Electron Builder Configuration
 *
 * ASAR tamper protection is provided by Electron Fuses
 * (enableEmbeddedAsarIntegrityValidation + onlyLoadAppFromAsar) below.
 *
 * Optional build-time settings (environment variables):
 *   DOCFAI_UPDATE_URL  Generic auto-update feed (e.g. https://example.com/win).
 *                      When unset, the app is built without auto-update.
 *
 * Code signing is not configured. Builds are unsigned unless you add your own
 * signing setup (see the electron-builder docs on Windows code signing).
 */

const updateUrl = process.env.DOCFAI_UPDATE_URL;

export default {
  appId: 'com.docfai.app',
  productName: 'Docfai',
  icon: 'src/assets/logo.png',

  // Auto-update is opt-in: only generate a feed when DOCFAI_UPDATE_URL is set
  ...(updateUrl ? { publish: [{ provider: 'generic', url: updateUrl }] } : { publish: null }),

  // SECURITY: Electron Fuses — anti-tamper protections baked into the executable
  electronFuses: {
    resetAdHocDarwinSignature: false,
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false
  },
  directories: {
    // Keep installer output separate from Vite's dist/ so the packed app
    // doesn't include a copy of a previous build
    output: 'release'
  },
  files: [
    'dist/**/*',
    'public/electron.js',
    'public/preload.cjs',
    'public/services/**/*',
    'node_modules/**/*'
  ],
  extraResources: [
    {
      from: 'src/assets/logo.png',
      to: 'app-icon.png'
    },
    // Built by node-gyp during `npm install` (see binding.gyp)
    {
      from: 'build/Release/auto_click_capture.node',
      to: 'build/Release/auto_click_capture.node'
    },
    // Python runtime, models, and translate.py are downloaded on demand
    // via TranslationModuleManager to %APPDATA%/Docfai/translation-module/
    // FFmpeg binaries are vendored by scripts/fetch-ffmpeg.cjs (pinned
    // gyan.dev essentials build, GPL-3.0-or-later — see THIRD-PARTY-NOTICES.txt)
    {
      from: 'vendor/ffmpeg/win32/x64/ffmpeg.exe',
      to: 'ffmpeg/win32/x64/ffmpeg.exe'
    },
    {
      from: 'vendor/ffmpeg/win32/x64/ffprobe.exe',
      to: 'ffmpeg/win32/x64/ffprobe.exe'
    },
    {
      from: 'vendor/ffmpeg/win32/x64/LICENSE.txt',
      to: 'ffmpeg/LICENSE.txt'
    },
    {
      from: 'THIRD-PARTY-NOTICES.txt',
      to: 'THIRD-PARTY-NOTICES.txt'
    },
    {
      from: 'LICENSE',
      to: 'LICENSE.txt'
    }
  ],
  asar: true,
  asarUnpack: [
    'public/preload.cjs',
    'public/services/**/*'
  ],
  win: {
    target: ['nsis']
  },
  nsis: {
    artifactName: 'Docfai-Setup-${version}.exe',
    oneClick: false,
    perMachine: false,
    allowElevation: false,  // Prevent "all users" installation option
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    differentialPackage: true  // Enable delta/differential updates
  },
  compression: 'maximum',
  npmRebuild: false,
  nodeGypRebuild: false
};
