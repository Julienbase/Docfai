import path from 'path';

export interface ProjectFolderStructure {
  projectPath: string;
  recordingsPath: string;
  screenshotsPath: string;
  exportsPath: string;
  uploadsPath: string;
}

export class ProjectFileService {
  private static readonly PROJECTS_ROOT = 'DocFAI_Projects';
  private static readonly RECORDINGS_FOLDER = 'recordings';
  private static readonly SCREENSHOTS_FOLDER = 'step_by_step_screenshots';
  private static readonly EXPORTS_FOLDER = 'exports';
  private static readonly UPLOADS_FOLDER = 'uploads';
  private static readonly WINDOWS_RESERVED_FILENAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

  private static avoidReservedWindowsName(name: string): string {
    return this.WINDOWS_RESERVED_FILENAME_RE.test(name) ? `_${name}` : name;
  }

  /**
   * Sanitize project name for use as folder name
   */
  static sanitizeProjectName(name: string): string {
    const sanitized = name
      .replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .replace(/[. ]+$/g, ''); // Windows rejects trailing dots/spaces

    return this.avoidReservedWindowsName(sanitized || 'untitled_project').substring(0, 100);
  }

  /**
   * Get project folder structure paths
   */
  static getProjectPaths(projectName: string, basePath?: string): ProjectFolderStructure {
    const sanitizedName = this.sanitizeProjectName(projectName);
    const projectsRoot = basePath || this.getDefaultProjectsPath();
    const projectPath = path.join(projectsRoot, sanitizedName);
    
    return {
      projectPath,
      recordingsPath: path.join(projectPath, this.RECORDINGS_FOLDER),
      screenshotsPath: path.join(projectPath, this.SCREENSHOTS_FOLDER),
      exportsPath: path.join(projectPath, this.EXPORTS_FOLDER),
      uploadsPath: path.join(projectPath, this.UPLOADS_FOLDER)
    };
  }

  /**
   * Get default projects root path (user's Documents folder)
   */
  static getDefaultProjectsPath(): string {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // In Electron, use app data directory
      return path.join(window.electronAPI.getAppPath?.() || '', this.PROJECTS_ROOT);
    }
    // Fallback for web environment
    return this.PROJECTS_ROOT;
  }

  /**
   * Generate unique filename for recordings
   */
  static generateRecordingFilename(projectName: string, extension: string = 'webm'): string {
    const timestamp = Date.now();
    const sanitizedName = this.sanitizeProjectName(projectName);
    return `recording_${sanitizedName}_${timestamp}.${extension}`;
  }

  /**
   * Generate unique filename for screenshots
   */
  static generateScreenshotFilename(projectName: string, sequence: number, extension: string = 'jpg'): string {
    const timestamp = Date.now();
    const sanitizedName = this.sanitizeProjectName(projectName);
    return `screenshot_${sanitizedName}_${timestamp}_${sequence.toString().padStart(3, '0')}.${extension}`;
  }

  /**
   * Generate unique filename for exported files
   */
  static generateExportFilename(projectName: string, format: string, extension: string): string {
    const timestamp = Date.now();
    const sanitizedName = this.sanitizeProjectName(projectName);
    return `export_${sanitizedName}_${format}_${timestamp}.${extension}`;
  }

  /**
   * Generate unique filename for uploaded videos
   */
  static generateUploadFilename(projectName: string, originalName: string): string {
    const timestamp = Date.now();
    const sanitizedName = this.sanitizeProjectName(projectName);
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    return `upload_${sanitizedName}_${baseName}_${timestamp}${extension}`;
  }

  /**
   * Get relative path for serving files through dev server
   */
  static getRelativeFilePath(fullPath: string, projectName: string): string {
    const sanitizedName = this.sanitizeProjectName(projectName);
    const filename = path.basename(fullPath);
    
    if (fullPath.includes(this.RECORDINGS_FOLDER)) {
      return `./projects/${sanitizedName}/recordings/${filename}`;
    } else if (fullPath.includes(this.SCREENSHOTS_FOLDER)) {
      return `./projects/${sanitizedName}/screenshots/${filename}`;
    } else if (fullPath.includes(this.EXPORTS_FOLDER)) {
      return `./projects/${sanitizedName}/exports/${filename}`;
    } else if (fullPath.includes(this.UPLOADS_FOLDER)) {
      return `./projects/${sanitizedName}/uploads/${filename}`;
    }
    
    return `./projects/${sanitizedName}/${filename}`;
  }
}

export default ProjectFileService
