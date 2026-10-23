import DOMPurify from 'dompurify';
import type { ProjectExportData } from './ProjectExportService';

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'metadata',
  'project',
  'recordings',
  'screenshots',
  'documentationSteps',
  'exports',
  'uploads',
  'encryptedNotes'
]);

const ALLOWED_ACTION_TYPES = new Set(['click', 'type', 'scroll', 'key', 'navigate', 'diagram', 'video']);
const ALLOWED_MEDIA_TYPES = new Set(['image', 'video']);

export interface ImportPreviewData {
  name: string;
  description: string;
  createdAt: string;
  recordingsCount: number;
  screenshotsCount: number;
  stepsCount: number;
  size: number;
  version: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeText(value: unknown, fallback = '', maxLength = 500): string {
  const input = typeof value === 'string' ? value : fallback;
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .trim()
    .slice(0, maxLength);
}

function sanitizeHtml(value: unknown, fallback = '', maxLength = 20000): string {
  const input = typeof value === 'string' ? value : fallback;
  return DOMPurify.sanitize(input).slice(0, maxLength);
}

function sanitizeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizePlainJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback)) as T;
  } catch {
    return fallback;
  }
}

function sanitizeDateString(value: unknown): string {
  const text = sanitizeText(value, new Date().toISOString(), 80);
  return Number.isNaN(Date.parse(text)) ? new Date().toISOString() : text;
}

