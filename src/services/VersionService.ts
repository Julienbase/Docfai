import { useAppStore, type ProjectVersion } from '../store/useAppStore';
import { ProjectExportService } from './ProjectExportService';

const MAX_VERSIONS = 20;

class VersionService {
  /**
   * Save a version of the current project state.
   * Builds a .docfai ZIP snapshot and stores it in the project's versions/ folder.
   * This is the main entry point — triggered by the user clicking "Save Version".
   */
  async saveVersion(
    projectId: string,
    onProgress?: (message: string) => void
  ): Promise<ProjectVersion | null> {
    try {
      const { projects, user, updateProject } = useAppStore.getState();
      const project = projects.find(p => p.id === projectId);
      if (!project) throw new Error('Project not found');
      if (!user) throw new Error('User not authenticated');

      onProgress?.('Building project snapshot...');

      // Use ProjectExportService to build the ZIP internally
      const exportService = new ProjectExportService();
      const exportOptions = {
        includeRecordings: true,
        includeScreenshots: true,
        includeExports: false, // Don't include generated exports in version snapshots
        includeUploads: true,
        includeDocumentation: true,
        destination: { type: 'local' as const },
      };

      // Collect project data and create ZIP (reusing existing export logic)
      const projectData = await exportService.collectProjectData(projectId, exportOptions);
      const zipBlob: Blob = await exportService.createZipPackage(projectData, exportOptions);

      onProgress?.('Saving version to disk...');

      // Resolve the versions directory
      const projectsDir = await window.electronAPI.getProjectsDirectory();
      const versionsDir = `${projectsDir}/${project.name}/versions`;

      // Build filename with timestamp
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const versionFilename = `v_${project.name}_${timestamp}.docfai`;
      const fullPath = `${versionsDir}/${versionFilename}`;

      // Write the ZIP to the versions folder (ensureDir is called inside writeBackupFile)
      const arrayBuffer = await zipBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const result = await window.electronAPI.backup.writeBackupFile(fullPath, uint8Array);

      if (!result.success) {
        throw new Error(result.error || 'Failed to write version file');
      }

      // Re-read the latest project state from the store (it may have changed
      // during the async ZIP build above — e.g. if user saved another version)
      const latestState = useAppStore.getState();
      const latestProject = latestState.projects.find(p => p.id === projectId);
      const existingVersions = latestProject?.versions || [];

      // Calculate next version number
      const nextNumber = existingVersions.length > 0
        ? Math.max(...existingVersions.map(v => v.versionNumber)) + 1
        : 1;

      // Build version metadata
      const version: ProjectVersion = {
        id: crypto.randomUUID(),
        versionNumber: nextNumber,
        createdAt: new Date().toISOString(),
        createdBy: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`.trim() || user.email,
          email: user.email,
        },
        filePath: result.path || fullPath,
        fileSize: result.size || uint8Array.byteLength,
        stepCount: project.metadata?.documentationSteps?.length || 0,
        screenshotCount: project.metadata?.screenshots?.length || 0,
        recordingCount: project.recordings?.length || 0,
        trigger: 'manual-export',
      };

      // Append to versions list and save
      const updatedVersions = [...existingVersions, version];
      latestState.updateProject(projectId, { versions: updatedVersions });

      // Auto-cleanup old versions beyond the limit
      await this.cleanupOldVersions(projectId, MAX_VERSIONS);

      return version;
    } catch (error) {
      console.error('Failed to save version:', error);
      throw error;
    }
  }

  /**
   * Delete a single version — removes file from disk and metadata from store.
   */
  async deleteVersion(projectId: string, versionId: string): Promise<boolean> {
    try {
      const { projects, updateProject } = useAppStore.getState();
      const project = projects.find(p => p.id === projectId);
      if (!project) return false;

      const versions = project.versions || [];
      const version = versions.find(v => v.id === versionId);
      if (!version) return false;

      // Delete file from disk (graceful — metadata removal is what matters)
      if (version.filePath) {
        try {
          if (window.electronAPI?.versions?.deleteVersionFile) {
            await window.electronAPI.versions.deleteVersionFile(version.filePath);
          }
        } catch (fileError) {
          console.warn('Could not delete version file from disk (will be orphaned):', fileError);
        }
      }

      // Always remove from store regardless of file deletion result
      const updatedVersions = versions.filter(v => v.id !== versionId);
      updateProject(projectId, { versions: updatedVersions });

      return true;
    } catch (error) {
      console.error('Failed to delete version:', error);
      return false;
    }
  }

  /**
   * Restore a project from a version snapshot.
   * 1. Reads the version's .docfai into memory
   * 2. Reads ALL version .docfai files into memory (so they survive the delete)
   * 3. Imports the selected version via overwriteExisting (deletes project folder)
   * 4. Re-writes all version files back to the new project's versions/ folder
   * 5. Re-attaches version metadata in the store
   */
  async restoreVersion(
    projectId: string,
    versionId: string,
    onProgress?: (message: string) => void
  ): Promise<boolean> {
    try {
      const { projects } = useAppStore.getState();
      const project = projects.find(p => p.id === projectId);
      if (!project) return false;

      const versions = project.versions || [];
      const version = versions.find(v => v.id === versionId);
      if (!version) return false;

      onProgress?.('Reading version file...');

      // Read the selected version ZIP into memory
      const readResult = await window.electronAPI.backup.readImportFile(version.filePath);
      if (!readResult.success || !readResult.data) {
        console.error('Failed to read version file:', readResult.error);
        return false;
      }

      // Read ALL version files into memory before the import destroys them
      onProgress?.('Preserving version history...');
      const versionFileBackups: Array<{ filename: string; data: Uint8Array }> = [];
      for (const v of versions) {
        if (v.filePath) {
          try {
            const vReadResult = await window.electronAPI.backup.readImportFile(v.filePath);
            if (vReadResult.success && vReadResult.data) {
              const filename = v.filePath.split(/[\\/]/).pop() || `v_${v.versionNumber}.docfai`;
              const data = vReadResult.data instanceof Uint8Array
                ? vReadResult.data
                : new Uint8Array(vReadResult.data as ArrayBuffer);
              versionFileBackups.push({ filename, data });
            }
          } catch {
            console.warn(`Could not back up version file: ${v.filePath}`);
          }
        }
      }

      onProgress?.('Restoring project from version...');

      // Import over the existing project (this deletes the project folder + recreates)
      const exportService = new ProjectExportService();
      const fileData = readResult.data instanceof Uint8Array
        ? readResult.data
        : new Uint8Array(readResult.data as ArrayBuffer);

      await exportService.importProject(
        fileData,
        { overwriteExisting: true },
        (progress) => {
          onProgress?.(progress.message);
        }
      );

      // Re-write all version files back to the restored project's versions/ folder
      onProgress?.('Restoring version files...');
      const projectsDir = await window.electronAPI.getProjectsDirectory();
      const versionsDir = `${projectsDir}/${project.name}/versions`;

      const updatedVersions: typeof versions = [];
      for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        const backup = versionFileBackups[i];
        if (backup) {
          const newPath = `${versionsDir}/${backup.filename}`;
          try {
            const writeResult = await window.electronAPI.backup.writeBackupFile(newPath, backup.data);
            if (writeResult.success) {
              updatedVersions.push({ ...v, filePath: writeResult.path || newPath });
            } else {
              // Keep metadata but with potentially stale path
              updatedVersions.push(v);
            }
          } catch {
            updatedVersions.push(v);
          }
        } else {
          updatedVersions.push(v);
        }
      }

      // Re-attach version history to the restored project
      const { projects: updatedProjects, updateProject } = useAppStore.getState();
      const restoredProject = updatedProjects.find(
        p => p.name.toLowerCase() === project.name.toLowerCase()
      );
      if (restoredProject) {
        updateProject(restoredProject.id, { versions: updatedVersions });
      }

      return true;
    } catch (error) {
      console.error('Failed to restore version:', error);
      return false;
    }
  }

  /**
   * Get versions for a project, sorted newest first.
   */
  getVersions(projectId: string): ProjectVersion[] {
    const { projects } = useAppStore.getState();
    const project = projects.find(p => p.id === projectId);
    if (!project) return [];
    return [...(project.versions || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Remove oldest versions beyond maxVersions limit.
   */
  async cleanupOldVersions(projectId: string, maxVersions: number = MAX_VERSIONS): Promise<void> {
    try {
      const { projects, updateProject } = useAppStore.getState();
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const versions = project.versions || [];
      if (versions.length <= maxVersions) return;

      const sorted = [...versions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const toKeep = sorted.slice(0, maxVersions);
      const toDelete = sorted.slice(maxVersions);

      for (const version of toDelete) {
        if (version.filePath) {
          try {
            if (window.electronAPI?.versions?.deleteVersionFile) {
              await window.electronAPI.versions.deleteVersionFile(version.filePath);
            }
          } catch {
            // File cleanup is best-effort
          }
        }
      }

      updateProject(projectId, { versions: toKeep });
    } catch (error) {
      console.error('Failed to cleanup old versions:', error);
    }
  }

  /**
   * Format file size for display.
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

export const versionService = new VersionService();
export default VersionService;
