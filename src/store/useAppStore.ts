import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createElectronStorage } from '../utils/electronStorage';
import { type EncryptedNotesData } from '../services/NotesEncryptionService';
import { type BookmarkEvent } from '../types/electron';

// The open-source build has no accounts or subscriptions: there is a single
// local user and every feature is unlocked.
export interface SubscriptionFeatures {
  unlimited_processing: boolean;
  advanced_ai: boolean;
  priority_support: boolean;
  export_formats: boolean;
  team_collaboration: boolean;
  api_access: boolean;
  premium_status: boolean;
}

const ALL_FEATURES: SubscriptionFeatures = {
  unlimited_processing: true,
  advanced_ai: true,
  priority_support: true,
  export_formats: true,
  team_collaboration: true,
  api_access: true,
  premium_status: true,
};

const LOCAL_USER: User = {
  id: 'local-user',
  email: '',
  firstName: 'User',
  lastName: '',
  createdAt: new Date(0).toISOString(),
  isPremium: true,
};

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name?: string;
  createdAt: string;
  isPremium?: boolean;
  usageStats?: {
    recordingTime: number;
    exportsGenerated: number;
    storageUsed: number;
    apiCalls: number;
  };
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  recordings: Recording[];
  status: 'draft' | 'recording' | 'editing' | 'completed';
  projectType?: 'video-recording' | 'interactive-screenshots';
  isFavorite?: boolean;
  metadata: {
    totalDuration: number;
    actionCount: number;
    lastActivity: string;
    projectTitle?: string;
    projectSource?: string;
    notesCount?: number; // Count of encrypted notes
    screenshots?: Array<{
      id: string;
      timestamp: number;
      imageData?: string; // Legacy base64 image data
      filePath?: string; // New file-based screenshot path
      clickX: number;
      clickY: number;
      description: string;
      mediaType?: 'image' | 'video'; // Media type discriminator
      videoClipPath?: string; // Relative path for video clips
      videoClipMimeType?: string; // MIME type for video clips
    }>;
    documentationSteps?: DocumentationStep[];
    lastExportedAt?: string;
  };
  // Encrypted notes for project collaboration
  encryptedNotes?: EncryptedNotesData;
  // Local versioning for project snapshots
  versions?: ProjectVersion[];
}

export interface ProjectVersion {
  id: string;
  versionNumber: number;
  label?: string;
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
  filePath: string;
  fileSize: number;
  stepCount: number;
  screenshotCount: number;
  recordingCount: number;
  trigger: 'manual-export' | 'auto-backup';
}

export interface Recording {
  id: string;
  projectId: string;
  name: string;
  filePath: string;
  duration: number;
  resolution: string;
  fps: number;
  createdAt: string;
  actions: RecordedAction[];
  audioEnabled: boolean;
  keyboardTracking: boolean;
  mouseTracking: boolean;
  source: 'recording' | 'upload';
  documentationSteps?: DocumentationStep[];
  bookmarks?: BookmarkEvent[]; // Timeline bookmarks created during recording (F10)
  projectPath?: string; // Path to the project directory
  metadata?: {
    projectTitle?: string;
    projectSource?: string;
  };
}

export interface DocumentationStep {
  id: string;
  timestamp: number;
  title: string;
  description: string;
  screenshot?: string;
  actionType: 'click' | 'type' | 'scroll' | 'key' | 'navigate' | 'diagram' | 'video';
  element?: string;
  isGenerated: boolean;
  type?: string; // For diagram type identification
  // Diagram-specific fields
  diagramJsonPath?: string;
  diagramImagePath?: string;
  diagramElements?: any[]; // Excalidraw elements
  diagramAppState?: any; // Excalidraw app state
  // Video clip fields (for mixed media steps)
  videoClipPath?: string; // Relative path in project uploads/ folder
  videoClipMimeType?: string; // 'video/mp4' | 'video/webm'
  mediaType?: 'image' | 'video'; // Media discriminator (defaults to 'image' when undefined)
}

