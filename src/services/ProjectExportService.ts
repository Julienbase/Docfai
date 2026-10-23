import JSZip from 'jszip';
import { saveAs } from 'file-saver';
// Using native Date methods instead of date-fns
import { useAppStore } from '../store/useAppStore';
import type { Project, Recording, DocumentationStep } from '../store/useAppStore';
import type { EncryptedNotesData } from './NotesEncryptionService';
import { validateAndSanitizeProjectExportData } from './ProjectImportValidation';

export interface ExportDestination {
  type: 'local' | 'sharepoint' | 'cloud';
  path?: string;
  config?: any;
}

export interface ExportOptions {
  includeRecordings: boolean;
  includeScreenshots: boolean;
  includeExports: boolean;
  includeUploads: boolean;
  includeDocumentation?: boolean;
  destination: ExportDestination;
  compressionLevel?: number;
  destinations?: ExportDestination[];
}

export interface ExportProgress {
  stage: 'preparing' | 'packaging' | 'compressing' | 'uploading' | 'completed' | 'error';
  progress: number;
  message: string;
  error?: string;
}

export interface ProjectExportData {
  metadata: {
    exportedAt: string;
    exportedBy: string;
    version: string;
    projectId: string;
    projectName: string;
  };
  project: {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    settings: any;
  };
  recordings: Array<{
    id: string;
    name: string;
    duration: number;
    resolution: string;
    fps: number;
    createdAt: string;
    filePath: string;
    fileData: string; // base64 encoded
  }>;
  screenshots: Array<{
    id: string;
    name: string;
    createdAt: string;
    filePath: string;
    fileData: string; // base64 encoded
  }>;
  documentationSteps: Array<{
    id: string;
    timestamp: number;
    title: string;
    description: string;
    screenshot?: string;
    actionType: 'click' | 'type' | 'scroll' | 'key' | 'navigate' | 'diagram' | 'video';
    element?: string;
    isGenerated: boolean;
    type?: string;
    // Diagram-specific fields
    diagramJsonPath?: string;
    diagramImagePath?: string;
    diagramElements?: any[];
    diagramAppState?: any;
    // Video-specific fields
    mediaType?: 'image' | 'video';
    videoClipPath?: string;
    videoClipMimeType?: string;
  }>;
  exports: Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
    filePath: string;
    fileData: string; // base64 encoded
  }>;
  uploads: Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
    filePath: string;
    fileData: string; // base64 encoded
  }>;
  // Encrypted notes (kept encrypted for security)
  encryptedNotes?: EncryptedNotesData;
}

export class ProjectExportService {

