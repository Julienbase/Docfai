export interface ElectronAPI {
  // Screen recording APIs
  getSources: () => Promise<DesktopCapturerSource[]>;
  getRetakeSources: () => Promise<{ success: boolean; sources: Array<{ id: string; name: string; thumbnail: string }>; error?: string }>;
  captureSourceScreenshot: (sourceId: string) => Promise<{ success: boolean; imageData?: string; error?: string }>;
  getScreenInfo: () => Promise<DisplayInfo[]>;
  
  // Global recording APIs
  startGlobalRecording: (source?: DesktopCapturerSource) => Promise<GlobalRecordingResult>;
  stopGlobalRecording: () => Promise<GlobalRecordingResult>;
  captureDesktopScreenshot: (clickX?: number, clickY?: number) => Promise<ScreenshotResult>;
  getGlobalRecordingStatus: () => Promise<GlobalRecordingStatus>;
  
  // Screenshot capture APIs
  startScreenshotCapture: (source?: any) => Promise<GlobalRecordingResult>;
  stopScreenshotCapture: () => Promise<GlobalRecordingResult>;
  createMediaStream: (sourceId: string) => Promise<{ success: boolean; sourceId: string }>;

  // Auto-capture APIs (click detection + UIAutomation)
  startAutoCapture: (config?: AutoCaptureConfig) => Promise<{ success: boolean; error?: string }>;
  stopAutoCapture: () => Promise<{ success: boolean; captureCount?: number; error?: string }>;
  getAutoCaptureStatus: () => Promise<{ active: boolean; captureCount: number }>;
  onAutoCaptureClickDetected: (callback: (data: AutoCaptureClickEvent) => void) => () => void;
  onAutoCaptureError: (callback: (data: { error: string; clickX: number; clickY: number }) => void) => () => void;
  
  // File operations
  saveRecording: (data: SaveRecordingData) => Promise<SaveResult>;
  saveVideoRecording: (videoBlob: ArrayBuffer, fileName?: string) => Promise<SaveResult>;
  saveProjectVideoRecording: (projectName: string, videoBlob: ArrayBuffer, fileName?: string) => Promise<SaveResult>;
  exportFile: (data: ExportData) => Promise<ExportResult>;
  generateFileContent: (data: { format: string; content: any; options?: any }) => Promise<{ success: boolean; fileData?: string; size?: number; error?: string }>;
  exportVideo?: (data: VideoExportData) => Promise<ExportResult>;
  previewDocumentation: (data: { content: any; options?: any }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  
  // Diagram operations
  saveDiagram: (data: SaveDiagramData) => Promise<SaveDiagramResult>;
  deleteDiagramFile: (projectName: string, fileName: string) => Promise<{ success: boolean; error?: string }>;
  
  // Project-based file operations
  getAppPath: () => string;
  createProjectFolder: (projectName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  saveProjectRecording: (projectName: string, filename: string, data: Blob | ArrayBuffer | Uint8Array) => Promise<SaveResult>;
  saveProjectScreenshot: (projectName: string, filename: string, imageData: string | Buffer) => Promise<SaveResult>;
  saveProjectExport: (projectName: string, fileName: string, fileData: ArrayBuffer | Uint8Array, fileType: string) => Promise<{ filePath: string; relativePath: string }>;
  openExportedFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  saveProjectUpload: (projectName: string, fileName: string, videoData: ArrayBuffer) => Promise<SaveResult>;
  deleteProjectScreenshot: (projectName: string, filename: string) => Promise<boolean>;
  deleteProjectFolder: (projectName: string) => Promise<{ success: boolean; error?: string }>;
  deleteProjectFiles: (projectName: string) => Promise<{ success: boolean; deletedCount: number }>;
  getProjectFilePath: (projectName: string, relativePath: string) => Promise<string | null>;
  listProjectFiles: (projectName: string, subDirectory?: string) => Promise<Array<{name: string, isDirectory: boolean, path: string}>>;

  // Video processing APIs
  extractVideoFrames: (videoPath: string, options: FrameExtractionOptions) => Promise<VideoFrame[]>;
  generateVideoThumbnail: (projectName: string, videoClipPath: string) => Promise<string>;


  onSceneDetectionProgress: (callback: (data: {
    stage: 'extracting' | 'comparing' | 'saving' | 'complete';
    progress: number;
    message: string;
  }) => void) => () => void;

  // Bookmark-based step extraction (extract frames at F10 bookmark timestamps)
  extractStepsFromBookmarks: (
    videoPath: string,
    projectName: string,
    bookmarks: BookmarkEvent[]
  ) => Promise<{
    success: boolean;
    steps?: Array<{
      id: string;
      timestamp: number;
      title: string;
      description: string;
      screenshot?: string;
      actionType: string;
      element?: string;
      isGenerated: boolean;
    }>;
    stepCount?: number;
    error?: string;
  }>;

  // File URL handling
  getFileUrl: (filePath: string) => Promise<string>;
  saveTemporaryFile: (buffer: ArrayBuffer, filename: string) => Promise<string>;
  
  // Window controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;

  // App utilities
  openAppDataFolder: () => Promise<{ success: boolean; error?: string }>;
  exportErrorLogs: (rendererLogs?: string) => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>;

  // In-app navigation
  navigateToPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  
  // Platform info
  platform: string;
  
  // Secure path utilities (replaces unsafe getCwd)
  getDocumentsPath: () => Promise<string>;
  getProjectsDirectory: () => Promise<string>;
  getProjectScreenshotsDirectory: (projectName: string) => Promise<string>;
  getProjectUploadsDirectory: (projectName: string) => Promise<string>;
  getAbsoluteScreenshotPath: (projectName: string, fileName: string) => Promise<string | null>;
  
  // Event listeners
  onRecordingUpdate: (callback: (event: any, data: RecordingUpdate) => void) => () => void;
  onExportProgress: (callback: (event: any, data: ExportProgress) => void) => () => void;
  onScreenshotCaptured: (callback: (event: any, data: ScreenshotResult) => void) => () => void;
  onVideoRecordingStarted: (callback: (event: any, data: any) => void) => () => void;
  onVideoRecordingStopped: (callback: (event: any, data: any) => void) => () => void;
  onCreateVideoStream: (callback: (event: any, data: any) => void) => () => void;
  onVideoRecordingError: (callback: (event: any, data: any) => void) => () => void;
  
  // Store-Compliant Hotkey Screen Capture (replaces prohibited mouse hooks)
  getHotkeyConfig: () => Promise<{ success: boolean; config: HotkeyConfig; error?: string }>;
  saveHotkeyConfig: (config: HotkeyConfig) => Promise<{ success: boolean; error?: string }>;
  updateHotkeys: (primary: string, secondary?: string) => Promise<{ success: boolean; error?: string }>;

  // Event listeners for hotkey-based capture
  onCaptureInstructions: (callback: (data: CaptureInstructions) => void) => () => void;
  onScreenshotCaptured: (callback: (event: any, data: ScreenshotCapturedEvent) => void) => () => void;
  onScreenshotError: (callback: (data: { error: string }) => void) => () => void;

  // REMOVED: onGlobalMouseClick - Microsoft Store compliance (global mouse hooks are prohibited)
  onNativeScreenshotReady?: (callback: (event: any, data: { pngBuffer: Buffer; timestamp: number; clickX: number; clickY: number }) => void) => () => void;
  onDebugLog?: (callback: (event: any, data: any) => void) => () => void;

  // Bookmark event listener for video recording timeline markers
  onBookmarkCreated?: (callback: (event: any, data: BookmarkEvent) => void) => () => void;

  // Encryption and external links
  encryptData: (data: string) => Promise<string>;
  decryptData: (encryptedData: string) => Promise<string>;
  openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  // Debug and messaging APIs
  showMessageBox: (options: MessageBoxOptions) => Promise<{ success: boolean; response?: number; error?: string }>;
  logDebug: (message: string) => Promise<void>;

  // Translation APIs (Argos Translate - Python)
  translateText: (params: { text: string; targetLang: string; sourceLang?: string }) => Promise<{ translatedText: string; detectedSourceLang?: string; error?: string }>;
  translateBatch: (params: { texts: string[]; targetLang: string; sourceLang?: string }) => Promise<{ translatedTexts: string[]; error?: string }>;

  // Translation Module Management (on-demand download)
  translationModuleStatus: () => Promise<{
    installed: boolean;
    version?: string;
    path?: string;
    installedAt?: string;
  }>;
  translationModuleDownload: () => Promise<{ success: boolean; error?: string }>;
  translationModuleCancelDownload: () => Promise<void>;
  translationModuleUninstall: () => Promise<{ success: boolean; error?: string }>;
  translationModuleCheckDiskSpace: () => Promise<{
    available: number;
    required: number;
    sufficient: boolean;
  }>;
  onTranslationModuleProgress: (callback: (data: {
    phase: 'preparing' | 'downloading' | 'verifying' | 'extracting';
    percent: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
    message?: string;
  }) => void) => () => void;
  onTranslationModuleComplete: (callback: (data: {
    success: boolean;
    error?: string;
  }) => void) => () => void;

  // Auto-Update APIs
  checkForUpdates: () => Promise<{ available: boolean; currentVersion?: string; latestVersion?: string; method?: string; message?: string; error?: string }>;
  installUpdate: () => Promise<{ success: boolean; message?: string; error?: string }>;
  getAppVersion: () => Promise<{ version: string; isStoreVersion: boolean }>;
  onUpdateAvailable: (callback: (data: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => () => void;
  onUpdateProgress: (callback: (data: { percent: number; bytesPerSecond: number; total: number; transferred: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (data: { version: string; releaseNotes?: string }) => void) => () => void;
  onUpdateError: (callback: (data: { message: string }) => void) => () => void;

  // IPC messaging
  sendMessage: (channel: string, data: any) => void;
  onMessage: (channel: string, callback: (event: any, data: any) => void) => void;
  removeListener: (channel: string, callback: (event: any, data: any) => void) => void;

  // General IPC messaging
  ipcInvoke: (channel: string, ...args: any[]) => Promise<any>;
  ipcSend: (channel: string, ...args: any[]) => void;
  ipcOn: (channel: string, listener: (...args: any[]) => void) => void;
  ipcOff: (channel: string, listener: (...args: any[]) => void) => void;
  ipcOnce: (channel: string, listener: (...args: any[]) => void) => void;
  ipcRemoveAllListeners: (channel: string) => void;

  // Storage APIs - electron-store based persistent storage (replaces localStorage)
  storage: {
    getItem: (key: string) => Promise<{ success: boolean; value: string | null; error?: string }>;
    setItem: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
    removeItem: (key: string) => Promise<{ success: boolean; error?: string }>;
    clear: () => Promise<{ success: boolean; error?: string }>;
    keys: () => Promise<{ success: boolean; keys: string[]; error?: string }>;
    getStats: () => Promise<{
      success: boolean;
      stats?: {
        size: number;
        sizeFormatted: string;
        keys: number;
        path: string;
        keyDetails: Array<{
          key: string;
          size: number;
          sizeFormatted: string;
        }>;
      };
      error?: string;
    }>;
    migrateFromLocalStorage: (localStorageData: Record<string, string>) => Promise<{
      success: boolean;
      migrationResult?: {
        success: boolean;
        migratedKeys: string[];
        errors: Array<{ key: string; error: string }>;
        totalSize: number;
      };
      error?: string;
    }>;
    hasData: () => Promise<{ success: boolean; hasData: boolean; error?: string }>;
  };

  // Backup and Export APIs
  backup: {
    showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    selectBackupDirectory: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
    selectImportFile: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
    readImportFile: (filePath: string) => Promise<{ success: boolean; data?: Buffer; error?: string }>;
    writeBackupFile: (filePath: string, data: Buffer | Uint8Array) => Promise<{ success: boolean; path?: string; size?: number; error?: string }>;
    getDirectorySize: (dirPath: string) => Promise<{ success: boolean; size?: number; error?: string }>;
    pathExists: (filePath: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
    getDiskSpace: (dirPath: string) => Promise<{ success: boolean; free?: number; total?: number; error?: string }>;
    createBackupDirectory: (basePath: string, projectName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    copyFileWithProgress: (sourcePath: string, destPath: string) => Promise<{ success: boolean; size?: number; error?: string }>;
    readFileAsBase64: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
    getSystemInfo: () => Promise<{
      success: boolean;
      platform?: string;
      arch?: string;
      version?: string;
      appVersion?: string;
      userDataPath?: string;
      documentsPath?: string;
      tempPath?: string;
      error?: string;
    }>;

    // Event listeners for backup progress
    onBackupProgress: (callback: (data: {
      type: string;
      progress: number;
      file?: string;
      copiedSize?: number;
      totalSize?: number;
    }) => void) => () => void;

    onBackupComplete: (callback: (data: {
      backupId: string;
      path: string;
      size: number;
      duration: number;
    }) => void) => () => void;

    onBackupError: (callback: (data: {
      backupId: string;
      error: string;
      step?: string;
    }) => void) => () => void;
  };

  // Version Management APIs
  versions: {
    listVersionFiles: (projectVersionsDir: string) => Promise<{
      success: boolean;
      files?: Array<{
        name: string;
        path: string;
        size: number;
        createdAt: string;
        modifiedAt: string;
      }>;
      error?: string;
    }>;
    deleteVersionFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    showVersionInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    moveDirectory: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
  };
}

export interface NodeAPI {
  path: {
    join: (...args: string[]) => string;
    dirname: (path: string) => string;
    basename: (path: string) => string;
  };
}

export interface DesktopCapturerSource {
  id: string;
  name: string;
  thumbnail: {
    toDataURL: () => string;
  } | string;
}

export interface DisplayInfo {
  id: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  workArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
  primary: boolean;
}

export interface SaveRecordingData {
  filename: string;
  data: Blob | ArrayBuffer | Uint8Array;
  metadata?: {
    duration: number;
    resolution: string;
    fps: number;
  };
}

export interface SaveResult {
  success: boolean;
  path?: string;
  filePath?: string;
  relativePath?: string;
  error?: string;
}

export interface ExportData {
  format: 'pdf' | 'markdown' | 'pptx' | 'video';
  content: any;
  outputPath: string;
  options?: {
    theme?: 'light' | 'dark';
    template?: 'minimal' | 'corporate' | 'technical';
    customization?: {
      fontFamily?: string;
      primaryColor?: string;
      logo?: string;
    };
    // Template configuration for PDF/PPTX generation
    templateConfig?: PdfTemplateConfig | null;
    // Translation language for template strings (Step, Approvals, etc.)
    translateTo?: 'none' | 'EN' | 'DE';
  };
}

// PDF Template configuration type (matches templatePdfConfig.ts)
export interface PdfTemplateConfig {
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  headingFont: string;
  bodyFont: string;
  fontSize: {
    title: number;
    heading1: number;
    heading2: number;
    body: number;
    caption: number;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
    headerBg: string;
    headerText: string;
    border: string;
  };
  header: {
    show: boolean;
    companyLogo: string | null;
    companyName: string;
    documentId: string;
    revision: string;
    includeDate: boolean;
  };
  footer: {
    show: boolean;
    includePageNumbers: boolean;
    confidentialityText: string;
    includeDocumentName: boolean;
  };
  stepLayout: {
    imagePosition: 'above' | 'below' | 'left' | 'right' | 'inline';
    imageSize: 'small' | 'medium' | 'large' | 'full-width';
    showStepNumbers: boolean;
    numberingStyle: 'decimal' | 'roman' | 'alpha' | 'bullet' | 'none';
    borderStyle: 'none' | 'solid' | 'dashed' | 'double';
    stepSpacing: 'compact' | 'normal' | 'spacious';
  };
  options: {
    showDocumentSummary: boolean;
    showTableOfContents: boolean;
    showApprovalSection: boolean;
    templateId: string;
    templateName: string;
  };
  customSections: {
    purpose?: string;
    scope?: string;
    prerequisites?: string;
  };
}

export interface VideoExportData {
  format: 'mp4' | 'webm' | 'avi' | 'mov';
  filePath: string;
  options: {
    quality: '720p' | '1080p' | '2k';
    compression: 'low' | 'medium' | 'high';
    includeAudio: boolean;
    trimStart: number;
    trimEnd: number;
    addWatermark: boolean;
    frameRate: 30 | 60;
  };
  outputPath: string;
}

export interface ExportResult {
  success: boolean;
  path?: string;
  outputPath?: string;
  error?: string;
  canceled?: boolean;
  fileData?: string;
}

export interface RecordingUpdate {
  status: 'recording' | 'paused' | 'stopped';
  duration: number;
  fileSize?: number;
}

export interface ExportProgress {
  progress: number;
  stage: string;
  estimated?: number;
}

export interface GlobalRecordingResult {
  success: boolean;
  error?: string;
}

export interface ScreenshotResult {
  success: boolean;
  imageData?: string;
  clickX?: number;
  clickY?: number;
  timestamp?: number;
  error?: string;
}

export interface GlobalRecordingStatus {
  isRecording: boolean;
  screenshots?: Array<{
    timestamp: number;
    imageData: string;
    clickX: number;
    clickY: number;
  }>;
  error?: string;
}

export interface FrameExtractionOptions {
  interval: number;
  startTime?: number;
  endTime?: number;
  maxFrames?: number;
  quality?: 'low' | 'medium' | 'high' | '2k';
}

export interface VideoFrame {
  frameNumber: number;
  timestamp: number;
  imagePath: string;
  width: number;
  height: number;
}






// Video Event Analysis Types
export interface VideoEventAnalysisOptions {
  detectClicks?: boolean;
  detectKeyboard?: boolean;
  detectUIElements?: boolean;
  cursorDetectionThreshold?: number;
  frameAnalysisInterval?: number;
}

export interface ClickEvent {
  timestamp: number;
  x: number;
  y: number;
  frameNumber: number;
  confidence: number;
  uiElement?: string;
}

export interface KeyboardInputEvent {
  timestamp: number;
  frameNumber: number;
  text?: string;
  confidence: number;
  inputField?: string;
}

export interface UIElement {
  id: string;
  type: string;
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface VideoEventAnalysisResult {
  clickEvents: ClickEvent[];
  keyboardEvents: KeyboardInputEvent[];
  uiElements: UIElement[];
  totalEvents: number;
  processingTime: number;
  outputFile?: string;
}

export interface VideoEventAnalysisProgress {
  progress: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
}

// REMOVED: GlobalMouseClickEvent - Microsoft Store compliance
// Global mouse hooks are prohibited by Microsoft Store policies

// ============================================================================
// Store-Compliant Hotkey Screen Capture Types
// ============================================================================

export interface HotkeyConfig {
  primary: string;       // e.g., 'F8'
  secondary?: string;    // e.g., 'CommandOrControl+Shift+C'
}

export interface CaptureInstructions {
  message: string;
  mode: 'hotkey' | 'automatic';
  primary_hotkey: string;
  secondary_hotkey?: string;
  note: string;
}

export interface ScreenshotCapturedEvent {
  id: string;
  timestamp: number;
  x: number;
  y: number;
  screenshotPath: string;
  triggeredBy: string;  // Which hotkey was used
}

export interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  title?: string;
  message: string;
  buttons?: string[];
  defaultId?: number;
}

// Diagram Types
export interface SaveDiagramData {
  stepId: string;
  title: string;
  projectName: string;
  diagramJson: string; // JSON stringified diagram data
  diagramImage: string; // Base64 image data
}

export interface SaveDiagramResult {
  success: boolean;
  jsonPath?: string;
  imagePath?: string;
  error?: string;
}

// Bookmark event for video recording timeline markers
export interface BookmarkEvent {
  id: string;
  timestamp: number;        // Milliseconds relative to recording start
  recordingTimestamp: number; // Absolute Date.now() for reference
  title?: string;           // Editable label (default: "Bookmark at MM:SS")
  description?: string;     // Optional notes
}

// Auto-capture types
export interface AutoCaptureConfig {
  debounceMs?: number;
  captureRightClicks?: boolean;
  showNotifications?: boolean;
  sourceInfo?: { id: string; name: string; type?: string; thumbnail?: string } | null;
  initialStepCount?: number;
}

export interface AutoCaptureClickEvent {
  clickX: number;
  clickY: number;
  clickType: 'click' | 'rightclick' | 'doubleclick';
  timestamp: number;
  elementName: string | null;
  elementType: string;
  stepDescription: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    nodeAPI: NodeAPI;
  }
}
