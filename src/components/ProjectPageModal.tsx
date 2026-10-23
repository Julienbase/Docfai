import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  X,
  Plus,
  Save,
  Trash2,
  Video,
  Camera,
  FileText,
  Clock,
  User,
  AlertCircle,
  Edit3,
  Download,
  History,
  RotateCcw,
  FolderOpen,
  HardDrive,
  Image,
  Layers,
  Play,
  Monitor,
  MousePointer,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, type Project, type ProjectVersion } from '../store/useAppStore';
import { notesEncryptionService, type ProjectNote } from '../services/NotesEncryptionService';
import { versionService } from '../services/VersionService';
import { cn } from '../lib/utils';
import CoachMark from './CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';

interface ProjectPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
}

const ProjectPageModal: React.FC<ProjectPageModalProps> = ({ isOpen, onClose, project }) => {
  const navigate = useNavigate();
  const { t } = useTranslation('projectModal');
  const { user, updateProject } = useAppStore();

  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRecordingType, setSelectedRecordingType] = useState<'video-recording' | 'interactive-screenshots' | null>(null);

  // Versioning state
  const [rightTab, setRightTab] = useState<'notes' | 'versions'>('notes');
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmDeleteVersionId, setConfirmDeleteVersionId] = useState<string | null>(null);
  const [confirmRestoreVersionId, setConfirmRestoreVersionId] = useState<string | null>(null);
  const [isSavingVersion, setIsSavingVersion] = useState(false);

  // Load encrypted notes and versions when modal opens
  // Include project.versions?.length so versions refresh when they change
  useEffect(() => {
    if (isOpen && project) {
      loadNotes();
      loadVersions();

      // Auto-select recording type based on existing content
      if (project.recordings && project.recordings.length > 0) {
        setSelectedRecordingType('video-recording');
      } else if (project.metadata?.screenshots && project.metadata.screenshots.length > 0) {
        setSelectedRecordingType('interactive-screenshots');
      }
    }
  }, [isOpen, project, project?.versions?.length]);

  const loadNotes = async () => {
    try {
      setIsLoadingNotes(true);

      if (project.encryptedNotes) {
        const decryptedNotes = await notesEncryptionService.decryptNotes(project.encryptedNotes);
        setNotes(decryptedNotes);
      } else {
        setNotes([]);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
      toast.error(t('toast.notesLoadFailed'));
      setNotes([]);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const loadVersions = () => {
    const projectVersions = versionService.getVersions(project.id);
    setVersions(projectVersions);
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) {
      toast.error(t('toast.enterNote'));
      return;
    }

    if (!user) {
      toast.error(t('toast.userNotAuth'));
      return;
    }

    try {
      setIsSaving(true);

      // Sanitize note content to prevent XSS
      const sanitizedContent = notesEncryptionService.sanitizeNoteContent(newNoteContent);

      // Create new note
      const newNote: ProjectNote = {
        id: crypto.randomUUID(),
        content: sanitizedContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`.trim() || user.email,
          email: user.email,
        },
        isEncrypted: true,
      };

      // Add to notes array
      const updatedNotes = [...notes, newNote];

      // Encrypt and save notes
      const encryptedData = await notesEncryptionService.encryptNotes(updatedNotes);

      // Update project with encrypted notes and notes count
      updateProject(project.id, {
        encryptedNotes: encryptedData,
        metadata: {
          ...project.metadata,
          notesCount: updatedNotes.length
        }
      });

      // Update local state
      setNotes(updatedNotes);
      setNewNoteContent('');
      setShowAddNote(false);

      toast.success(t('toast.noteAdded'));
    } catch (error) {
      console.error('Failed to add note:', error);
      toast.error(t('toast.noteAddFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      setIsSaving(true);

      // Remove note from array
      const updatedNotes = notes.filter(note => note.id !== noteId);

      // Encrypt and save notes
      const encryptedData = await notesEncryptionService.encryptNotes(updatedNotes);

      // Update project with encrypted notes and notes count
      updateProject(project.id, {
        encryptedNotes: encryptedData,
        metadata: {
          ...project.metadata,
          notesCount: updatedNotes.length
        }
      });

      // Update local state
      setNotes(updatedNotes);

      toast.success(t('toast.noteDeleted'));
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error(t('toast.noteDeleteFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      const success = await versionService.deleteVersion(project.id, versionId);
      if (success) {
        loadVersions();
        toast.success(t('toast.versionDeleted'));
      } else {
        toast.error(t('toast.versionDeleteFailed'));
      }
    } catch (error) {
      console.error('Failed to delete version:', error);
      toast.error(t('toast.versionDeleteFailed'));
    } finally {
      setConfirmDeleteVersionId(null);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    try {
      setIsRestoring(true);
      setConfirmRestoreVersionId(null);

      const success = await versionService.restoreVersion(
        project.id,
        versionId,
        (message) => {
          toast.loading(message, { id: 'restore-progress' });
        }
      );

      toast.dismiss('restore-progress');

      if (success) {
        toast.success(t('toast.projectRestored'));
        onClose();
      } else {
        toast.error(t('toast.versionRestoreFailed'));
      }
    } catch (error) {
      toast.dismiss('restore-progress');
      console.error('Failed to restore version:', error);
      toast.error(t('toast.versionRestoreFailed'));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleShowVersionInFolder = async (filePath: string) => {
    try {
      if (window.electronAPI?.backup?.showItemInFolder) {
        await window.electronAPI.backup.showItemInFolder(filePath);
      }
    } catch (error) {
      console.error('Failed to show version in folder:', error);
    }
  };

  const handleSaveVersion = async () => {
    try {
      setIsSavingVersion(true);
      const version = await versionService.saveVersion(
        project.id,
        (message) => {
          toast.loading(message, { id: 'save-version-progress' });
        }
      );
      toast.dismiss('save-version-progress');
      if (version) {
        loadVersions();
        setRightTab('versions');
        toast.success(t('toast.versionSaved', { n: version.versionNumber }));
      }
    } catch (error) {
      toast.dismiss('save-version-progress');
      console.error('Failed to save version:', error);
      toast.error(t('toast.versionSaveFailed'));
    } finally {
      setIsSavingVersion(false);
    }
  };

  const handleStartRecording = () => {
    if (!selectedRecordingType) {
      toast.error(t('toast.selectRecordingType'));
      return;
    }

    // Prevent changing recording type on projects with existing content
    const hasExistingContent = (project.recordings && project.recordings.length > 0) ||
                                (project.metadata?.screenshots && project.metadata.screenshots.length > 0);

    if (hasExistingContent) {
      toast.error(t('toast.cannotChangeType'));
      return;
    }

    // Update project type
    updateProject(project.id, {
      projectType: selectedRecordingType,
      status: 'recording',
    });

    // Navigate to appropriate page
    if (selectedRecordingType === 'video-recording') {
      navigate('/recording', {
        state: {
          projectId: project.id,
          projectName: project.name
        }
      });
    } else {
      navigate('/interactive-screenshots', {
        state: {
          projectId: project.id,
          projectName: project.name
        }
      });
    }

    onClose();
  };

  const handleRetakeScreenshots = async () => {
    // Determine navigation based on existing content type
    const hasRecordings = project.recordings && project.recordings.length > 0;
    const hasScreenshots = project.metadata?.screenshots && project.metadata.screenshots.length > 0;

    if (hasRecordings) {
      // For video projects: Clear all existing data before retaking
      try {
        // Delete project files (recordings, screenshots, diagrams)
        if (window.electronAPI?.deleteProjectFiles) {
          await window.electronAPI.deleteProjectFiles(project.name);
          toast.success(t('toast.projectFilesCleared'));
        }

        // Clear project data in store
        updateProject(project.id, {
          recordings: [],
          metadata: {
            ...project.metadata,
            screenshots: [],
            documentationSteps: []
          },
          status: 'recording'
        });

        // Navigate to video recording page
        navigate('/recording', {
          state: {
            projectId: project.id,
            projectName: project.name,
            isRetake: true
          }
        });
      } catch (error) {
        console.error('Error clearing project files:', error);
        toast.error(t('toast.clearFilesFailed'));
        return;
      }
    } else if (hasScreenshots) {
      // For screenshot projects: just update status
      updateProject(project.id, {
        status: 'recording',
      });

      // Navigate to interactive screenshots page
      navigate('/interactive-screenshots', {
        state: {
          projectId: project.id,
          projectName: project.name
        }
      });
    }

    onClose();
  };

  const handleGoToEdit = () => {
    // Set current project and navigate to editing page
    const { setCurrentProject } = useAppStore.getState();
    setCurrentProject(project);

    // Navigate with appropriate state based on project type
    const navigationState: any = {
      projectId: project.id,
      fromProjectPage: true
    };

    // If project has screenshots, include them
    if (project.metadata?.screenshots && project.metadata.screenshots.length > 0) {
      navigationState.screenshots = project.metadata.screenshots;
      navigationState.fromInteractiveCapture = true;
    }

    // If project has recordings, include the first one
    if (project.recordings && project.recordings.length > 0) {
      const recording = project.recordings[0];
      navigationState.recordingId = recording.id;
      navigationState.videoFilePath = recording.filePath;
      navigationState.duration = recording.duration;
      navigationState.bookmarks = recording.bookmarks || [];
    }

    navigate('/editing', { state: navigationState });
    onClose();
  };

  const handleExportProject = () => {
    // Set current project and navigate to export page
    const { setCurrentProject } = useAppStore.getState();
    setCurrentProject(project);

    navigate('/export', {
      state: {
        projectId: project.id,
        fromProjectPage: true
      }
    });
    onClose();
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasContent = (project.recordings && project.recordings.length > 0) ||
                     (project.metadata?.screenshots && project.metadata.screenshots.length > 0);

  // Onboarding hints — declared before the early return to satisfy rules of hooks
  const hintsSuppressed = useHintsSuppressed();
  const editStepsRef = useRef<HTMLButtonElement | null>(null);
  const exportBtnRef = useRef<HTMLButtonElement | null>(null);
  const retakeBtnRef = useRef<HTMLButtonElement | null>(null);
  const saveVersionBtnRef = useRef<HTMLButtonElement | null>(null);
  const addNoteBtnRef = useRef<HTMLButtonElement | null>(null);

  const [editStepsReady, setEditStepsReady] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [retakeReady, setRetakeReady] = useState(false);
  const [saveVersionReady, setSaveVersionReady] = useState(false);
  const [addNoteReady, setAddNoteReady] = useState(false);

  const assignEditStepsRef = useCallback((node: HTMLButtonElement | null) => {
    editStepsRef.current = node;
    setEditStepsReady(!!node);
  }, []);
  const assignExportBtnRef = useCallback((node: HTMLButtonElement | null) => {
    exportBtnRef.current = node;
    setExportReady(!!node);
  }, []);
  const assignRetakeBtnRef = useCallback((node: HTMLButtonElement | null) => {
    retakeBtnRef.current = node;
    setRetakeReady(!!node);
  }, []);
  const assignSaveVersionRef = useCallback((node: HTMLButtonElement | null) => {
    saveVersionBtnRef.current = node;
    setSaveVersionReady(!!node);
  }, []);
  const assignAddNoteRef = useCallback((node: HTMLButtonElement | null) => {
    addNoteBtnRef.current = node;
    setAddNoteReady(!!node);
  }, []);

  const editStepsHint = useOnboardingHint('projectModal.editSteps', { priority: 100, when: isOpen && hasContent });
  const exportHint = useOnboardingHint('projectModal.export', { priority: 90, when: isOpen && hasContent });
  const retakeHint = useOnboardingHint('projectModal.retake', { priority: 80, when: isOpen && hasContent });
  const saveVersionHint = useOnboardingHint('projectModal.saveVersion', { priority: 70, when: isOpen && hasContent && !isSavingVersion });
  const addNoteHint = useOnboardingHint('projectModal.addNote', { priority: 60, when: isOpen && hasContent && rightTab === 'notes' && !showAddNote });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className={cn(
        "bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-900 rounded-lg w-full max-h-[85vh] overflow-hidden shadow-2xl border-2 border-blue-200 dark:border-slate-700",
        hasContent ? "max-w-3xl" : "max-w-xl"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-slate-700/80 bg-white/50 dark:bg-slate-900/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {project.name}
            </h2>
            <p className="text-xs text-gray-600 dark:text-slate-300 mt-0.5">
              {project.description || t('noDescription')}
            </p>
          </div>
          <div className="flex items-center gap-1">
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
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-slate-300" />
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* NEW PROJECT MODE — Recording type selection is the focus      */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {!hasContent ? (
          <div className="p-4 overflow-y-auto max-h-[calc(85vh-120px)]">
            {/* Heading */}
            <div className="text-center mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('newProject.heading')}</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                {t('newProject.subtitle')}
              </p>
            </div>

            {/* Two capture mode cards side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Video Recording card */}
              <button
                onClick={() => setSelectedRecordingType('video-recording')}
                className={cn(
                  "relative p-4 rounded-xl border-2 transition-all text-left group",
                  selectedRecordingType === 'video-recording'
                    ? "border-blue-500 bg-blue-50/80 dark:bg-blue-900/20 ring-1 ring-blue-500/30"
                    : "border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
                )}
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    selectedRecordingType === 'video-recording'
                      ? "bg-blue-500 text-white"
                      : "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                  )}>
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('newProject.videoTitle')}</div>
                </div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1.5">
                  {t('newProject.videoDesc')}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {t('newProject.videoBestFor')}
                </p>
                {selectedRecordingType === 'video-recording' && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                )}
              </button>

              {/* Step-by-Step Screenshots card */}
              <button
                onClick={() => setSelectedRecordingType('interactive-screenshots')}
                className={cn(
                  "relative p-4 rounded-xl border-2 transition-all text-left group",
                  selectedRecordingType === 'interactive-screenshots'
                    ? "border-green-500 bg-green-50/80 dark:bg-green-900/20 ring-1 ring-green-500/30"
                    : "border-gray-200 dark:border-slate-600 hover:border-green-300 dark:hover:border-green-500 hover:bg-green-50/40 dark:hover:bg-green-900/10"
                )}
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    selectedRecordingType === 'interactive-screenshots'
                      ? "bg-green-500 text-white"
                      : "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                  )}>
                    <MousePointer className="w-4 h-4" />
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('newProject.screenshotsTitle')}</div>
                </div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1.5">
                  {t('newProject.screenshotsDesc')}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {t('newProject.screenshotsBestFor')}
                </p>
                {selectedRecordingType === 'interactive-screenshots' && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                )}
              </button>
            </div>

            {/* Start capturing button */}
            <button
              onClick={handleStartRecording}
              disabled={!selectedRecordingType}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                selectedRecordingType
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow"
                  : "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed"
              )}
            >
              <Play className="w-4 h-4" />
              {selectedRecordingType === 'interactive-screenshots' ? t('newProject.startCapturing') : t('newProject.startRecording')}
            </button>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════════ */
          /* EXISTING PROJECT MODE — Actions + Notes/Versions              */
          /* ═══════════════════════════════════════════════════════════════ */
          <>
            {/* Security Notice */}
            {notesEncryptionService.isEncryptionAvailable() && (
              <div className="px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2 text-xs text-green-800 dark:text-green-300">
                  <AlertCircle className="w-3 h-3" />
                  <span>{t('security.notesEncrypted')}</span>
                </div>
              </div>
            )}

            {/* Project summary bar */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-gray-100 dark:border-slate-700/50 text-xs text-gray-500 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-xs font-medium",
                  project.status === 'completed' && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
                  project.status === 'recording' && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
                  project.status === 'editing' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
                  project.status === 'draft' && "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                )}>
                  {t(`status.${project.status}`)}
                </span>
              </div>
              <span className="text-gray-300 dark:text-slate-600">|</span>
              <div className="flex items-center gap-1">
                {project.projectType === 'video-recording' ? (
                  <><Video className="w-3 h-3" /><span>{t('summary.videoRecording')}</span></>
                ) : (
                  <><Camera className="w-3 h-3" /><span>{t('summary.screenshots')}</span></>
                )}
              </div>
              <span className="text-gray-300 dark:text-slate-600">|</span>
              <span>{t('summary.recordings', { count: project.recordings?.length || 0 })}</span>
              <span className="text-gray-300 dark:text-slate-600">|</span>
              <span>{t('summary.screenshotsCount', { count: project.metadata?.screenshots?.length || 0 })}</span>
              <span className="text-gray-300 dark:text-slate-600">|</span>
              <span>{t('summary.updated', { date: formatDateTime(project.updatedAt) })}</span>
            </div>

            {/* Action buttons row */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-700/50">
              {/* Primary action: Edit */}
              <button
                ref={assignEditStepsRef}
                onClick={handleGoToEdit}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <Edit3 className="w-4 h-4" />
                {t('actions.editSteps')}
              </button>
              {/* Secondary: Export */}
              <button
                ref={assignExportBtnRef}
                onClick={handleExportProject}
                className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                {t('actions.export')}
              </button>
              {/* Tertiary: Retake */}
              <button
                ref={assignRetakeBtnRef}
                onClick={handleRetakeScreenshots}
                className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{(project.recordings && project.recordings.length > 0) ? t('actions.retake') : t('actions.addMore')}</span>
              </button>
              {/* Tertiary: Save Version */}
              <button
                ref={assignSaveVersionRef}
                onClick={handleSaveVersion}
                disabled={isSavingVersion}
                className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                title={t('actions.saveVersionTitle')}
              >
                <History className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isSavingVersion ? t('saving') : t('actions.saveVersion')}</span>
              </button>
            </div>

            {/* Tabbed content: Notes / Versions */}
            <div className="p-3 overflow-y-auto max-h-[calc(85vh-240px)]">
              {/* Tab Buttons */}
              <div className="flex border-b border-gray-200 dark:border-slate-700/60 mb-3">
                <button
                  onClick={() => setRightTab('notes')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors",
                    rightTab === 'notes'
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {t('tabs.notes', { count: notes.length })}
                </button>
                <button
                  onClick={() => setRightTab('versions')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors",
                    rightTab === 'versions'
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                  )}
                >
                  <History className="w-3.5 h-3.5" />
                  {t('tabs.versions', { count: versions.length })}
                </button>
              </div>

              {/* Notes Tab */}
              {rightTab === 'notes' && (
                <div className="space-y-3">
                  {/* Add note form */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('notes.title')}</h3>
                    {!showAddNote && (
                      <button
                        ref={assignAddNoteRef}
                        onClick={() => setShowAddNote(true)}
                        className="flex items-center space-x-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('notes.add')}</span>
                      </button>
                    )}
                  </div>

                  {showAddNote && (
                    <div className="space-y-2 bg-gray-50 dark:bg-slate-900/80 rounded-lg p-2.5 border border-gray-200 dark:border-slate-700/60">
                      <textarea
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder={t('notes.placeholder')}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white text-xs min-h-[80px] resize-y"
                      />
                      <div className="flex space-x-1.5">
                        <button
                          onClick={handleAddNote}
                          disabled={isSaving}
                          className="flex items-center space-x-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Save className="w-3 h-3" />
                          <span>{isSaving ? t('saving') : t('save')}</span>
                        </button>
                        <button
                          onClick={() => {
                            setShowAddNote(false);
                            setNewNoteContent('');
                          }}
                          className="px-2 py-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Notes list */}
                  {isLoadingNotes ? (
                    <div className="text-center py-4">
                      <div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">{t('notes.loading')}</p>
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 dark:bg-slate-900/80 rounded-lg border border-gray-200 dark:border-slate-700/60">
                      <FileText className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
                      <p className="text-xs text-gray-600 dark:text-slate-300">{t('notes.emptyTitle')}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{t('notes.emptySubtitle')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2.5 border-l-4 border-yellow-400 dark:border-yellow-600"
                        >
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-center space-x-1.5 text-xs text-gray-600 dark:text-gray-400">
                              <User className="w-3 h-3" />
                              <span className="font-medium">{note.author.name}</span>
                            </div>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              disabled={isSaving}
                              className="p-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-xs text-gray-900 dark:text-white mb-1.5 whitespace-pre-wrap break-words">
                            {note.content}
                          </p>
                          <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-500">
                            <div className="flex items-center space-x-0.5">
                              <Clock className="w-3 h-3" />
                              <span className="text-xs">{formatDateTime(note.createdAt)}</span>
                            </div>
                            {note.isEncrypted && (
                              <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs">
                                {t('notes.encrypted')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Versions Tab */}
              {rightTab === 'versions' && (
                <>
                  {versions.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 dark:bg-slate-900/80 rounded-lg border border-gray-200 dark:border-slate-700/60">
                      <History className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
                      <p className="text-xs text-gray-600 dark:text-slate-300">{t('versions.emptyTitle')}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        {t('versions.emptySubtitle')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {versions.map((version) => (
                        <div
                          key={version.id}
                          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 border-l-4 border-blue-400 dark:border-blue-600"
                        >
                          {/* Version header */}
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                v{version.versionNumber}
                              </span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-xs font-medium",
                                version.trigger === 'manual-export'
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                  : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                              )}>
                                {version.trigger === 'manual-export' ? t('versions.triggerExport') : t('versions.triggerBackup')}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {versionService.formatFileSize(version.fileSize)}
                            </span>
                          </div>

                          {/* Version details */}
                          <div className="flex items-center gap-3 mb-2 text-xs text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-0.5" title={t('versions.hintSteps')}>
                              <Layers className="w-3 h-3" />
                              <span>{version.stepCount}</span>
                            </div>
                            <div className="flex items-center gap-0.5" title={t('versions.hintScreenshots')}>
                              <Image className="w-3 h-3" />
                              <span>{version.screenshotCount}</span>
                            </div>
                            <div className="flex items-center gap-0.5" title={t('versions.hintRecordings')}>
                              <Video className="w-3 h-3" />
                              <span>{version.recordingCount}</span>
                            </div>
                          </div>

                          {/* Timestamp and author */}
                          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-500">
                            <div className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{formatDateTime(version.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <User className="w-3 h-3" />
                              <span>{version.createdBy.name}</span>
                            </div>
                          </div>

                          {/* Confirm restore dialog */}
                          {confirmRestoreVersionId === version.id && (
                            <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <p className="text-xs text-amber-800 dark:text-amber-300 mb-1.5">
                                {t('versions.restorePrompt', { n: version.versionNumber })}
                              </p>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleRestoreVersion(version.id)}
                                  disabled={isRestoring}
                                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                  {isRestoring ? t('versions.restoring') : t('versions.confirmRestore')}
                                </button>
                                <button
                                  onClick={() => setConfirmRestoreVersionId(null)}
                                  className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-white rounded text-xs font-medium transition-colors"
                                >
                                  {t('cancel')}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Confirm delete dialog */}
                          {confirmDeleteVersionId === version.id && (
                            <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                              <p className="text-xs text-red-800 dark:text-red-300 mb-1.5">
                                {t('versions.deletePrompt', { n: version.versionNumber })}
                              </p>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleDeleteVersion(version.id)}
                                  className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                                >
                                  {t('delete')}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteVersionId(null)}
                                  className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-white rounded text-xs font-medium transition-colors"
                                >
                                  {t('cancel')}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Action buttons */}
                          {confirmRestoreVersionId !== version.id && confirmDeleteVersionId !== version.id && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setConfirmRestoreVersionId(version.id)}
                                disabled={isRestoring}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                                title={t('versions.restoreThis')}
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{t('versions.restore')}</span>
                              </button>
                              <button
                                onClick={() => handleShowVersionInFolder(version.filePath)}
                                className="flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 text-gray-700 dark:text-white rounded text-xs font-medium transition-colors"
                                title={t('versions.showInFolder')}
                              >
                                <FolderOpen className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteVersionId(version.id)}
                                className="flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs font-medium transition-colors"
                                title={t('versions.deleteThis')}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 p-3 border-t border-gray-200 dark:border-slate-700/80 bg-white/50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>

      {/* Onboarding coach marks */}
      {editStepsHint.visible && editStepsReady && (
        <CoachMark
          anchorRef={editStepsRef}
          title={t('coach.editStepsTitle')}
          description={t('coach.editStepsDesc')}
          placement="bottom"
          onDismiss={editStepsHint.dismiss}
        />
      )}
      {exportHint.visible && exportReady && (
        <CoachMark
          anchorRef={exportBtnRef}
          title={t('coach.exportTitle')}
          description={t('coach.exportDesc')}
          placement="bottom"
          onDismiss={exportHint.dismiss}
        />
      )}
      {retakeHint.visible && retakeReady && (
        <CoachMark
          anchorRef={retakeBtnRef}
          title={t('coach.retakeTitle')}
          description={t('coach.retakeDesc')}
          placement="bottom"
          onDismiss={retakeHint.dismiss}
        />
      )}
      {saveVersionHint.visible && saveVersionReady && (
        <CoachMark
          anchorRef={saveVersionBtnRef}
          title={t('coach.saveVersionTitle')}
          description={t('coach.saveVersionDesc')}
          placement="bottom"
          onDismiss={saveVersionHint.dismiss}
        />
      )}
      {addNoteHint.visible && addNoteReady && (
        <CoachMark
          anchorRef={addNoteBtnRef}
          title={t('coach.addNoteTitle')}
          description={t('coach.addNoteDesc')}
          placement="left"
          onDismiss={addNoteHint.dismiss}
        />
      )}
    </div>
  );
};

export default ProjectPageModal;