  async exportProject(
    projectId: string,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<{ paths: string[]; totalSize: number }> {
    try {
      onProgress?.({
        stage: 'preparing',
        progress: 0,
        message: 'Preparing project data...'
      });

      // Get project data
      const projectData = await this.collectProjectData(projectId, options);
      
      onProgress?.({
        stage: 'packaging',
        progress: 30,
        message: 'Packaging project files...'
      });

      // Create ZIP package
      const zipBlob = await this.createZipPackage(projectData, options);
      
      onProgress?.({
        stage: 'compressing',
        progress: 70,
        message: 'Compressing files...'
      });

      // Generate filename
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const filename = `${projectData.project.name}_${timestamp}.docfai`;

      onProgress?.({
        stage: 'uploading',
        progress: 90,
        message: 'Saving export...'
      });

      // Handle multiple destinations
      const exportPaths: string[] = [];
      let totalSize = 0;

      if (options.destinations && options.destinations.length > 0) {
        for (const destination of options.destinations) {
          const { path, size } = await this.saveToDestination(zipBlob, filename, destination);
          exportPaths.push(path);
          totalSize += size;
        }
      } else {
        // Fallback to single destination for backward compatibility
        const { path, size } = await this.saveToDestination(zipBlob, filename, options.destination);
        exportPaths.push(path);
        totalSize += size;
      }

      onProgress?.({
        stage: 'completed',
        progress: 100,
        message: 'Export completed successfully'
      });

      return { paths: exportPaths, totalSize };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: 'Export failed',
        error: errorMessage
      });
      throw error;
    } finally {
      // Always reset importing flag
      const { setImportingProject } = useAppStore.getState();
      setImportingProject(false);
    }
  }



  async collectProjectData(projectId: string, options: ExportOptions): Promise<ProjectExportData> {
    // Get project from store
    const { projects, user } = useAppStore.getState();
    const project = projects.find(p => p.id === projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const exportData: ProjectExportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: user?.email || 'current-user',
        version: '1.0.0',
        projectId: project.id,
        projectName: project.name
      },
      project: {
        id: project.id,
        name: project.name,
        description: project.description || '',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        settings: {}
      },
      recordings: [],
      screenshots: [],
      documentationSteps: [],
      exports: [],
      uploads: []
    };

    // Collect recordings
    if (options.includeRecordings) {
      for (const recording of project.recordings) {
        try {
          let actualFilePath = recording.filePath;
          
          // If the stored filePath is relative or doesn't exist, construct the correct full path
          if (!actualFilePath || !actualFilePath.match(/^[A-Za-z]:/) || !actualFilePath.includes(project.name)) {
            // Get the projects directory and construct the full path
            const projectsDir = await window.electronAPI.getProjectsDirectory();
            const filename = actualFilePath ? actualFilePath.split(/[\\/]/).pop() : `${recording.id}_${recording.name}.webm`;
            actualFilePath = `${projectsDir}\\${project.name}\\recordings\\${filename}`;
          }
          
          const fileData = await this.readFileAsBase64(actualFilePath);
          exportData.recordings.push({
          id: recording.id,
          name: recording.name,
          duration: recording.duration,
          resolution: recording.resolution,
          fps: recording.fps,
          createdAt: recording.createdAt,
          filePath: actualFilePath,
          fileData
        });
        } catch (error) {
          console.warn('Failed to read recording file');
        }
      }
    }

    // Collect screenshots from project metadata
    if (options.includeScreenshots && project.metadata?.screenshots) {
      for (const screenshot of project.metadata.screenshots) {
        try {
          let fileData = '';
          let actualFilePath = screenshot.filePath;
          
          // If the original path doesn't exist, try to find the file with the new naming convention
          if (screenshot.filePath) {
            try {
              fileData = await this.readFileAsBase64(screenshot.filePath);
            } catch (error) {
              // If original path fails, try to construct the new filename format
              const projectPath = screenshot.filePath.substring(0, screenshot.filePath.lastIndexOf('\\') + 1);
              const newFileName = `screenshot_${screenshot.id}`;
              const newFilePath = `${projectPath}${newFileName}`;
              
              try {
                fileData = await this.readFileAsBase64(newFilePath);
                actualFilePath = newFilePath;
                // Screenshot found with alternate filename
              } catch (newError) {
                console.warn('Failed to read screenshot file at both paths');
                throw newError;
              }
            }
          } else if (screenshot.imageData) {
            fileData = screenshot.imageData; // Legacy base64 data
          }
          
          exportData.screenshots.push({
            id: screenshot.id,
            name: `screenshot_${screenshot.id}`,
            createdAt: new Date(screenshot.timestamp).toISOString(),
            filePath: actualFilePath || '',
            fileData
          });
        } catch (error) {
          console.warn('Failed to read screenshot file for export');
        }
      }
    }

    // Collect documentation steps from project metadata
    if (project.metadata?.documentationSteps) {
      exportData.documentationSteps = project.metadata.documentationSteps.map(step => ({
        id: step.id,
        timestamp: step.timestamp,
        title: step.title,
        description: step.description,
        screenshot: step.screenshot,
        actionType: step.actionType,
        element: step.element,
        isGenerated: step.isGenerated,
        type: step.type,
        // Include diagram-specific fields
        diagramJsonPath: step.diagramJsonPath,
        diagramImagePath: step.diagramImagePath,
        diagramElements: step.diagramElements,
        diagramAppState: step.diagramAppState,
        // Include video-specific fields
        mediaType: step.mediaType,
        videoClipPath: step.videoClipPath,
        videoClipMimeType: step.videoClipMimeType
      }));
    }

    // For now, exports and uploads are empty arrays
    // TODO: Implement proper exports and uploads collection from store
    exportData.exports = [];
    exportData.uploads = [];

    // Include encrypted notes if available (kept encrypted for security)
    if (project.encryptedNotes) {
      exportData.encryptedNotes = project.encryptedNotes;
    }

    return exportData;
  }

  async createZipPackage(projectData: ProjectExportData, options: ExportOptions): Promise<Blob> {
    const zip = new JSZip();

    // Add project metadata
    zip.file('project.json', JSON.stringify(projectData, null, 2));

    // Add recordings
    if (options.includeRecordings && projectData.recordings.length > 0) {
      const recordingsFolder = zip.folder('recordings');
      for (const recording of projectData.recordings) {
        const fileName = `${recording.id}_${recording.name}`;
        recordingsFolder?.file(fileName, recording.fileData, { base64: true });
      }
    }

    // Add screenshots
    if (options.includeScreenshots && projectData.screenshots.length > 0) {
      const screenshotsFolder = zip.folder('screenshots');
      for (const screenshot of projectData.screenshots) {
        const fileName = `${screenshot.id}_${screenshot.name}`;
        screenshotsFolder?.file(fileName, screenshot.fileData, { base64: true });
      }
    }

    // Add diagram files (images and JSON)
    if (options.includeScreenshots && projectData.documentationSteps.length > 0) {
      const diagramsFolder = zip.folder('diagrams');
      const projectsDir = await window.electronAPI.getProjectsDirectory();
      const projectDiagramsPath = `${projectsDir}\\${projectData.project.name}\\diagrams`;

      for (const step of projectData.documentationSteps) {
        if (step.actionType === 'diagram') {
          // Add diagram image if it exists
          if (step.diagramImagePath) {
            try {
              // Remove query parameters from path (e.g., ?t=timestamp for cache busting)
              let cleanImagePath = step.diagramImagePath.split('?')[0];

              // Construct full path if the stored path is relative
              let fullImagePath = cleanImagePath;
              if (!fullImagePath.match(/^[A-Za-z]:/)) {
                // It's a relative path, construct the full path
                const fileName = fullImagePath.split(/[\\/]/).pop();
                fullImagePath = `${projectDiagramsPath}\\${fileName}`;
              }

              const imageData = await this.readFileAsBase64(fullImagePath);
              if (imageData) {
                const imageFileName = fullImagePath.split(/[\\/]/).pop() || `diagram_${step.id}.png`;
                diagramsFolder?.file(imageFileName, imageData, { base64: true });
              }
            } catch (error) {
              console.warn('Failed to read diagram image');
            }
          }

          // Add diagram JSON if it exists
          if (step.diagramJsonPath) {
            try {
              // Remove query parameters from path (e.g., ?t=timestamp for cache busting)
              let cleanJsonPath = step.diagramJsonPath.split('?')[0];

              // Construct full path if the stored path is relative
              let fullJsonPath = cleanJsonPath;
              if (!fullJsonPath.match(/^[A-Za-z]:/)) {
                // It's a relative path, construct the full path
                const fileName = fullJsonPath.split(/[\\/]/).pop();
                fullJsonPath = `${projectDiagramsPath}\\${fileName}`;
              }

              const jsonData = await this.readFileAsBase64(fullJsonPath);
              if (jsonData) {
                const jsonFileName = fullJsonPath.split(/[\\/]/).pop() || `diagram_${step.id}.json`;
                diagramsFolder?.file(jsonFileName, jsonData, { base64: true });
              }
            } catch (error) {
              console.warn('Failed to read diagram JSON');
            }
          }
        }
      }
    }

    // Add video clips from documentation steps (stored in project uploads folder)
    if (options.includeUploads) {
      const videoSteps = projectData.documentationSteps.filter(
        step => step.mediaType === 'video' && step.videoClipPath
      );
      if (videoSteps.length > 0) {
        const videoclipsFolder = zip.folder('videoclips');
        const projectsDir = await window.electronAPI.getProjectsDirectory();
        for (const step of videoSteps) {
          try {
            let videoPath = step.videoClipPath!;
            // videoClipPath may be relative (e.g. "uploads/clip_xxx.mp4") or absolute.
            // Resolve relative paths against the project directory.
            const isAbsolute = /^[a-zA-Z]:/.test(videoPath) || videoPath.startsWith('/');
            if (!isAbsolute) {
              videoPath = `${projectsDir}\\${projectData.project.name}\\${videoPath.replace(/\//g, '\\')}`;
            }
            const videoData = await this.readFileAsBase64(videoPath);
            if (videoData) {
              const originalFilename = videoPath.split(/[\\/]/).pop() || `video_${step.id}`;
              videoclipsFolder?.file(`${step.id}_${originalFilename}`, videoData, { base64: true });
            }
          } catch (error) {
            console.warn('Failed to read video clip for export step');
          }
        }
      }
    }

    // Add exports
    if (options.includeExports && projectData.exports.length > 0) {
      const exportsFolder = zip.folder('exports');
      for (const exportFile of projectData.exports) {
        const fileName = `${exportFile.id}_${exportFile.name}`;
        exportsFolder?.file(fileName, exportFile.fileData, { base64: true });
      }
    }

    // Add uploads
    if (options.includeUploads && projectData.uploads.length > 0) {
      const uploadsFolder = zip.folder('uploads');
      for (const upload of projectData.uploads) {
        const fileName = `${upload.id}_${upload.name}`;
        uploadsFolder?.file(fileName, upload.fileData, { base64: true });
      }
    }

    return await zip.generateAsync({ type: 'blob' });
  }

  private async readFileAsBase64(filePath: string): Promise<string> {
    try {
      // getFileUrl returns data:{mime};base64,{data} — extract just the base64 portion
      const dataUrl = await window.electronAPI.getFileUrl(filePath);
      if (dataUrl) {
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx !== -1) {
          return dataUrl.substring(commaIdx + 1);
        }
      }
      console.error('Failed to read file as base64');
      return '';
    } catch (error) {
      console.error('Error reading file as base64');
      return '';
    }
  }

  private async saveToDestination(blob: Blob, filename: string, destination: ExportDestination): Promise<{ path: string; size: number }> {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    if (destination.type === 'local') {
      if (!destination.path) {
        throw new Error('Local export requires a destination path');
      }

      const fullPath = `${destination.path}/${filename}`;

      const result = await window.electronAPI.backup.writeBackupFile(fullPath, uint8Array);
      if (result.success && result.path) {
        return { path: result.path, size: result.size ?? uint8Array.byteLength };
      } else {
        console.error('Failed to write backup file');
        throw new Error(result.error || 'Failed to save file');
      }
    } else {
      // For other destination types, we'll need to implement specific handlers
      throw new Error(`Destination type '${destination.type}' not yet implemented`);
    }
  }



  async importProject(
    fileData: Uint8Array | string,
    options: { overwriteExisting: boolean; importAsNew?: boolean },
    onProgress?: (progress: ExportProgress) => void
  ): Promise<{ id: string; name: string; description: string; createdAt: string; updatedAt: string }> {
    try {
      // Set importing flag to prevent native screenshot processing
      const { setImportingProject } = useAppStore.getState();
      setImportingProject(true);
      
      onProgress?.({
        stage: 'preparing',
        progress: 0,
        message: 'Reading import file...'
      });

      // Read the .docfai file
      let fileBuffer: ArrayBuffer;
      if (fileData instanceof Uint8Array) {
        fileBuffer = fileData.buffer as ArrayBuffer;
      } else {
        // TODO: Implement file reading when proper ElectronAPI method is available
        fileBuffer = new ArrayBuffer(0);
      }
      const zip = await JSZip.loadAsync(fileBuffer);

      onProgress?.({
        stage: 'packaging',
        progress: 20,
        message: 'Extracting project data...'
      });

      // Extract project.json
      const projectJsonFile = zip.file('project.json');
      if (!projectJsonFile) {
        throw new Error('Invalid project file: missing project.json');
      }

      const projectDataStr = await projectJsonFile.async('text');
      const projectData = validateAndSanitizeProjectExportData(JSON.parse(projectDataStr));

      onProgress?.({
        stage: 'compressing',
        progress: 40,
        message: 'Validating project data...'
      });

      // Validate project data
      this.validateProjectData(projectData);

      onProgress?.({
        stage: 'uploading',
        progress: 60,
        message: 'Importing project...'
      });

      // Get current project from store and handle conflicts
      onProgress?.({
        stage: 'uploading',
        progress: 50,
        message: 'Checking for existing project...'
      });

      const { projects } = useAppStore.getState();
      console.log('Current projects before import:', projects.map(p => ({ id: p.id, name: p.name })));
      console.log('Looking for existing project with name:', projectData.project.name);

      const existingProject = projects.find(p => p.name.toLowerCase() === projectData.project.name.toLowerCase());
      let finalProject: Project;

      // Determine the project name to use for import
      let importProjectName = projectData.project.name;

      if (existingProject && options.overwriteExisting) {
        // Replace: delete the existing project first, then create fresh
        console.log(`Replacing existing project "${existingProject.name}" (ID: ${existingProject.id})`);
        await useAppStore.getState().deleteProject(existingProject.id);
        console.log('Existing project deleted, creating fresh import');
      } else if (existingProject && options.importAsNew) {
        // Import as new: generate a unique name
        let counter = 2;
        let candidateName = `${projectData.project.name} (${counter})`;
        const currentProjects = useAppStore.getState().projects;
        while (currentProjects.some(p => p.name.toLowerCase() === candidateName.toLowerCase())) {
          counter++;
          candidateName = `${projectData.project.name} (${counter})`;
        }
        importProjectName = candidateName;
        console.log(`Importing as new project with name: "${importProjectName}"`);
      } else if (existingProject) {
        // No explicit action chosen but conflict exists — default to import as new
        let counter = 2;
        let candidateName = `${projectData.project.name} (${counter})`;
        const currentProjects = useAppStore.getState().projects;
        while (currentProjects.some(p => p.name.toLowerCase() === candidateName.toLowerCase())) {
          counter++;
          candidateName = `${projectData.project.name} (${counter})`;
        }
        importProjectName = candidateName;
        console.log(`Conflict detected, defaulting to new name: "${importProjectName}"`);
      }

      // Always create a new project (either fresh after delete, or with a new/original name)
      if (window.electronAPI) {
        console.log('Creating project directory structure...');
        const folderResult = await window.electronAPI.createProjectFolder(importProjectName);
        if (!folderResult.success) {
          throw new Error(`Failed to create project directory structure: ${folderResult.error || 'Unknown error'}`);
        }
        console.log('Project directory structure created successfully:', folderResult.path);
      } else {
        console.warn('ElectronAPI not available - directory creation skipped');
      }

      const basicProjectData = {
        name: importProjectName,
        description: projectData.project.description || '',
        status: 'draft' as const,
        projectType: (projectData.project as any).projectType || 'interactive-screenshots' as const,
        recordings: [],
        metadata: {
          totalDuration: 0,
          actionCount: 0,
          lastActivity: new Date().toISOString(),
          projectTitle: (projectData.project as any).metadata?.projectTitle,
          projectSource: (projectData.project as any).metadata?.projectSource,
          screenshots: [],
          documentationSteps: []
        }
      };

      console.log('Creating new project:', importProjectName);
      useAppStore.getState().addProject(basicProjectData);

      // Find the newly created project (last one with this name)
      const { projects: updatedProjects } = useAppStore.getState();
      const matchingProjects = updatedProjects.filter(p => p.name === importProjectName);
      finalProject = matchingProjects[matchingProjects.length - 1];

      if (!finalProject) {
        throw new Error(`Failed to find newly created project: ${importProjectName}`);
      }

      console.log('New project created with ID:', finalProject.id);

      // Extract and save screenshots from zip
      onProgress?.({
        stage: 'uploading',
        progress: 70,
        message: 'Extracting screenshots...'
      });

      const savedScreenshots = [];
       let screenshotErrors = [];
       
       for (const screenshot of projectData.screenshots) {
         // Declare screenshotName outside try block to avoid scope issues
         const screenshotName = screenshot.name || screenshot.id || 'unnamed';
         
         try {
           // Construct filename to match export format: ${id}_${name}
           const fileName = `${screenshot.id}_${screenshotName}`;
           
           // Find the screenshot file in the zip
            const screenshotFile = zip.file(`screenshots/${fileName}`);
            if (screenshotFile) {
              // Extract the file as base64
              const base64Data = await screenshotFile.async('base64');
              const mimeType = base64Data.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
              const dataUrl = `data:${mimeType};base64,${base64Data}`;
              
              // Save screenshot using electron API.
              // Derive on-disk filename from the original filePath's basename so that
              // documentationSteps[].screenshot references (which point at the original
              // capture filename, e.g. screenshot-<timestamp>.jpg) resolve at export time.
              const onDiskName = screenshot.filePath
                ? (screenshot.filePath.split(/[\\/]/).pop() || screenshotName)
                : screenshotName;
              const result = await window.electronAPI.saveProjectScreenshot(
                importProjectName,
                onDiskName,
                dataUrl
              );
              
              console.log(`saveProjectScreenshot result for ${screenshotName}:`, result);
              
              // Check if filePath exists (API returns {filePath, relativePath} on success)
              if (result.filePath) {
                const savedPath = result.filePath;
                savedScreenshots.push({
                  ...screenshot,
                  filePath: savedPath
                });
                console.log(`Screenshot saved: ${screenshotName} -> ${savedPath}`);
              } else {
                const errorMsg = `Failed to save screenshot ${screenshotName}: API call failed or returned no filePath`;
                console.error(errorMsg);
                console.error('Full result object:', result);
                screenshotErrors.push(errorMsg);
              }
            } else {
              const warningMsg = `Screenshot file not found in zip: screenshots/${fileName}`;
              console.warn(warningMsg);
              screenshotErrors.push(warningMsg);
            }
          } catch (error) {
            const errorMsg = `Error processing screenshot ${screenshotName}: ${error.message}`;
           console.error(errorMsg);
           screenshotErrors.push(errorMsg);
         }
       }
       
       // Log summary of screenshot processing
       console.log(`Screenshot processing complete: ${savedScreenshots.length}/${projectData.screenshots.length} screenshots saved successfully`);
       if (screenshotErrors.length > 0) {
         console.warn(`Screenshot processing warnings/errors:`, screenshotErrors);
       }
       
       onProgress?.({
         stage: 'uploading',
         progress: 80,
         message: `Processing project data... (${savedScreenshots.length}/${projectData.screenshots.length} screenshots restored)`
       });

      // Extract and save recording files from zip
      const savedRecordings = [];
      let recordingErrors = [];
      
      onProgress?.({
        stage: 'uploading',
        progress: 85,
        message: 'Extracting recording files...'
      });
      
      for (const recording of projectData.recordings) {
        const recordingName = recording.name || recording.id || 'unnamed';
        
        try {
          // Find the recording file in the zip (exported with format: id_name)
            const recordingFile = zip.file(`recordings/${recording.id}_${recording.name}`);
           if (recordingFile) {
             // Extract the file as ArrayBuffer
             const arrayBuffer = await recordingFile.async('arraybuffer');
             
             // Save recording using electron API
             const result = await window.electronAPI.saveProjectRecording(
               importProjectName,
               recordingName,
               arrayBuffer
             );
            
            console.log(`saveProjectRecording result for ${recordingName}:`, result);
            
            // Check if filePath exists
            if (result.filePath) {
              const savedPath = result.filePath;
              savedRecordings.push({
                ...recording,
                filePath: savedPath
              });
              console.log(`Recording saved: ${recordingName} -> ${savedPath}`);
            } else {
              const errorMsg = `Failed to save recording ${recordingName}: API call failed or returned no filePath`;
              console.error(errorMsg);
              console.error('Full result object:', result);
              recordingErrors.push(errorMsg);
            }
          } else {
            const warningMsg = `Recording file not found in zip: recordings/${recording.id}_${recording.name}`;
            console.warn(warningMsg);
            recordingErrors.push(warningMsg);
          }
        } catch (error) {
          const errorMsg = `Error processing recording ${recordingName}: ${error.message}`;
          console.error(errorMsg);
          recordingErrors.push(errorMsg);
        }
      }
      
      // Log summary of recording processing
      console.log(`Recording processing complete: ${savedRecordings.length}/${projectData.recordings.length} recordings saved successfully`);
      if (recordingErrors.length > 0) {
        console.warn(`Recording processing warnings/errors:`, recordingErrors);
      }

      // Extract and save upload files from zip
      const savedUploads = [];
      let uploadErrors = [];
      
      onProgress?.({
        stage: 'uploading',
        progress: 87,
        message: 'Extracting upload files...'
      });
      
      if (projectData.uploads && projectData.uploads.length > 0) {
        for (const upload of projectData.uploads) {
          const uploadName = upload.name || upload.id || 'unnamed';
          
          try {
            // Find the upload file in the zip (exported with format: id_name)
            const uploadFile = zip.file(`uploads/${upload.id}_${upload.name}`);
            if (uploadFile) {
              // Extract the file as ArrayBuffer
              const arrayBuffer = await uploadFile.async('arraybuffer');
              
              // Save upload using electron API
              const result = await window.electronAPI.saveProjectUpload(
                importProjectName,
                uploadName,
                arrayBuffer
              );
             
             console.log(`saveProjectUpload result for ${uploadName}:`, result);
             
             // Check if filePath exists
             if (result.success && result.filePath) {
               const savedPath = result.filePath;
               savedUploads.push({
                 ...upload,
                 filePath: savedPath
               });
               console.log(`Upload saved: ${uploadName} -> ${savedPath}`);
             } else {
               const errorMsg = `Failed to save upload ${uploadName}: ${result.error || 'API call failed'}`;
               console.error(errorMsg);
               console.error('Full result object:', result);
               uploadErrors.push(errorMsg);
             }
           } else {
             const warningMsg = `Upload file not found in zip: uploads/${upload.id}_${upload.name}`;
             console.warn(warningMsg);
             uploadErrors.push(warningMsg);
           }
         } catch (error) {
           const errorMsg = `Error processing upload ${uploadName}: ${error.message}`;
           console.error(errorMsg);
           uploadErrors.push(errorMsg);
         }
       }
       
       // Log summary of upload processing
       console.log(`Upload processing complete: ${savedUploads.length}/${projectData.uploads.length} uploads saved successfully`);
       if (uploadErrors.length > 0) {
         console.warn(`Upload processing warnings/errors:`, uploadErrors);
       }
      }

      // Extract and restore video clip files from zip
      const restoredVideoClipPaths: Map<string, string> = new Map(); // stepId -> absolute path
      const videoStepsToRestore = projectData.documentationSteps.filter(
        step => step.mediaType === 'video' && step.videoClipPath
      );
      if (videoStepsToRestore.length > 0) {
        for (const step of videoStepsToRestore) {
          try {
            const originalPath = step.videoClipPath!;
            const originalFilename = originalPath.split(/[\\/]/).pop() || `video_${step.id}`;
            const videoFile = zip.file(`videoclips/${step.id}_${originalFilename}`);
            if (videoFile) {
              const arrayBuffer = await videoFile.async('arraybuffer');
              const result = await window.electronAPI.saveProjectUpload(
                importProjectName,
                originalFilename,
                arrayBuffer
              );
              if (result.success && result.filePath) {
                restoredVideoClipPaths.set(step.id, result.filePath);
                console.log(`Video clip restored: ${step.id} -> ${result.filePath}`);
              } else {
                console.warn(`Failed to restore video clip for step ${step.id}`);
              }
            } else {
              console.warn(`Video clip not found in zip for step ${step.id}`);
            }
          } catch (error) {
            console.warn(`Error restoring video clip for step ${step.id}:`, error);
          }
        }
      }
      console.log(`Video clip restoration complete: ${restoredVideoClipPaths.size}/${videoStepsToRestore.length} clips restored`);

      // Extract and save export files from zip
      const savedExports = [];
      let exportErrors = [];
      
      onProgress?.({
        stage: 'uploading',
        progress: 90,
        message: 'Extracting export files...'
      });
      
      if (projectData.exports && projectData.exports.length > 0) {
        for (const exportItem of projectData.exports) {
          const exportName = exportItem.name || exportItem.id || 'unnamed';
          
          try {
             // Find the export file in the zip (exported with format: id_name)
             const exportFile = zip.file(`exports/${exportItem.id}_${exportItem.name}`);
             if (exportFile) {
               // Extract the file as ArrayBuffer
               const arrayBuffer = await exportFile.async('arraybuffer');
               
               try {
                 // Save export using electron API
                 // Determine file type from export item or default to 'export'
                  const fileType = exportItem.type || 'export';

                 await window.electronAPI.saveProjectExport(
                   importProjectName,
                   exportName,
                   arrayBuffer,
                   fileType
                 );
                
                console.log(`Export saved successfully: ${exportName}`);
                
                // Since saveProjectExport returns void, we assume success and construct the path
                // The actual file path will be determined by the electron API based on project structure
                savedExports.push({
                  ...exportItem,
                  name: exportName,
                  type: fileType
                });
                console.log(`Export processed: ${exportName} (${fileType})`);
                
                // Note: We don't have access to the actual file path since the API returns void
                // The files are saved to the project's exports directory by the electron API
               } catch (saveError) {
                 const errorMsg = `Failed to save export ${exportName}: ${saveError.message}`;
                 console.error(errorMsg);
                 exportErrors.push(errorMsg);
               }
            } else {
              const warningMsg = `Export file not found in zip: exports/${exportItem.id}_${exportItem.name}`;
              console.warn(warningMsg);
              exportErrors.push(warningMsg);
            }
          } catch (error) {
            const errorMsg = `Error processing export ${exportName}: ${error.message}`;
            console.error(errorMsg);
            exportErrors.push(errorMsg);
          }
       }
       
       // Log summary of export processing
       console.log(`Export processing complete: ${savedExports.length}/${projectData.exports.length} exports saved successfully`);
       if (exportErrors.length > 0) {
         console.warn(`Export processing warnings/errors:`, exportErrors);
       }
      }

      // Extract and restore diagram files from zip
      onProgress?.({
        stage: 'uploading',
        progress: 92,
        message: 'Restoring diagram files...'
      });

      const diagramSteps = projectData.documentationSteps.filter(step => step.actionType === 'diagram');
      let diagramErrors = [];

      for (const diagramStep of diagramSteps) {
        try {
          let diagramJsonData = '';
          let diagramImageData = '';

          // Extract diagram JSON from zip
          if (diagramStep.diagramJsonPath) {
            // Remove query parameters from path (e.g., ?t=timestamp for cache busting)
            let cleanJsonPath = diagramStep.diagramJsonPath.split('?')[0];
            const originalJsonFileName = cleanJsonPath.split(/[\\/]/).pop();
            if (originalJsonFileName) {
              const diagramJsonFile = zip.file(`diagrams/${originalJsonFileName}`);
              if (diagramJsonFile) {
                const base64Data = await diagramJsonFile.async('base64');
                // Decode base64 to get the JSON string
                const decoder = new TextDecoder('utf-8');
                const jsonBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                diagramJsonData = decoder.decode(jsonBuffer);
              }
            }
          }

          // Fallback: If JSON file not in ZIP but we have diagramElements/appState, reconstruct it
          if (!diagramJsonData && diagramStep.diagramElements && diagramStep.diagramAppState) {
            console.log(`Reconstructing diagram JSON from embedded data for step ${diagramStep.id}`);
            diagramJsonData = JSON.stringify({
              elements: diagramStep.diagramElements,
              appState: diagramStep.diagramAppState
            });
          }

          // Extract diagram image from zip
          if (diagramStep.diagramImagePath) {
            // Remove query parameters from path (e.g., ?t=timestamp for cache busting)
            let cleanImagePath = diagramStep.diagramImagePath.split('?')[0];
            const originalImageFileName = cleanImagePath.split(/[\\/]/).pop();
            if (originalImageFileName) {
              const diagramImageFile = zip.file(`diagrams/${originalImageFileName}`);
              if (diagramImageFile) {
                const base64Data = await diagramImageFile.async('base64');
                diagramImageData = `data:image/png;base64,${base64Data}`;
              }
            }
          }

          // Save diagram using electron API (saves both JSON and image)
          // Note: We need both JSON and image. If image is missing, we can't save the diagram properly
          if (diagramJsonData && diagramImageData) {
            const result = await window.electronAPI.saveDiagram({
              stepId: diagramStep.id,
              title: diagramStep.title,
              projectName: importProjectName,
              diagramJson: diagramJsonData,
              diagramImage: diagramImageData
            });

            if (result.success && result.jsonPath && result.imagePath) {
              // Update the diagram step with new file paths
              diagramStep.diagramJsonPath = result.jsonPath;
              diagramStep.diagramImagePath = result.imagePath;
              console.log(`Diagram restored: ${diagramStep.title}`);
              console.log(`  JSON: ${result.jsonPath}`);
              console.log(`  Image: ${result.imagePath}`);
            } else {
              console.warn(`Failed to save diagram for step ${diagramStep.id}: ${result.error || 'Unknown error'}`);
            }
          } else {
            const missing = [];
            if (!diagramJsonData) missing.push('JSON data');
            if (!diagramImageData) missing.push('image data');
            console.warn(`Diagram step ${diagramStep.id} missing: ${missing.join(', ')}`);
            console.warn(`  Has diagramElements: ${!!diagramStep.diagramElements}`);
            console.warn(`  Has diagramAppState: ${!!diagramStep.diagramAppState}`);
            console.warn(`  Has diagramJsonPath: ${!!diagramStep.diagramJsonPath}`);
            console.warn(`  Has diagramImagePath: ${!!diagramStep.diagramImagePath}`);
          }
        } catch (error) {
          const errorMsg = `Error restoring diagram for step ${diagramStep.id}: ${error.message}`;
          console.error(errorMsg);
          diagramErrors.push(errorMsg);
        }
      }

      console.log(`Diagram restoration complete: ${diagramSteps.length} diagram steps processed`);
      if (diagramErrors.length > 0) {
        console.warn(`Diagram restoration warnings/errors:`, diagramErrors);
      }

      onProgress?.({
        stage: 'uploading',
        progress: 95,
        message: 'Finalizing project data...'
      });

      // Convert imported recordings to match Recording interface (use saved recordings with updated file paths)
        const convertedRecordings = savedRecordings.map(recording => ({
          id: recording.id,
          projectId: finalProject.id,
          name: recording.name,
          filePath: recording.filePath,
          duration: recording.duration,
          resolution: recording.resolution,
          fps: recording.fps,
          createdAt: recording.createdAt,
          actions: [],
          audioEnabled: true,
          keyboardTracking: true,
          mouseTracking: true,
          source: 'recording' as const
        }));

        // Prepare final screenshots and documentation steps
        // Match screenshots with documentation steps to preserve original descriptions
        const finalScreenshots = savedScreenshots.map(screenshot => {
          // Find the corresponding documentation step for this screenshot
          const matchingStep = projectData.documentationSteps.find(step =>
            step.screenshot === screenshot.id || step.id === screenshot.id
          );

          return {
            id: screenshot.id,
            timestamp: new Date(screenshot.createdAt).getTime(),
            filePath: screenshot.filePath,
            clickX: 0,
            clickY: 0,
            description: matchingStep?.description || screenshot.name
          };
        });
        
        const finalDocumentationSteps = projectData.documentationSteps.map(step => ({
          id: step.id,
          timestamp: step.timestamp,
          title: step.title,
          description: step.description,
          screenshot: step.screenshot,
          actionType: step.actionType,
          element: step.element,
          isGenerated: step.isGenerated,
          type: step.type,
          // Preserve diagram-specific fields
          diagramJsonPath: step.diagramJsonPath,
          diagramImagePath: step.diagramImagePath,
          diagramElements: step.diagramElements,
          diagramAppState: step.diagramAppState,
          // Preserve video-specific fields, using the restored absolute path
          mediaType: step.mediaType,
          videoClipMimeType: step.videoClipMimeType,
          videoClipPath: step.mediaType === 'video'
            ? (restoredVideoClipPaths.get(step.id) || step.videoClipPath)
            : step.videoClipPath
        }));
        
        // Update the newly created project with complete imported data
        const recordingsWithCorrectId = convertedRecordings.map(recording => ({
          ...recording,
          projectId: finalProject.id
        }));

        // Calculate notes count from encrypted notes if available
        let notesCount = 0;
        if (projectData.encryptedNotes) {
          try {
            const { notesEncryptionService } = await import('./NotesEncryptionService');
            const decryptedNotes = await notesEncryptionService.decryptNotes(projectData.encryptedNotes);
            notesCount = decryptedNotes.length;
          } catch (error) {
            console.warn('Failed to decrypt notes for count:', error);
          }
        }

        const updatedProject: Project = {
          ...finalProject,
          recordings: recordingsWithCorrectId,
          metadata: {
            ...finalProject.metadata,
            screenshots: finalScreenshots,
            actionCount: finalScreenshots.length,
            documentationSteps: finalDocumentationSteps,
            notesCount: notesCount
          },
          encryptedNotes: projectData.encryptedNotes
        };

        console.log('Updating project with complete imported data:', finalProject.id);
        useAppStore.getState().updateProject(finalProject.id, updatedProject);

        finalProject = updatedProject;

        // Set as current project
        useAppStore.getState().setCurrentProject(finalProject);
        console.log('Import complete:', {
          projectName: finalProject.name,
          screenshotCount: finalScreenshots.length,
          recordingCount: recordingsWithCorrectId.length,
          documentationStepsCount: finalDocumentationSteps.length
        });
      
      // Final verification - check if we have duplicates
      const finalProjects = useAppStore.getState().projects;
      const projectNames = finalProjects.map(p => p.name);
      const duplicateNames = projectNames.filter((name, index) => projectNames.indexOf(name) !== index);
      if (duplicateNames.length > 0) {
        console.error('DUPLICATE PROJECTS DETECTED:', duplicateNames);
        console.error('All projects:', finalProjects.map(p => ({ id: p.id, name: p.name })));
      }

      onProgress?.({
        stage: 'completed',
        progress: 100,
        message: 'Import completed successfully'
      });

      return {
        id: finalProject.id,
        name: finalProject.name,
        description: finalProject.description,
        createdAt: finalProject.createdAt,
        updatedAt: finalProject.updatedAt
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: 'Import failed',
        error: errorMessage
      });
      throw error;
    } finally {
      // Always reset importing flag
      const { setImportingProject } = useAppStore.getState();
      setImportingProject(false);
    }
  }

  private validateProjectData(projectData: ProjectExportData): void {
    if (!projectData.metadata || !projectData.project) {
      throw new Error('Invalid project data: missing required fields');
    }
    
    if (!projectData.metadata.version) {
      throw new Error('Invalid project data: missing version information');
    }
  }




}

export default ProjectExportService;