export interface RecordedAction {
  id: string;
  timestamp: number;
  type: 'click' | 'keypress' | 'scroll' | 'navigation' | 'voice';
  data: {
    x?: number;
    y?: number;
    key?: string;
    element?: string;
    description?: string;
    screenshot?: string;
  };

}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'es' | 'fr' | 'de' | 'ro' | 'it';
  recordingSettings: {
    defaultQuality: 'fhd' | '2k';
    defaultFps: 30 | 60;
    audioEnabled: boolean;
    includeSystemAudio: boolean;
    includeMicrophone: boolean;
    keyboardTracking: boolean;
    mouseTracking: boolean;
    autoSave: boolean;
  };
  exportSettings: {
    defaultFormat: 'pdf' | 'markdown' | 'pptx' | 'video';
    defaultTheme: 'light' | 'dark';
    defaultTemplate: 'minimal' | 'corporate' | 'technical';
    customization: {
      fontFamily: string;
      primaryColor: string;
      logo?: string;
    };
  };

}

interface AppState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  isAuthInitialized: boolean;

  // Feature flags (always fully unlocked in the open-source build)
  subscriptionFeatures: SubscriptionFeatures;

  // Projects state
  projects: Project[];
  currentProject: Project | null;

  // Recording state
  isRecording: boolean;
  currentRecording: Recording | null;
  recordingStatus: 'idle' | 'recording' | 'paused' | 'processing';
  recordings: Recording[];

  // Screenshot capture state (global flag for navigation blocking)
  isCapturingScreenshots: boolean;

  // UI state
  currentPage: 'auth' | 'dashboard' | 'recording' | 'editing' | 'export' | 'account';
  isLoading: boolean;
  error: string | null;

  // Import state
  isImportingProject: boolean;

  // App restart state
  isAppRestart: boolean;

  // Export tracking
  totalExportCount: number;

  // Settings
  settings: AppSettings;
  
  // Actions
  setUser: (user: User | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
  initializeAuth: () => Promise<void>;

  // Project actions
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setCurrentProject: (project: Project | null) => void;
  removeDuplicateProjects: () => void;
  getProjectDuplicates: () => Project[][];
  
  // Recording actions
  startRecording: (projectId: string, settings: Partial<Recording>) => void;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  addAction: (action: Omit<RecordedAction, 'id'>) => void;
  updateRecording: (id: string, updates: Partial<Recording>) => void;
  setCurrentRecording: (recording: Recording | null) => void;
  
  // Navigation
  setCurrentPage: (page: AppState['currentPage']) => void;
  
  // UI actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Import actions
  setImportingProject: (importing: boolean) => void;

  // Screenshot capture actions
  setCapturingScreenshots: (capturing: boolean) => void;
  
  // Settings actions
  updateSettings: (updates: Partial<AppSettings>) => void;
  
  // App restart actions
  setAppRestart: (isRestart: boolean) => void;
  
  // Export tracking actions
  incrementExportCount: () => void;
}

const defaultSettings: AppSettings = {
  theme: 'light',
  language: 'en',
  recordingSettings: {
    defaultQuality: 'fhd',
    defaultFps: 30,
    audioEnabled: true,
    includeSystemAudio: false,
    includeMicrophone: false,
    keyboardTracking: true,
    mouseTracking: true,
    autoSave: true,
  },
  exportSettings: {
    defaultFormat: 'pdf',
    defaultTheme: 'light',
    defaultTemplate: 'corporate',
    customization: {
      fontFamily: 'Inter',
      primaryColor: '#2563eb',
    },
  },

};

