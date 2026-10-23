import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Video,
  Camera,
  Search,
  Filter,
  Play,
  Edit3,
  Share2,
  Trash2,
  Clock,
  FileText,
  TrendingUp,
  Calendar,
  Star,
  Shield,
  Upload,
  StickyNote,
  PenTool,
  ArrowRight,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';
import ProjectExportModal from '../components/ProjectExportModal';
import ProjectImportModal from '../components/ProjectImportModal';
import ProjectPageModal from '../components/ProjectPageModal';
import CoachMark from '../components/CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';
import { createLogger } from '../utils/logger';

const logger = createLogger("Dashboard");


const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('dashboard');
  const {
    user,
    projects,
    totalExportCount,
    addProject,
    deleteProject,
    toggleFavorite,
    setCurrentProject,
    setCurrentRecording,
    isRecording
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportProjectId, setExportProjectId] = useState<string>('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showProjectPageModal, setShowProjectPageModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<typeof projects[0] | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);

  // Onboarding hints
  const hintsSuppressed = useHintsSuppressed();

  const startRecordingBtnRef = useRef<HTMLButtonElement | null>(null);
  const newProjectBtnRef = useRef<HTMLButtonElement | null>(null);
  const stepByStepBtnRef = useRef<HTMLButtonElement | null>(null);
  const importBtnRef = useRef<HTMLButtonElement | null>(null);

  const [startRecordingReady, setStartRecordingReady] = useState(false);
  const [newProjectReady, setNewProjectReady] = useState(false);
  const [stepByStepReady, setStepByStepReady] = useState(false);
  const [importReady, setImportReady] = useState(false);

  const assignStartRecordingRef = useCallback((node: HTMLButtonElement | null) => {
    startRecordingBtnRef.current = node;
    setStartRecordingReady(!!node);
  }, []);
  const assignNewProjectRef = useCallback((node: HTMLButtonElement | null) => {
    newProjectBtnRef.current = node;
    setNewProjectReady(!!node);
  }, []);
  const assignStepByStepRef = useCallback((node: HTMLButtonElement | null) => {
    stepByStepBtnRef.current = node;
    setStepByStepReady(!!node);
  }, []);
  const assignImportRef = useCallback((node: HTMLButtonElement | null) => {
    importBtnRef.current = node;
    setImportReady(!!node);
  }, []);

  // Suppress dashboard hints when any modal is open so modal-specific hints take priority
  const anyModalOpen = showNewProjectModal || showImportModal || showProjectPageModal || showDeleteConfirmModal || showExportModal;

  const startRecordingHint = useOnboardingHint('dashboard.startRecording', { priority: 100, when: !isRecording && !anyModalOpen });
  const newProjectHint = useOnboardingHint('dashboard.newProject', { priority: 90, when: !anyModalOpen });
  const stepByStepHint = useOnboardingHint('dashboard.stepByStep', { priority: 80, when: !anyModalOpen });
  const importHint = useOnboardingHint('dashboard.importProject', { priority: 70, when: !anyModalOpen });

  // Cleanup: Stop recording if still active when component unmounts
  useEffect(() => {
    return () => {
      if (isRecording && window.electronAPI) {
        logger.log('Dashboard unmounting, stopping active recording...');
        window.electronAPI.stopGlobalRecording().catch((err) => logger.error(err));
      }
    };
  }, [isRecording]);

  // Handle page unload/refresh to stop recording
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isRecording && window.electronAPI) {
        // Stop recording before page unloads
        window.electronAPI.stopGlobalRecording().catch((err) => logger.error(err));
        // Show warning to user
        event.preventDefault();
        const msg = t('toast.leavePrompt');
        event.returnValue = msg;
        return msg;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRecording]);

  const filteredProjects = projects
    .filter(project =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      // Favorited projects first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      // Then sort by most recently updated
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  // Helper: Check if steps have been edited beyond auto-generated defaults
  const hasEditedSteps = (project: typeof projects[0]) => {
    const steps = project.metadata?.documentationSteps;
    if (!steps || steps.length === 0) return false;

    return steps.some(step => {
      const title = (step.title || '').trim();
      if (!title) return false;
      // Auto-generated default patterns
      if (/^Step \d+$/i.test(title)) return false;
      if (/^Click \d+$/i.test(title)) return false;
      if (/^Bookmark at /i.test(title)) return false;
      // Title has been customized by the user
      return true;
    });
  };

  // Helper: Get project workflow stage from actual data
  // Flow: Empty → Needs editing → Ready to export → Completed
  const getProjectStage = (project: typeof projects[0]) => {
    const hasRecordings = project.recordings?.length > 0;
    const hasScreenshots = (project.metadata?.screenshots?.length || 0) > 0;
    const hasSteps = (project.metadata?.documentationSteps?.length || 0) > 0;
    const hasContent = hasRecordings || hasScreenshots;

    if (!hasContent && !hasSteps) {
      return { key: 'empty', label: t('stage.empty'), classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
    }
    if (project.metadata?.lastExportedAt) {
      return { key: 'completed', label: t('stage.completed'), classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    }
    if (hasContent && hasEditedSteps(project)) {
      return { key: 'readyToExport', label: t('stage.readyToExport'), classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    }
    return { key: 'needsEditing', label: t('stage.needsEditing'), classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  };

  // Helper: Relative time display
  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return t('time.minsAgo', { count: diffMins });
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  // Derived data for dashboard sections
  const lastEditedProject = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;

  const needsEditingCount = projects.filter(p => {
    const hasContent = p.recordings?.length > 0 || (p.metadata?.screenshots?.length || 0) > 0;
    const hasSteps = (p.metadata?.documentationSteps?.length || 0) > 0;
    return hasContent && !hasSteps;
  }).length;

  const readyToExportCount = projects.filter(p => {
    const hasSteps = (p.metadata?.documentationSteps?.length || 0) > 0;
    return hasSteps && !p.metadata?.lastExportedAt;
  }).length;

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error(t('toast.nameRequired'));
      return;
    }

    // Check for duplicate project name (case-insensitive)
    const trimmedName = newProjectName.trim();
    const duplicateProject = projects.find(
      p => p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicateProject) {
      toast.error(t('toast.duplicateName', { name: duplicateProject.name }));
      return;
    }

    try {
      // Create project folder structure if in Electron environment
      if (window.electronAPI) {
        await window.electronAPI.createProjectFolder(newProjectName.trim());
      }

      const projectName = newProjectName.trim();

      addProject({
        name: projectName,
        description: newProjectDescription,
        status: 'draft',
        recordings: [],
        metadata: {
          totalDuration: 0,
          actionCount: 0,
          lastActivity: new Date().toISOString(),
        }
      });

      // Clear the form immediately
      setNewProjectName('');
      setNewProjectDescription('');
      setShowNewProjectModal(false);
      toast.success(t('toast.created'));

      // Find the newly created project from the store state (not component state)
      // Use a small delay to ensure Zustand store has updated
      setTimeout(() => {
        const storeState = useAppStore.getState();
        // Find the most recently created project with this name (last in array)
        const matchingProjects = storeState.projects.filter(p => p.name === projectName);
        const newProject = matchingProjects[matchingProjects.length - 1];

        logger.log('Looking for project:', projectName);
        logger.log('Found project:', newProject);

        if (newProject) {
          setSelectedProject(newProject);
          setShowProjectPageModal(true);
        } else {
          logger.error('Project not found in store after creation');
        }
      }, 150);
    } catch (error) {
      logger.error('Failed to create project folder:', error);
      toast.error(t('toast.createFailed'));
    }
  };

  const handleQuickRecord = () => {
    setCurrentProject(null);
    navigate('/recording');
  };

  const handleScreenshotCapture = async () => {
    try {
      // Check if we're in Electron environment
      if (!window.electronAPI) {
        toast.error(t('toast.desktopOnly'));
        return;
      }

      // Create or use existing project for screenshots
      let targetProject;
      if (projects.length === 0) {
        const screenshotProject = {
          name: `Screenshot Session ${new Date().toLocaleDateString()}`,
          description: 'System-wide screenshot capture session',
          status: 'recording' as const,
          recordings: [],
          metadata: {
            totalDuration: 0,
            actionCount: 0,
            lastActivity: new Date().toISOString(),
            screenshots: []
          }
        };
        addProject(screenshotProject);
        targetProject = screenshotProject;
      } else {
        targetProject = projects[0];
      }

      // Store screenshots and click data
      const screenshots: Array<{
        id: string;
        timestamp: number;
        imageData: string;
        clickX: number;
        clickY: number;
        description: string;
      }> = [];

      let clickCount = 0;
      let cleanupScreenshotListener: (() => void) | null = null;

      // Show recording interface (Security: using DOM API instead of innerHTML to avoid XSS)
      const recordingModal = document.createElement('div');
      recordingModal.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      `;

      // Create modal content using DOM API (safe from XSS)
      const container = document.createElement('div');
      container.style.textAlign = 'center';

      const title = document.createElement('h3');
      title.style.cssText = 'margin: 0 0 10px 0;';
      title.textContent = t('capture.modalTitle');

      const instructions = document.createElement('p');
      instructions.style.cssText = 'margin: 0 0 10px 0; font-size: 14px;';
      // Safe: markup is authored in locale files, not user input (no XSS surface)
      instructions.innerHTML = t('capture.modalInstructions');

      const subtext = document.createElement('p');
      subtext.style.cssText = 'margin: 0 0 15px 0; font-size: 12px; color: #ccc;';
      subtext.textContent = t('capture.modalSubtext');

      const counterDiv = document.createElement('div');
      counterDiv.style.marginBottom = '15px';
      const counter = document.createElement('span');
      counter.id = 'click-counter';
      counter.textContent = t('capture.screenshotsCounter', { count: 0 });
      counterDiv.appendChild(counter);

      const stopButton = document.createElement('button');
      stopButton.id = 'stop-capture';
      stopButton.textContent = t('capture.stopRecording');
      stopButton.style.cssText = `
        background: #ef4444;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      `;
      // Use proper event listeners instead of inline handlers (more secure)
      stopButton.addEventListener('mouseover', () => stopButton.style.background = '#dc2626');
      stopButton.addEventListener('mouseout', () => stopButton.style.background = '#ef4444');

      container.appendChild(title);
      container.appendChild(instructions);
      container.appendChild(subtext);
      container.appendChild(counterDiv);
      container.appendChild(stopButton);
      recordingModal.appendChild(container);

      document.body.appendChild(recordingModal);

      // Update click counter - using textContent to prevent XSS
      const updateCounter = () => {
        const counter = document.getElementById('click-counter');
        if (counter) {
          counter.textContent = t('capture.screenshotsCounter', { count: clickCount });
        }
      };

      // Start global recording
      const recordingResult = await window.electronAPI.startGlobalRecording();
      
      if (!recordingResult.success) {
        toast.error(recordingResult.error || t('toast.startGlobalFailed'));
        document.body.removeChild(recordingModal);
        return;
      }

      // Removed duplicate notification - handled by IPC listener

      // Listen for automatic screenshot captures
      const handleScreenshotCapture = (event: any, screenshot: any) => {
        screenshots.push({
          id: `screenshot-${Date.now()}-${Math.random()}`,
          timestamp: screenshot.timestamp,
          imageData: screenshot.imageData,
          clickX: screenshot.clickX,
          clickY: screenshot.clickY,
          description: `Click ${clickCount + 1}`
        });
        
        clickCount++;
        updateCounter();
        // Removed duplicate toast notification - handled by pollInterval
      };

      // Add IPC listener for automatic screenshots
      if (window.electronAPI && window.electronAPI.onScreenshotCaptured) {
        cleanupScreenshotListener = window.electronAPI.onScreenshotCaptured(handleScreenshotCapture);
      }

      // Poll for new screenshots (fallback method)
      const pollInterval = setInterval(async () => {
        try {
          const status = await window.electronAPI.getGlobalRecordingStatus();
          
          if (status.isRecording && status.screenshots) {
            // Process new screenshots
            const newScreenshots = status.screenshots.slice(clickCount);
            
            for (const screenshot of newScreenshots) {
              screenshots.push({
                id: `screenshot-${Date.now()}-${Math.random()}`,
                timestamp: screenshot.timestamp,
                imageData: screenshot.imageData,
                clickX: screenshot.clickX,
                clickY: screenshot.clickY,
                description: `Click ${clickCount + 1}`
              });
              
              clickCount++;
              updateCounter();
            }
          }
        } catch (error) {
          logger.error('Error polling recording status:', error);
        }
      }, 1000);

      // Stop capture function
      const stopCapture = async () => {
        try {
          clearInterval(pollInterval);
          
          // Clean up IPC listener
          if (cleanupScreenshotListener) {
            cleanupScreenshotListener();
          }
          
          // Stop global recording
          await window.electronAPI.stopGlobalRecording();
          
          document.body.removeChild(recordingModal);
          
          // Save screenshots to project and navigate to editing
          if (screenshots.length > 0 && targetProject) {
            setCurrentProject({
              ...targetProject,
              metadata: {
                ...targetProject.metadata,
                screenshots: screenshots,
                lastActivity: new Date().toISOString()
              }
            });
            
            // Removed duplicate toast notification - handled by IPC listener
            
            setTimeout(() => {
              navigate('/editing');
            }, 1500);
          } else {
            toast.info(t('toast.noScreenshots'));
          }
        } catch (error) {
          logger.error('Error stopping recording:', error);
          toast.error(t('toast.stopError'));
        }
      };

      // Add stop button listener
      const stopButtonElement = document.getElementById('stop-capture');
      if (stopButtonElement) {
        stopButtonElement.addEventListener('click', stopCapture);
      }
      
    } catch (error: any) {
      logger.error('Screenshot capture error:', error);
      toast.error(t('toast.startSystemFailed'));
    }
  };

  const handleTakeScreenshot = async () => {
    try {
      // Check if the browser supports screen capture
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast.error(t('toast.captureNotSupported'));
        return;
      }

      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      video.onloadedmetadata = () => {
        // Create canvas to draw the video frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          
          // Convert to blob and download
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `screenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              // Removed duplicate toast notification - handled by IPC listener
            }
          }, 'image/jpeg', 0.9);
        }
        
        // Stop the stream
        stream.getTracks().forEach(track => track.stop());
      };
    } catch (error) {
      logger.error('Error capturing screenshot:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          toast.error(t('toast.capturePermissionDenied'));
        } else if (error.name === 'NotSupportedError') {
          toast.error(t('toast.captureNotSupported2'));
        } else {
          toast.error(t('toast.captureFailed'));
        }
      } else {
        toast.error(t('toast.captureFailed'));
      }
    }
  };

  const handleProjectAction = async (projectId: string, action: 'edit' | 'delete' | 'export') => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    switch (action) {
      case 'edit':
        setCurrentProject(project);

        // Prepare navigation state with recording data including bookmarks
        const navigationState: any = {
          projectId: project.id,
          fromProjectPage: true
        };

        // If project has screenshots, include them
        if (project.metadata?.screenshots && project.metadata.screenshots.length > 0) {
          navigationState.screenshots = project.metadata.screenshots;
          navigationState.fromInteractiveCapture = true;
        }

        // If project has recordings, include the first one with bookmarks
        if (project.recordings && project.recordings.length > 0) {
          const recording = project.recordings[0];
          navigationState.recordingId = recording.id;
          navigationState.videoFilePath = recording.filePath;
          navigationState.duration = recording.duration;
          navigationState.bookmarks = recording.bookmarks || [];
        }

        navigate('/editing', { state: navigationState });
        break;
      case 'delete':
        setProjectToDelete({ id: project.id, name: project.name });
        setShowDeleteConfirmModal(true);
        break;
      case 'export':
        // Check if project has recordings or screenshots to export
        const hasRecordings = project.recordings && project.recordings.length > 0;
        const hasScreenshots = project.metadata?.screenshots && project.metadata.screenshots.length > 0;
        
        if (hasRecordings || hasScreenshots) {
          setCurrentProject(project);
          setExportProjectId(project.id);
          setShowExportModal(true);
        } else {
          // No exportable content found
          toast.error(t('toast.noExportable'));
        }
        break;
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete.id);
      toast.success(t('toast.deleted'));
    } catch (error) {
      logger.error('Failed to delete project:', error);
      toast.error(t('toast.deleteFailed'));
    } finally {
      setShowDeleteConfirmModal(false);
      setProjectToDelete(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'recording': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'editing': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('welcome', { name: user?.name || user?.firstName || '' })}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {projects.length === 0
                ? t('subtitle.empty')
                : needsEditingCount > 0
                  ? t('subtitle.needsEditing', { count: needsEditingCount })
                  : readyToExportCount > 0
                    ? t('subtitle.readyToExport', { count: readyToExportCount })
                    : t('subtitle.allUpToDate', { count: projects.length })
              }
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleAllOnboardingHints}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                hintsSuppressed
                  ? "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
              title={hintsSuppressed ? t('hints.show') : t('hints.hide')}
              aria-pressed={!hintsSuppressed}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Continue bar */}
        {lastEditedProject && getProjectStage(lastEditedProject).key !== 'empty' && (
          <div
            onClick={() => handleProjectAction(lastEditedProject.id, 'edit')}
            className="group flex items-center justify-between px-4 py-2.5 bg-white/70 dark:bg-slate-800/70 rounded-lg border border-blue-200 dark:border-slate-700 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <Play className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{t('continue', { name: lastEditedProject.name })}</span>
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0", getProjectStage(lastEditedProject).classes)}>
                {getProjectStage(lastEditedProject).label}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{getRelativeTime(lastEditedProject.updatedAt)}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t('quickActions.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            ref={assignStartRecordingRef}
            onClick={handleQuickRecord}
            disabled={isRecording}
            className={cn(
              "p-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-900 transition-all duration-200 transform hover:scale-105",
              isRecording && "opacity-50 cursor-not-allowed"
            )}
          >
            <Video className="w-8 h-8 mb-3" />
            <h3 className="text-lg font-semibold mb-1">{t('quickActions.startRecordingTitle')}</h3>
            <p className="text-blue-100 text-sm">{t('quickActions.startRecordingDesc')}</p>
          </button>

          <button
            ref={assignNewProjectRef}
            onClick={() => setShowNewProjectModal(true)}
            className="p-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-900 transition-all duration-200 transform hover:scale-105"
          >
            <Plus className="w-8 h-8 mb-3" />
            <h3 className="text-lg font-semibold mb-1">{t('quickActions.newProjectTitle')}</h3>
            <p className="text-blue-100 text-sm">{t('quickActions.newProjectDesc')}</p>
          </button>

          <button
            ref={assignStepByStepRef}
            onClick={() => { setCurrentProject(null); navigate('/interactive-screenshots'); }}
            className="p-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-900 transition-all duration-200 transform hover:scale-105"
          >
            <Camera className="w-8 h-8 mb-3" />
            <h3 className="text-lg font-semibold mb-1">{t('quickActions.stepByStepTitle')}</h3>
            <p className="text-green-100 text-sm">{t('quickActions.stepByStepDesc')}</p>
          </button>

          <button
            ref={assignImportRef}
            onClick={() => setShowImportModal(true)}
            className="p-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-900 transition-all duration-200 transform hover:scale-105"
          >
            <Upload className="w-8 h-8 mb-3" />
            <h3 className="text-lg font-semibold mb-1">{t('quickActions.importProjectTitle')}</h3>
            <p className="text-purple-100 text-sm">{t('quickActions.importProjectDesc')}</p>
          </button>
        </div>
      </div>



      {/* Projects Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('recentProjects')}</h2>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <button className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <Filter className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="py-8">
            {projects.length === 0 ? (
              <>
                <div className="text-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                    {t('chooseMethod.title')}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {t('chooseMethod.subtitle')}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  <button
                    onClick={handleQuickRecord}
                    className="p-6 bg-white dark:bg-slate-800 rounded-xl border-2 border-blue-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-200 text-left group"
                  >
                    <Video className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{t('chooseMethod.videoTitle')}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('chooseMethod.videoDesc')}
                    </p>
                  </button>
                  <button
                    onClick={() => { setCurrentProject(null); navigate('/interactive-screenshots'); }}
                    className="p-6 bg-white dark:bg-slate-800 rounded-xl border-2 border-green-200 dark:border-slate-700 hover:border-green-400 dark:hover:border-green-500 transition-all duration-200 text-left group"
                  >
                    <Camera className="w-8 h-8 text-green-600 dark:text-green-400 mb-3 group-hover:scale-110 transition-transform" />
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{t('chooseMethod.screenshotsTitle')}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('chooseMethod.screenshotsDesc')}
                    </p>
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{t('noResults.title')}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{t('noResults.subtitle')}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="group bg-gradient-to-br from-white to-blue-50 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-slate-900/80 rounded-xl border-2 border-blue-300 dark:border-slate-700/60 p-4 shadow-sm hover:shadow-lg dark:shadow-lg dark:hover:shadow-blue-900/30 dark:hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 dark:backdrop-blur-sm cursor-pointer"
                onClick={() => {
                  setSelectedProject(project);
                  setShowProjectPageModal(true);
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-blue-900 dark:text-white mb-0.5">
                      {project.name}
                    </h3>
                    <p className="text-xs text-blue-700 dark:text-slate-300 line-clamp-2">
                      {project.description || t('project.noDescription')}
                    </p>
                  </div>
                </div>

                {/* Progress stage + type + date */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      getProjectStage(project).classes
                    )}>
                      {getProjectStage(project).label}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                      {project.projectType === 'interactive-screenshots' ? (
                        <><Camera className="w-3 h-3" /> {t('project.typeScreenshots')}</>
                      ) : project.projectType === 'video-recording' ? (
                        <><Video className="w-3 h-3" /> {t('project.typeVideo')}</>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-blue-600 dark:text-slate-400">
                    <Calendar className="w-3 h-3 mr-1" />
                    {getRelativeTime(project.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-blue-200 dark:border-slate-700/60">
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProjectAction(project.id, 'edit');
                      }}
                      className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/20 rounded transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProjectAction(project.id, 'export');
                      }}
                      className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/20 rounded transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProjectAction(project.id, 'delete');
                      }}
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/20 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(project.id);
                    }}
                    className="p-1 hover:bg-yellow-50 dark:hover:bg-yellow-500/20 rounded transition-colors"
                  >
                    <Star
                      className={cn(
                        "w-4 h-4 transition-colors",
                        project.isFavorite
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-gray-400 dark:text-slate-500 hover:text-yellow-500 dark:hover:text-yellow-400"
                      )}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('modal.createNewTitle')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('modal.projectName')}
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('modal.projectNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('modal.description')}
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  rows={3}
                  placeholder={t('modal.descriptionPlaceholder')}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('modal.cancel')}
              </button>
              <button
                onClick={handleCreateProject}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('modal.createProject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Export Modal */}
      <ProjectExportModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setExportProjectId('');
        }}
        projectId={exportProjectId}
      />

      {/* Project Import Modal */}
      <ProjectImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />

      {/* Project Page Modal */}
      {selectedProject && (
        <ProjectPageModal
          isOpen={showProjectPageModal}
          onClose={() => {
            setShowProjectPageModal(false);
            setSelectedProject(null);
          }}
          project={projects.find(p => p.id === selectedProject.id) || selectedProject}
        />
      )}

      {/* Delete Project Confirmation Modal */}
      {showDeleteConfirmModal && projectToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('modal.deleteTitle')}
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              {t('modal.deleteConfirm', { name: projectToDelete.name })}
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-6">
              {t('modal.deleteWarning')}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setProjectToDelete(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('modal.cancel')}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                {t('modal.deleteButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding coach marks */}
      {startRecordingHint.visible && startRecordingReady && (
        <CoachMark
          anchorRef={startRecordingBtnRef}
          title={t('coach.startRecordingTitle')}
          description={t('coach.startRecordingDesc')}
          placement="bottom"
          onDismiss={startRecordingHint.dismiss}
        />
      )}
      {newProjectHint.visible && newProjectReady && (
        <CoachMark
          anchorRef={newProjectBtnRef}
          title={t('coach.newProjectTitle')}
          description={t('coach.newProjectDesc')}
          placement="bottom"
          onDismiss={newProjectHint.dismiss}
        />
      )}
      {stepByStepHint.visible && stepByStepReady && (
        <CoachMark
          anchorRef={stepByStepBtnRef}
          title={t('coach.stepByStepTitle')}
          description={t('coach.stepByStepDesc')}
          placement="bottom"
          onDismiss={stepByStepHint.dismiss}
        />
      )}
      {importHint.visible && importReady && (
        <CoachMark
          anchorRef={importBtnRef}
          title={t('coach.importTitle')}
          description={t('coach.importDesc')}
          placement="bottom"
          onDismiss={importHint.dismiss}
        />
      )}
      </div>
    </div>
  );
};

export default Dashboard;