function assertNoUnknownTopLevelKeys(data: Record<string, unknown>): void {
  const unknownKeys = Object.keys(data).filter(key => !ALLOWED_TOP_LEVEL_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Invalid project data: unknown top-level keys: ${unknownKeys.join(', ')}`);
  }
}

export function validateAndSanitizeProjectExportData(input: unknown): ProjectExportData {
  if (!isRecord(input)) {
    throw new Error('Invalid project data: expected object');
  }

  assertNoUnknownTopLevelKeys(input);

  const metadata = isRecord(input.metadata) ? input.metadata : null;
  const project = isRecord(input.project) ? input.project : null;

  if (!metadata || !project) {
    throw new Error('Invalid project data: missing required fields');
  }

  const projectName = sanitizeText(project.name, '', 120);
  if (!projectName) {
    throw new Error('Invalid project data: missing project name');
  }

  const version = sanitizeText(metadata.version, '', 40);
  if (!version) {
    throw new Error('Invalid project data: missing version information');
  }

  const sanitized: ProjectExportData = {
    metadata: {
      exportedAt: sanitizeDateString(metadata.exportedAt),
      exportedBy: sanitizeText(metadata.exportedBy, 'unknown', 120),
      version,
      projectId: sanitizeText(metadata.projectId, '', 120),
      projectName: sanitizeText(metadata.projectName, projectName, 120)
    },
    project: {
      id: sanitizeText(project.id, '', 120),
      name: projectName,
      description: sanitizeText(project.description, '', 1000),
      createdAt: sanitizeDateString(project.createdAt),
      updatedAt: sanitizeDateString(project.updatedAt),
      settings: sanitizePlainJson(project.settings, {})
    },
    recordings: sanitizeArray(input.recordings).map((item, index) => {
      const record = isRecord(item) ? item : {};
      return {
        id: sanitizeText(record.id, `recording-${index}`, 120),
        name: sanitizeText(record.name, `Recording ${index + 1}`, 240),
        duration: sanitizeNumber(record.duration),
        resolution: sanitizeText(record.resolution, '', 40),
        fps: sanitizeNumber(record.fps),
        createdAt: sanitizeDateString(record.createdAt),
        filePath: sanitizeText(record.filePath, '', 500),
        fileData: typeof record.fileData === 'string' ? record.fileData : ''
      };
    }),
    screenshots: sanitizeArray(input.screenshots).map((item, index) => {
      const record = isRecord(item) ? item : {};
      return {
        id: sanitizeText(record.id, `screenshot-${index}`, 120),
        name: sanitizeText(record.name, `Screenshot ${index + 1}`, 240),
        createdAt: sanitizeDateString(record.createdAt),
        filePath: sanitizeText(record.filePath, '', 500),
        fileData: typeof record.fileData === 'string' ? record.fileData : ''
      };
    }),
    documentationSteps: sanitizeArray(input.documentationSteps).map((item, index) => {
      const record = isRecord(item) ? item : {};
      const actionType = sanitizeText(record.actionType, 'click', 40);
      const mediaType = sanitizeText(record.mediaType, '', 40);
      return {
        id: sanitizeText(record.id, `step-${index}`, 120),
        timestamp: sanitizeNumber(record.timestamp),
        title: sanitizeText(record.title, `Step ${index + 1}`, 240),
        description: sanitizeHtml(record.description, ''),
        screenshot: sanitizeText(record.screenshot, '', 120) || undefined,
        actionType: (ALLOWED_ACTION_TYPES.has(actionType) ? actionType : 'click') as ProjectExportData['documentationSteps'][number]['actionType'],
        element: sanitizeText(record.element, '', 500) || undefined,
        isGenerated: sanitizeBoolean(record.isGenerated),
        type: sanitizeText(record.type, '', 80) || undefined,
        diagramJsonPath: sanitizeText(record.diagramJsonPath, '', 500) || undefined,
        diagramImagePath: sanitizeText(record.diagramImagePath, '', 500) || undefined,
        diagramElements: Array.isArray(record.diagramElements) ? sanitizePlainJson(record.diagramElements, []) : undefined,
        diagramAppState: isRecord(record.diagramAppState) ? sanitizePlainJson(record.diagramAppState, {}) : undefined,
        mediaType: (ALLOWED_MEDIA_TYPES.has(mediaType) ? mediaType : undefined) as ProjectExportData['documentationSteps'][number]['mediaType'],
        videoClipPath: sanitizeText(record.videoClipPath, '', 500) || undefined,
        videoClipMimeType: sanitizeText(record.videoClipMimeType, '', 120) || undefined
      };
    }),
    exports: sanitizeArray(input.exports).map((item, index) => {
      const record = isRecord(item) ? item : {};
      return {
        id: sanitizeText(record.id, `export-${index}`, 120),
        name: sanitizeText(record.name, `Export ${index + 1}`, 240),
        type: sanitizeText(record.type, '', 80),
        createdAt: sanitizeDateString(record.createdAt),
        filePath: sanitizeText(record.filePath, '', 500),
        fileData: typeof record.fileData === 'string' ? record.fileData : ''
      };
    }),
    uploads: sanitizeArray(input.uploads).map((item, index) => {
      const record = isRecord(item) ? item : {};
      return {
        id: sanitizeText(record.id, `upload-${index}`, 120),
        name: sanitizeText(record.name, `Upload ${index + 1}`, 240),
        type: sanitizeText(record.type, '', 80),
        createdAt: sanitizeDateString(record.createdAt),
        filePath: sanitizeText(record.filePath, '', 500),
        fileData: typeof record.fileData === 'string' ? record.fileData : ''
      };
    })
  };

  if (isRecord(input.encryptedNotes)) {
    sanitized.encryptedNotes = sanitizePlainJson(input.encryptedNotes, {}) as ProjectExportData['encryptedNotes'];
  }

  return sanitized;
}

export function createImportPreview(
  projectData: ProjectExportData,
  fileName: string,
  fileSize: number
): ImportPreviewData {
  return {
    name: projectData.project.name || sanitizeText(fileName.replace(/\.(docfai|zip)$/i, ''), 'Imported project', 120),
    description: projectData.project.description || 'Imported project from backup',
    createdAt: projectData.project.createdAt || projectData.metadata.exportedAt || new Date().toISOString(),
    recordingsCount: projectData.recordings.length,
    screenshotsCount: projectData.screenshots.length,
    stepsCount: projectData.documentationSteps.length,
    size: fileSize,
    version: projectData.metadata.version
  };
}