export const useAppStore = create<AppState>()(
  persist(
  (set, get) => ({
    // Initial state
    user: LOCAL_USER,
    isAuthenticated: true,
    isAuthInitialized: false, // Set to true by initializeAuth on startup

    subscriptionFeatures: ALL_FEATURES,

    projects: [],
    currentProject: null,
    isRecording: false,
    currentRecording: null,
    recordingStatus: 'idle',
    recordings: [],
    isCapturingScreenshots: false,
    currentPage: 'dashboard',
    isLoading: false,
    error: null,
    isImportingProject: false,
    isAppRestart: true,
    totalExportCount: 0,
    settings: defaultSettings,

    // User actions
  setUser: (user) => set({ user }),
  setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),
  updateUser: (updates: Partial<User>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null
    }));
  },
    
    initializeAuth: async () => {
      // No accounts: the local user is always signed in with every feature.
      set({
        user: LOCAL_USER,
        isAuthenticated: true,
        isAuthInitialized: true,
        subscriptionFeatures: ALL_FEATURES,
        currentPage: 'dashboard',
      });
    },
    
    // Project actions
    addProject: (projectData) => {
      const newProject: Project = {
        ...projectData,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recordings: projectData.recordings || [],
        metadata: {
          totalDuration: 0,
          actionCount: 0,
          lastActivity: new Date().toISOString(),
          ...projectData.metadata,
        },
      };
      set((state) => ({ projects: [...state.projects, newProject] }));
      return newProject;
    },
    
    updateProject: (id, updates) => {
      set((state) => {
        const updatedProjects = state.projects.map((project) =>
          project.id === id
            ? { ...project, ...updates, updatedAt: new Date().toISOString() }
            : project
        );

        // Also update currentProject if it matches the updated project
        const updatedCurrentProject = state.currentProject?.id === id
          ? { ...state.currentProject, ...updates, updatedAt: new Date().toISOString() }
          : state.currentProject;

        return {
          projects: updatedProjects,
          currentProject: updatedCurrentProject,
        };
      });
    },
    
    deleteProject: async (id) => {
      // Get the project to find its name before deletion
      const { projects } = get();
      const projectToDelete = projects.find(project => project.id === id);

      // Delete project files and folders from disk
      if (projectToDelete && window.electronAPI) {
        try {
          await window.electronAPI.deleteProjectFolder(projectToDelete.name);
        } catch (error) {
          console.error('Failed to delete project folder');
          throw error; // Re-throw to handle in UI
        }
      }

      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
      }));
    },

    toggleFavorite: (id) => {
      set((state) => ({
        projects: state.projects.map((project) =>
          project.id === id
            ? { ...project, isFavorite: !project.isFavorite }
            : project
        ),
      }));
    },

    setCurrentProject: (project) => set({ currentProject: project, currentRecording: null }),
    
    // Duplicate cleanup methods
    getProjectDuplicates: () => {
      const { projects } = get();
      const duplicateGroups: Project[][] = [];
      const processedNames = new Set<string>();
      
      projects.forEach(project => {
        if (processedNames.has(project.name)) return;
        
        const duplicates = projects.filter(p => p.name === project.name);
        if (duplicates.length > 1) {
          duplicateGroups.push(duplicates);
        }
        processedNames.add(project.name);
      });
      
      return duplicateGroups;
    },
    
    removeDuplicateProjects: () => {
      const { projects, currentProject } = get();
      const duplicateGroups = get().getProjectDuplicates();
      
      if (duplicateGroups.length === 0) {
        return;
      }
      
      let projectsToKeep: Project[] = [];
      let projectsToRemove: Project[] = [];
      let newCurrentProject = currentProject;
      
      // Process each group of duplicates
      duplicateGroups.forEach(duplicates => {
        // Sort by data content priority: screenshots first, then recordings, then timestamp
        const sorted = duplicates.sort((a, b) => {
          // Get screenshot counts (documentationSteps length)
          const aScreenshots = a.metadata?.documentationSteps?.length || 0;
          const bScreenshots = b.metadata?.documentationSteps?.length || 0;
          
          // Priority 1: Most screenshots
          if (bScreenshots !== aScreenshots) {
            return bScreenshots - aScreenshots;
          }
          
          // Priority 2: Most recordings
          const aRecordings = a.recordings?.length || 0;
          const bRecordings = b.recordings?.length || 0;
          if (bRecordings !== aRecordings) {
            return bRecordings - aRecordings;
          }
          
          // Priority 3: Most recent timestamp (tiebreaker)
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        
        const projectToKeep = sorted[0];
        const projectsToDiscard = sorted.slice(1);

        projectsToKeep.push(projectToKeep);
        projectsToRemove.push(...projectsToDiscard);

        // Update currentProject if it was one of the removed duplicates
        projectsToDiscard.forEach(p => {
          if (currentProject?.id === p.id) {
            newCurrentProject = projectToKeep;
          }
        });
      });

      // Keep all non-duplicate projects
      const nonDuplicateProjects = projects.filter(project =>
        !duplicateGroups.some(group => group.some(dup => dup.id === project.id))
      );

      const finalProjects = [...nonDuplicateProjects, ...projectsToKeep];
      
      set({
        projects: finalProjects,
        currentProject: newCurrentProject
      });
    },
    
    // Recording actions
    startRecording: (projectId, settings) => {
      const newRecording: Recording = {
        id: crypto.randomUUID(),
        projectId,
        name: `Recording ${new Date().toLocaleString()}`,
        filePath: '',
        duration: 0,
        resolution: '1920x1080',
        fps: 30,
        createdAt: new Date().toISOString(),
        actions: [],
        audioEnabled: true,
        keyboardTracking: true,
        mouseTracking: true,
        source: 'recording',
        ...settings,
      };
      
      set({
        isRecording: true,
        currentRecording: newRecording,
        recordingStatus: 'recording',
      });
    },
    
    stopRecording: () => {
      const { currentRecording, currentProject } = get();
      if (currentRecording && currentProject) {
        // Add recording to current project
        const updatedProject = {
          ...currentProject,
          recordings: [...currentProject.recordings, currentRecording],
          metadata: {
            ...currentProject.metadata,
            totalDuration: currentProject.metadata.totalDuration + currentRecording.duration,
            actionCount: currentProject.metadata.actionCount + currentRecording.actions.length,
            lastActivity: new Date().toISOString(),
          },
        };
        
        get().updateProject(currentProject.id, updatedProject);
      }
      
      set({
        isRecording: false,
        currentRecording: null,
        recordingStatus: 'idle',
      });
    },
    
    pauseRecording: () => set({ recordingStatus: 'paused' }),
    resumeRecording: () => set({ recordingStatus: 'recording' }),
    
    addAction: (actionData) => {
      const { currentRecording } = get();
      if (currentRecording) {
        const newAction: RecordedAction = {
          ...actionData,
          id: crypto.randomUUID(),
        };
        
        const updatedRecording = {
          ...currentRecording,
          actions: [...currentRecording.actions, newAction],
        };
        
        set({ currentRecording: updatedRecording });
      }
    },
    
    updateRecording: (id, updates) => {
      set((state) => {
        // Update recordings array
        const updatedRecordings = state.recordings.map((recording) =>
          recording.id === id ? { ...recording, ...updates } : recording
        );
        
        // Update currentRecording if it matches
        const updatedCurrentRecording = state.currentRecording?.id === id 
          ? { ...state.currentRecording, ...updates }
          : state.currentRecording;
        
        // Also update the recording in the current project's recordings array
        let updatedProjects = state.projects;
        if (state.currentProject) {
          updatedProjects = state.projects.map((project) => {
            if (project.id === state.currentProject?.id) {
              return {
                ...project,
                recordings: project.recordings.map((recording) =>
                  recording.id === id ? { ...recording, ...updates } : recording
                )
              };
            }
            return project;
          });
        }
        
        // Update currentProject if it contains the updated recording
        let updatedCurrentProject = state.currentProject;
        if (state.currentProject) {
          updatedCurrentProject = {
            ...state.currentProject,
            recordings: state.currentProject.recordings.map((recording) =>
              recording.id === id ? { ...recording, ...updates } : recording
            )
          };
        }

        return {
          recordings: updatedRecordings,
          currentRecording: updatedCurrentRecording,
          projects: updatedProjects,
          currentProject: updatedCurrentProject
        };
      });
    },

    setCurrentRecording: (recording) => set({ currentRecording: recording }),
    
    // Navigation
    setCurrentPage: (page) => set({ currentPage: page }),
    
    // UI actions
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    
    // Import actions
    setImportingProject: (importing) => set({ isImportingProject: importing }),

    setCapturingScreenshots: (capturing) => set({ isCapturingScreenshots: capturing }),

    // Settings actions
    updateSettings: (updates) => {
      set((state) => ({
        settings: { ...state.settings, ...updates },
      }));
    },
    
    // App restart actions
    setAppRestart: (isRestart) => set({ isAppRestart: isRestart }),

    incrementExportCount: () => set((state) => ({ totalExportCount: state.totalExportCount + 1 })),
    
  }),
  {
    name: 'docfai-storage',
    version: 3, // Increment when schema changes (added export count tracking)
    storage: createJSONStorage(() => createElectronStorage()), // Use electron-store instead of localStorage
    migrate: (persistedState: any, version: number) => {
      // Migration for version 2: ensure bookmarks field exists in recordings
      if (version < 2) {
        // Migrating store to version 2 (adding bookmarks support)
        if (persistedState?.projects) {
          persistedState.projects = persistedState.projects.map((project: any) => ({
            ...project,
            recordings: project.recordings?.map((rec: any) => ({
              ...rec,
              bookmarks: rec.bookmarks || [] // Add bookmarks field if missing
            })) || []
          }));
        }
      }
      // Migration for version 3: add totalExportCount field
      if (version < 3) {
        // Migrating store to version 3 (adding export count tracking)
        // Initialize with count of projects that have documentationSteps (best estimate from old data)
        let initialExportCount = 0;
        if (persistedState?.projects) {
          initialExportCount = persistedState.projects.filter((p: any) =>
            (p.metadata?.documentationSteps && p.metadata.documentationSteps.length > 0) ||
            p.recordings?.some((r: any) => r.documentationSteps && r.documentationSteps.length > 0)
          ).length;
        }
        persistedState.totalExportCount = initialExportCount;
      }
      return persistedState;
    },
    partialize: (state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      projects: state.projects.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        status: project.status,
        projectType: project.projectType,
        recordings: project.recordings.map(rec => ({
          id: rec.id,
          projectId: rec.projectId,
          name: rec.name,
          filePath: rec.filePath,
          duration: rec.duration,
          resolution: rec.resolution,
          fps: rec.fps,
          createdAt: rec.createdAt,
          // ❌ REMOVED: actions[] array (large, can be derived if needed)
          audioEnabled: rec.audioEnabled,
          keyboardTracking: rec.keyboardTracking,
          mouseTracking: rec.mouseTracking,
          source: rec.source,
          projectPath: rec.projectPath,
          metadata: rec.metadata,
          bookmarks: rec.bookmarks // Timeline bookmarks for quick navigation
        })),
        metadata: {
          totalDuration: project.metadata.totalDuration,
          actionCount: project.metadata.actionCount,
          lastActivity: project.metadata.lastActivity,
          projectTitle: project.metadata.projectTitle,
          projectSource: project.metadata.projectSource,
          // ✅ KEEP screenshots array BUT remove imageData (base64)
          screenshots: project.metadata.screenshots?.map(screenshot => ({
            id: screenshot.id,
            timestamp: screenshot.timestamp,
            // ❌ REMOVED: imageData (base64 - huge!)
            filePath: screenshot.filePath,
            clickX: screenshot.clickX,
            clickY: screenshot.clickY,
            description: screenshot.description,
            filename: (screenshot as any).filename,
            size: (screenshot as any).size,
            mediaType: (screenshot as any).mediaType,
            videoClipPath: (screenshot as any).videoClipPath,
            videoClipMimeType: (screenshot as any).videoClipMimeType,
          })),
          documentationSteps: project.metadata.documentationSteps?.map(step => ({
            id: step.id,
            timestamp: step.timestamp,
            title: step.title,
            description: step.description,
            // Keep screenshot field ONLY when it's a file path reference (not base64 data)
            screenshot: step.screenshot && !step.screenshot.startsWith('data:') ? step.screenshot : undefined,
            actionType: step.actionType,
            element: step.element,
            isGenerated: step.isGenerated,
            type: step.type,
            // Only persist file paths, not content:
            diagramJsonPath: step.diagramJsonPath,
            diagramImagePath: step.diagramImagePath,
            // Video clip fields:
            videoClipPath: step.videoClipPath,
            videoClipMimeType: step.videoClipMimeType,
            mediaType: step.mediaType,
            // ❌ REMOVED: diagramElements (load from JSON file on-demand)
            // ❌ REMOVED: diagramAppState (load from JSON file on-demand)
          }))
        },
        // Keep encrypted notes (important for collaboration)
        encryptedNotes: project.encryptedNotes,
        // Keep version metadata (file paths only, no content)
        versions: project.versions
      })),
      // ❌ REMOVED: currentProject (duplicate of projects[i])
      totalExportCount: state.totalExportCount,
      settings: state.settings,
    }),
  }
));
