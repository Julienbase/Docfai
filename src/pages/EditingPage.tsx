import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Scissors,
  Copy,
  Trash2,
  Plus,
  Edit3,
  Save,
  ArrowLeft,
  FileText,
  Download,
  Eye,
  EyeOff,
  MousePointer,
  Keyboard,
  Layers,
  Camera,
  Video,
  Palette,
  GripVertical,
  Settings,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Bookmark,
  RefreshCw,
  CheckSquare,
  Square,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppStore, DocumentationStep } from '../store/useAppStore';
import { UserAction } from '../types/documentation';

type ActionType = UserAction['type'];
import { cn, getProjectFileUrl, getProjectFileAsDataUrl } from '../lib/utils';
import ImageEditor from '../components/ImageEditor';
import CoachMark from '../components/CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';
import VideoEditor, { VideoEditorHandle } from '../components/VideoEditor';
// REMOVED: import DiagramEditor from '../components/DiagramEditor';
import FlowDiagramEditor from '../components/FlowDiagramEditor';
import PreviewPanel from '../components/PreviewPanel';
import QuickTemplateStrip from '../components/QuickTemplateStrip';
import { getAllTemplates, saveTemplateSettings, loadTemplateSettings, getTemplateCustomization, applyCustomization, getDefaultCustomization } from '../templates/registry';
import type { DocumentTemplate, TemplateCustomization } from '../templates/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('EditingPage');


interface TimelineSegment {
  id: string;
  startTime: number;
  endTime: number;
  type: 'action' | 'pause' | 'highlight';
  description?: string;
  actionType?: 'click' | 'type' | 'scroll' | 'key';
}





const EditingPage: React.FC = () => {
  const { t } = useTranslation('editingPage');
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentProject,
    currentRecording,
    recordings,
    projects,
    updateRecording,
    updateProject,
    setCurrentRecording,
    setCurrentProject,
    settings
  } = useAppStore();
  
  // Get navigation state
  const videoFilePath = location.state?.videoFilePath;
  const recordingId = location.state?.recordingId;
  const recordingDuration = location.state?.duration;
  const navigationBookmarks = location.state?.bookmarks;
  const navigationScreenshots = location.state?.screenshots;
  const fromInteractiveCapture = location.state?.fromInteractiveCapture;
  const fromProjectPage = location.state?.fromProjectPage;
  // Determine fromUpload with multiple fallbacks for robustness
  const fromUpload = location.state?.fromUpload ||
                     currentRecording?.source === 'upload' ||
                     (currentRecording?.filePath &&
                      (currentRecording.filePath.includes('uploads') || currentRecording.filePath.includes('upload')));
  const projectId = location.state?.projectId;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>([]);
  const [documentationSteps, setDocumentationSteps] = useState<DocumentationStep[]>([]);
  const [showActions, setShowActions] = useState(true);
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
  const [sceneDetectionProgress, setSceneDetectionProgress] = useState<{
    stage: string; progress: number; message: string;
  } | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);

  const [editingScreenshot, setEditingScreenshot] = useState<{id: string, imageData: string} | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showFlowEditor, setShowFlowEditor] = useState(false);
  const [editingFlow, setEditingFlow] = useState<DocumentationStep | null>(null);
  const [secureScreenshotUrls, setSecureScreenshotUrls] = useState<Record<string, string>>({});
  const [secureDiagramUrls, setSecureDiagramUrls] = useState<Record<string, string>>({}); // Keep for backward compatibility with existing projects
  const [draggedStep, setDraggedStep] = useState<string | null>(null);
  const [dragOverStep, setDragOverStep] = useState<string | null>(null);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null); // For video step preview
  const [secureVideoUrls, setSecureVideoUrls] = useState<Record<string, string>>({}); // Cached video URLs
  const fileInputRef = useRef<HTMLInputElement>(null); // For media file picker
  const [retakingStepId, setRetakingStepId] = useState<string | null>(null);
  const [retakeSources, setRetakeSources] = useState<Array<{ id: string; name: string; thumbnail: string }>>([]);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set());
  const [justSavedStep, setJustSavedStep] = useState(false);
  const [projectTitle, setProjectTitle] = useState(currentProject?.metadata?.projectTitle || currentRecording?.metadata?.projectTitle || currentProject?.name || currentRecording?.name || 'Step-by-Step Screenshots');
  const [projectSource, setProjectSource] = useState(currentProject?.metadata?.projectSource || currentRecording?.metadata?.projectSource || '');
  
  // Sidebar and layout state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    timeline: false,
    documentation: false
  });
  
  // State for editing workflow
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [showStepEditor, setShowStepEditor] = useState(false);
  const [exportMode, setExportMode] = useState<'video' | 'guide'>('guide');

  // View mode toggle: 'edit' for screenshot view, 'preview' for live document preview
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateCustomization, setTemplateCustomization] = useState<TemplateCustomization | null>(null);

  // Onboarding: coach marks for key editing controls (one at a time, highest priority first)
  const hintsSuppressed = useHintsSuppressed();
  const firstEditButtonRef = useRef<HTMLButtonElement | null>(null);
  const editHint = useOnboardingHint('editing.editStepButton', { priority: 100, when: !showImageEditor });
  const [editHintAnchorReady, setEditHintAnchorReady] = useState(false);
  const assignFirstEditButtonRef = useCallback((el: HTMLButtonElement | null) => {
    firstEditButtonRef.current = el;
    if (el) setEditHintAnchorReady(true);
  }, []);

  const firstReplaceButtonRef = useRef<HTMLButtonElement | null>(null);
  const replaceHint = useOnboardingHint('editing.replaceImage', { priority: 90, when: !showImageEditor });
  const [replaceHintAnchorReady, setReplaceHintAnchorReady] = useState(false);
  const assignFirstReplaceButtonRef = useCallback((el: HTMLButtonElement | null) => {
    firstReplaceButtonRef.current = el;
    if (el) setReplaceHintAnchorReady(true);
  }, []);

  const firstDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteHint = useOnboardingHint('editing.deleteStep', { priority: 80, when: !showImageEditor });
  const [deleteHintAnchorReady, setDeleteHintAnchorReady] = useState(false);
  const assignFirstDeleteButtonRef = useCallback((el: HTMLButtonElement | null) => {
    firstDeleteButtonRef.current = el;
    if (el) setDeleteHintAnchorReady(true);
  }, []);

  const firstOrderButtonRef = useRef<HTMLButtonElement | null>(null);
  const orderHint = useOnboardingHint('editing.reorderSteps', { priority: 70, when: !showImageEditor && (documentationSteps?.length ?? 0) >= 2 });
  const [orderHintAnchorReady, setOrderHintAnchorReady] = useState(false);
  const assignFirstOrderButtonRef = useCallback((el: HTMLButtonElement | null) => {
    firstOrderButtonRef.current = el;
    if (el) setOrderHintAnchorReady(true);
  }, []);

  const templateStripRef = useRef<HTMLElement | null>(null);
  const templateHint = useOnboardingHint('editing.templateSelection', { priority: 60, when: !showImageEditor && viewMode === 'preview' });
  const [templateHintAnchorReady, setTemplateHintAnchorReady] = useState(false);
  const assignTemplateStripRef = useCallback((el: HTMLDivElement | null) => {
    templateStripRef.current = el;
    if (el) setTemplateHintAnchorReady(true);
  }, []);

  const workflowButtonRef = useRef<HTMLButtonElement | null>(null);
  const workflowHint = useOnboardingHint('editing.workflowDiagram', { priority: 50, when: !showImageEditor && (documentationSteps?.filter(s => s.type !== 'diagram').length ?? 0) >= 2 });
  const [workflowHintAnchorReady, setWorkflowHintAnchorReady] = useState(false);
  const assignWorkflowButtonRef = useCallback((el: HTMLButtonElement | null) => {
    workflowButtonRef.current = el;
    if (el) setWorkflowHintAnchorReady(true);
  }, []);

  const diagramButtonRef = useRef<HTMLButtonElement | null>(null);
  const diagramHint = useOnboardingHint('editing.addDiagram', { priority: 40, when: !showImageEditor });
  const [diagramHintAnchorReady, setDiagramHintAnchorReady] = useState(false);
  const assignDiagramButtonRef = useCallback((el: HTMLButtonElement | null) => {
    diagramButtonRef.current = el;
    if (el) setDiagramHintAnchorReady(true);
  }, []);

  // Resolve template object from ID, with customization applied
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    const templates = getAllTemplates();
    const base = templates.find(t => t.id === selectedTemplateId) || null;
    if (base && templateCustomization) {
      return applyCustomization(base, templateCustomization);
    }
    return base;
  }, [selectedTemplateId, templateCustomization]);
  
  // Helper function to toggle collapsed sections
  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoEditorRef = useRef<VideoEditorHandle>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isLoadingScreenshotsRef = useRef(false);
  const hasMountedRef = useRef(false);
  // Ref-based cache for saved screenshot images — immune to React batching/timing issues.
  // Set synchronously in handleSaveEditedScreenshot, read in thumbnail render as primary fallback.
  const savedScreenshotCacheRef = useRef<Record<string, string>>({});
  
  // Get screenshots from current project or navigation state
  const [screenshots, setScreenshots] = useState(() => {
    // Initialize with navigation screenshots if coming from interactive capture
    if (fromInteractiveCapture && navigationScreenshots && navigationScreenshots.length > 0) {
      return navigationScreenshots;
    }
    return currentProject?.metadata?.screenshots || [];
  });
  
  // Determine project type for different editing modes
  const projectType = currentProject?.projectType || (currentRecording?.filePath ? 'video' : 'interactive-screenshots');
  const isVideoProject = projectType === 'video' || !!currentRecording?.filePath;
  const isInteractiveScreenshots = projectType === 'interactive-screenshots';
  
  // Track when we're manually reordering to avoid conflicts
  const isReorderingRef = useRef(false);
  // Track when bulk deleting to prevent sync effects from repopulating steps
  const isBulkDeletingRef = useRef(false);

  // Preview data for live document preview mode
  const previewData = useMemo(() => ({
    title: projectTitle,
    description: projectSource ? `Source: ${projectSource}` : undefined,
    steps: (documentationSteps || []).map((step: DocumentationStep, index: number) => {
      const screenshot = screenshots?.find((s: any) => s.id === step.id);
      const imageUrl = screenshot ? (secureScreenshotUrls[screenshot.id] || screenshot.imageData) : undefined;
      return {
        id: step.id,
        title: step.title || `Step ${index + 1}`,
        description: step.description || '',
        screenshot: imageUrl || undefined,
        timestamp: step.timestamp || 0,
        mediaType: step.mediaType,
        videoClipPath: step.videoClipPath,
        videoClipUrl: step.mediaType === 'video' ? secureVideoUrls[step.id] : undefined,
        type: step.type,
        diagramImagePath: step.diagramImagePath,
        diagramUrl: step.type === 'diagram' ? secureDiagramUrls[step.id] : undefined,
      };
    }),
    metadata: {
      totalSteps: (documentationSteps || []).length,
      duration: duration || undefined
    }
  }), [projectTitle, projectSource, documentationSteps, screenshots, secureScreenshotUrls, secureVideoUrls, secureDiagramUrls, duration]);

  // Load saved template selection and customization on mount
  useEffect(() => {
    const loadSavedTemplate = async () => {
      const settings = await loadTemplateSettings();
      if (settings?.selectedTemplateId) {
        setSelectedTemplateId(settings.selectedTemplateId);
        const customization = await getTemplateCustomization(settings.selectedTemplateId);
        if (customization) {
          setTemplateCustomization(customization);
        }
      }
    };
    loadSavedTemplate();
  }, []);

  // Calculate unified steps for export button count and other uses
  const unifiedSteps = useMemo(() => {
    if (!isInteractiveScreenshots) {
      return [];
    }
    
    const steps = [];
    const processedIds = new Set();
    
    // Create a map of documentation steps by ID for efficient lookup
    const docStepMap = new Map();
    documentationSteps?.forEach(docStep => {
      docStepMap.set(docStep.id, docStep);
    });
    
    // Process all screenshots and their matching documentation steps
    screenshots?.forEach((screenshot, index) => {
      const docStep = docStepMap.get(screenshot.id);
      steps.push({
        screenshot,
        docStep,
        index,
        type: 'screenshot'
      });
      processedIds.add(screenshot.id);
    });
    
    // Add any remaining documentation steps (like diagrams) that don't have matching screenshots
    documentationSteps?.forEach((docStep) => {
      if (!processedIds.has(docStep.id)) {
        steps.push({
          screenshot: null,
          docStep,
          index: steps.length,
          type: 'docStep'
        });
        processedIds.add(docStep.id);
      }
    });
    
    return steps;
  }, [isInteractiveScreenshots, screenshots, documentationSteps]);
  
  // Helper function to safely get screenshot URL using secure IPC
  const getSecureScreenshotUrl = async (screenshot: any, projectName: string): Promise<string | null> => {
    // Priority 1: Use edited imageData if it exists (base64 format)
    if (screenshot.imageData && screenshot.imageData.startsWith('data:')) {
      return screenshot.imageData;
    }
    
    // Priority 2: Use secure IPC method for file-based screenshots
    if (screenshot.filePath && typeof screenshot.filePath === 'string') {
      const fileName = screenshot.filePath.split(/[\/\\]/).pop();
      if (fileName) {
        try {
          const dataUrl = await getProjectFileAsDataUrl(projectName, 'step_by_step_screenshots', fileName);
          return dataUrl;
        } catch (error) {
          logger.error('Failed to get secure screenshot URL:', error);
        }
      }
    }
    
    // Priority 3: Fallback to original imageData
    if (screenshot.imageData) {
      return screenshot.imageData;
    }
    
    return null;
  };

  // Helper function to safely get diagram URL using secure IPC
  const getSecureDiagramUrl = async (diagramImagePath: string, projectName: string): Promise<string | null> => {
    logger.log('🔍 Getting secure diagram URL for:', { diagramImagePath, projectName });

    if (!diagramImagePath || !projectName) {
      logger.warn('⚠️ Missing required parameters for diagram URL:', { diagramImagePath, projectName });
      return null;
    }

    // Extract filename from the full path
    let fileName = diagramImagePath.split(/[\/\\]/).pop();
    if (!fileName) {
      logger.warn('⚠️ Could not extract filename from diagram path:', diagramImagePath);
      return null;
    }

    // Strip query parameters (like ?t=timestamp cache busters)
    fileName = fileName.split('?')[0];

    logger.log('📁 Extracted filename:', fileName);

    try {
      logger.log('🔄 Attempting to get project file as data URL...');
      const dataUrl = await getProjectFileAsDataUrl(projectName, 'diagrams', fileName);

      if (dataUrl) {
        logger.log('✅ Successfully got diagram URL, length:', dataUrl.length);
        return dataUrl;
      } else {
        logger.warn('⚠️ getProjectFileAsDataUrl returned null/empty for:', fileName);
        return null;
      }
    } catch (error) {
      logger.error('❌ Failed to get secure diagram URL:', {
        error,
        fileName,
        projectName,
        diagramImagePath,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      return null;
    }
  };

  // Function to load secure URLs for all screenshots - with null safety
  const loadSecureScreenshotUrls = async () => {
    if (!screenshots?.length || !currentProject?.name) {
      return;
    }

    logger.log('📸 Loading secure URLs for', screenshots.length, 'screenshots');

    // Process screenshots in parallel for better performance
    const urlPromises = screenshots.map(async (screenshot) => {
      try {
        const secureUrl = await getSecureScreenshotUrl(screenshot, currentProject.name);
        return { id: screenshot.id, url: secureUrl, success: !!secureUrl };
      } catch (error) {
        logger.error('❌ Error loading screenshot URL for:', screenshot.id, error);
        return { id: screenshot.id, url: null, success: false };
      }
    });

    const results = await Promise.all(urlPromises);

    const urlMap: Record<string, string> = {};
    let successCount = 0;
    let failureCount = 0;

    results.forEach(result => {
      if (result.success && result.url) {
        urlMap[result.id] = result.url;
        successCount++;
      } else {
        failureCount++;
      }
    });

    logger.log('📊 Screenshot URL loading complete:', {
      total: screenshots.length,
      success: successCount,
      failures: failureCount
    });

    setSecureScreenshotUrls(prev => ({ ...prev, ...urlMap }));
  };

  // Function to load secure URLs for all diagrams
  const loadSecureDiagramUrls = async () => {
    logger.log('🔄 Loading secure diagram URLs...');
    
    if (!documentationSteps || !currentProject) {
      logger.warn('⚠️ Cannot load diagram URLs - missing dependencies:', {
        hasDocumentationSteps: !!documentationSteps,
        hasCurrentProject: !!currentProject,
        documentationStepsLength: documentationSteps?.length || 0
      });
      return;
    }
    
    const diagramSteps = documentationSteps.filter(step => step.type === 'diagram' && step.diagramImagePath);
    logger.log('📊 Found diagram steps to process:', diagramSteps.length);
    
    if (diagramSteps.length === 0) {
      logger.log('📝 No diagram steps found, clearing diagram URLs');
      setSecureDiagramUrls({});
      return;
    }
    
    const urlMap: Record<string, string> = {};
    let successCount = 0;
    let failureCount = 0;
    
    for (const step of diagramSteps) {
      logger.log('🔍 Processing diagram step:', {
        id: step.id,
        title: step.title,
        diagramImagePath: step.diagramImagePath
      });
      
      try {
        const secureUrl = await getSecureDiagramUrl(step.diagramImagePath, currentProject.name);
        if (secureUrl) {
          urlMap[step.id] = secureUrl;
          successCount++;
          logger.log('✅ Successfully loaded URL for diagram:', step.id);
        } else {
          failureCount++;
          logger.warn('⚠️ Failed to get URL for diagram:', step.id);
        }
      } catch (error) {
        failureCount++;
        logger.error('❌ Error loading diagram URL for step:', step.id, error);
      }
    }
    
    logger.log('📊 Diagram URL loading complete:', {
      total: diagramSteps.length,
      success: successCount,
      failures: failureCount,
      urlMapKeys: Object.keys(urlMap)
    });
    
    setSecureDiagramUrls(urlMap);
  };

  // Function to load secure URLs for all video steps on mount
  const loadSecureVideoUrls = async () => {
    if (!documentationSteps || !currentProject) return;

    const videoSteps = documentationSteps.filter(
      step => step.mediaType === 'video' && step.videoClipPath
    );

    if (videoSteps.length === 0) return;

    const urlMap: Record<string, string> = {};
    for (const step of videoSteps) {
      try {
        const videoUrl = await getSecureVideoUrl(step.videoClipPath!);
        if (videoUrl) {
          urlMap[step.id] = videoUrl;
        }
      } catch (error) {
        logger.warn('Failed to load video URL for step:', step.id, error);
      }
    }

    if (Object.keys(urlMap).length > 0) {
      setSecureVideoUrls(prev => ({ ...prev, ...urlMap }));
    }
  };

  // Function to scan for existing diagram files and add them to documentationSteps
  const loadExistingDiagrams = async () => {
    if (!currentProject || !window.electronAPI?.listProjectFiles) return;
    
    try {
      logger.log('🔍 Scanning for existing diagrams in project:', currentProject.name);
      
      // Get list of files in the diagrams folder
      const diagramFiles = await window.electronAPI.listProjectFiles(currentProject.name, 'diagrams');
      logger.log('📁 Found diagram files:', diagramFiles);
      
      if (!diagramFiles || diagramFiles.length === 0) {
        logger.log('📁 No existing diagram files found');
        return;
      }
      
      // Filter for PNG files (diagram images)
      const pngFiles = diagramFiles.filter(file => !file.isDirectory && file.name.endsWith('.png'));
      logger.log('🖼️ Found PNG diagram files:', pngFiles);
      
      if (pngFiles.length === 0) {
        logger.log('🖼️ No PNG diagram files found');
        return;
      }
      
      // Get current documentationSteps to avoid duplicates (use local state first)
      const currentSteps = documentationSteps.length > 0 ? documentationSteps : (currentProject.metadata?.documentationSteps || []);
      const existingDiagramIds = new Set(currentSteps.filter(step => step.type === 'diagram').map(step => step.id));
      
      logger.log('📊 Current documentation steps count:', currentSteps.length);
      logger.log('📊 Existing diagram IDs:', Array.from(existingDiagramIds));
      
      // Create documentation steps for diagrams that don't already exist
      const newDiagramSteps: DocumentationStep[] = [];
      
      for (const pngFile of pngFiles) {
        // Extract step number from filename (e.g., "step-1.png" -> "step-1")
        const stepId = pngFile.name.replace('.png', '');
        
        // Skip if this diagram already exists in documentationSteps
        if (existingDiagramIds.has(stepId)) {
          logger.log('⏭️ Skipping existing diagram:', stepId);
          continue;
        }
        
        // Check if corresponding JSON file exists
        const jsonFile = pngFile.name.replace('.png', '.json');
        const hasJsonFile = diagramFiles.some(file => file.name === jsonFile);
        
        if (!hasJsonFile) {
          logger.warn('⚠️ No JSON file found for diagram:', pngFile.name);
          continue;
        }
        
        // Extract step number for title
        const stepMatch = stepId.match(/step-(\d+)/);
        const stepNumber = stepMatch ? parseInt(stepMatch[1]) : newDiagramSteps.length + 1;
        
        // Create documentation step for the diagram
        const diagramStep: DocumentationStep = {
          id: stepId,
          timestamp: 0, // Will be updated if needed
          title: `Diagram ${stepNumber}`,
          description: 'Diagram created with diagram editor',
          type: 'diagram',
          actionType: 'diagram',
          diagramJsonPath: `diagrams/${jsonFile}`,
          diagramImagePath: `diagrams/${pngFile.name}`,
          isGenerated: false
        };
        
        newDiagramSteps.push(diagramStep);
        logger.log('✅ Created documentation step for diagram:', stepId);
      }
      
      if (newDiagramSteps.length > 0) {
        logger.log('📝 Adding', newDiagramSteps.length, 'new diagram steps to documentationSteps');
        
        // Update local state first (this prevents the synchronization useEffect from overwriting)
        const updatedSteps = [...currentSteps, ...newDiagramSteps];
        setDocumentationSteps(updatedSteps);
        
        // Then update project metadata to match
        const updatedProject = {
          ...currentProject,
          metadata: {
            ...currentProject.metadata,
            documentationSteps: updatedSteps
          }
        };
        
        // Update project in store
        updateProject(updatedProject.id, updatedProject);
        setCurrentProject(updatedProject);
        
        logger.log('✅ Successfully loaded', newDiagramSteps.length, 'existing diagrams');
      } else {
        logger.log('📝 No new diagrams to add - all existing diagrams are already in documentationSteps');
      }
    } catch (error) {
      logger.error('❌ Failed to load existing diagrams:', error);
    }
  };
  
  // Load project from navigation state if projectId is provided
  useEffect(() => {
    // Prevent duplicate initialization on re-mounts
    if (hasMountedRef.current) {
      logger.log('⏸️ EditingPage already mounted, skipping initialization');
      return;
    }

    hasMountedRef.current = true;

    logger.log('=== EDITING PAGE MOUNTED ===');
    logger.log('🎯 Navigation state:', {
      projectId,
      videoFilePath,
      recordingId,
      recordingDuration,
      navigationScreenshots,
      fromInteractiveCapture,
      fromUpload,
      screenshots,
      stateScreenshots: location.state?.screenshots,
      stateNavigationScreenshots: location.state?.navigationScreenshots,
      hasCurrentProject: !!currentProject,
      hasCurrentRecording: !!currentRecording,
      screenshotsCount: navigationScreenshots?.length || screenshots?.length || 0
    });
    
    if (projectId && !currentProject) {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        logger.log('🔄 Loading project from navigation state:', project.name);
        setCurrentProject(project);
      } else {
        logger.warn('⚠️ Project not found with ID:', projectId);
        toast.error(t('toast.projectNotFound'));
        navigate('/dashboard');
      }
    }
  }, [projectId, projects, currentProject, setCurrentProject, navigate]);

  // Load existing diagrams when project is loaded or changes
  useEffect(() => {
    if (currentProject && !fromInteractiveCapture) {
      logger.log('🔄 Project loaded, scanning for existing diagrams:', currentProject.name);
      logger.log('📊 Current documentation steps before loading diagrams:', documentationSteps.length);
      loadExistingDiagrams();
    }
  }, [currentProject?.id, fromInteractiveCapture, documentationSteps.length]); // Added documentationSteps.length dependency
  
  // Consolidated screenshot synchronization - prevents infinite loops
  useEffect(() => {
    logger.log('🔄 Consolidated screenshot sync triggered');
    logger.log('🚩 isReorderingRef.current:', isReorderingRef.current);
    logger.log('🎯 fromInteractiveCapture:', fromInteractiveCapture);
    logger.log('📊 Project screenshots count:', currentProject?.metadata?.screenshots?.length || 0);
    logger.log('🔗 Navigation screenshots count:', navigationScreenshots?.length || 0);
    
    if (isReorderingRef.current || justSavedStep || isBulkDeletingRef.current) {
      logger.log('⏸️ Skipping sync - reordering, just saved, or bulk deleting');
      return;
    }

    let screenshotsToUse = [];

    if (currentProject?.metadata?.screenshots && currentProject.metadata.screenshots.length > 0) {
      // Always prefer project metadata — it's the persisted source of truth and includes
      // screenshots added via drag-and-drop. navigationScreenshots is frozen from navigation
      // state and never reflects later additions.
      logger.log('✅ Using project metadata screenshots');
      screenshotsToUse = currentProject.metadata.screenshots;
    } else if (fromInteractiveCapture && navigationScreenshots?.length > 0) {
      // Fallback to navigation screenshots only for initial load when project metadata
      // hasn't been persisted yet
      logger.log('✅ Using navigation screenshots from interactive capture (initial load)');
      screenshotsToUse = navigationScreenshots;
    }

    // Only update if different (prevents infinite loops)
    if (JSON.stringify(screenshotsToUse) !== JSON.stringify(screenshots)) {
      logger.log('🔄 Updating screenshots state');
      setScreenshots(screenshotsToUse);
    } else {
      logger.log('✅ Screenshots already in sync, skipping update');
    }
  }, [currentProject?.metadata?.screenshots, navigationScreenshots, fromInteractiveCapture]);
  
  // Load secure URLs whenever screenshots or project changes
  useEffect(() => {
    let isCancelled = false;

    const loadUrls = async () => {
      try {
        if (!isCancelled) {
          await loadSecureScreenshotUrls();
        }
      } catch (error) {
        logger.error('❌ Failed to load screenshot URLs:', error);
      }
    };

    loadUrls();

    return () => {
      isCancelled = true;
    };
  }, [screenshots.map(s => s.id).join(','), currentProject?.id]);

  // Load secure URLs and diagram data whenever documentationSteps or project changes
  useEffect(() => {
    let isCancelled = false;

    const loadUrlsAndDiagramData = async () => {
      try {
        if (!isCancelled) {
          // Load secure URLs for diagram images and video steps
          await loadSecureDiagramUrls();
          await loadSecureVideoUrls();

          // Load diagram data from JSON files for diagram steps that don't have it yet
          const diagramSteps = documentationSteps.filter(
            step => step.type === 'diagram' && step.diagramJsonPath && (!step.diagramElements || step.diagramElements.length === 0)
          );

          if (diagramSteps.length > 0) {
            logger.log('📊 Loading diagram data from JSON files for', diagramSteps.length, 'steps');

            const stepsWithData = await Promise.all(
              diagramSteps.map(async (step) => {
                try {
                  const loadedStep = await loadDiagramData(step);
                  return loadedStep;
                } catch (error) {
                  logger.error('Failed to load diagram data for step:', step.id, error);
                  return step;
                }
              })
            );

            // Update documentation steps with loaded diagram data
            const updatedSteps = documentationSteps.map(step => {
              const loadedStep = stepsWithData.find(ls => ls.id === step.id);
              return loadedStep || step;
            });

            setDocumentationSteps(updatedSteps);
            logger.log('✅ Loaded diagram data for', stepsWithData.length, 'steps');
          }
        }
      } catch (error) {
        logger.error('❌ Failed to load diagram URLs and data:', error);
      }
    };

    loadUrlsAndDiagramData();

    return () => {
      isCancelled = true;
    };
  }, [
    documentationSteps.map(s => `${s.id}-${s.diagramImagePath || ''}-${s.videoClipPath || ''}`).join(','),
    currentProject?.id
  ]);
  
  // Utility functions
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getActionColor = (actionType: string): string => {
    switch (actionType) {
      case 'click': return 'bg-blue-500';
      case 'type': return 'bg-green-500';
      case 'scroll': return 'bg-yellow-500';
      case 'key': return 'bg-purple-500';
      case 'navigate': return 'bg-red-500';
      case 'diagram': return 'bg-indigo-500';
      default: return 'bg-gray-500';
    }
  };
  
  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'click': return <MousePointer className="w-3 h-3 text-white" />;
      case 'type': return <Keyboard className="w-3 h-3 text-white" />;
      case 'scroll': return <Layers className="w-3 h-3 text-white" />;
      case 'key': return <Keyboard className="w-3 h-3 text-white" />;
      case 'navigate': return <MousePointer className="w-3 h-3 text-white" />;
      case 'diagram': return <FileText className="w-3 h-3 text-white" />;
      default: return <MousePointer className="w-3 h-3 text-white" />;
    }
  };

  // Workflow handler functions
  const handleEditFrame = (frameId: string, imageData: string) => {
    const step = currentRecording?.documentationSteps?.find(s => s.id === frameId);
    if (step) {
      setEditingScreenshot({ id: frameId, imageData });
      setShowImageEditor(true);
    }
  };

  const handleImageEditorSave = (editedImageData: string, stepInfo?: { title: string; description: string; actionType: string }) => {
    if (editingScreenshot && currentRecording) {
      // Find the existing documentation step
      const existingStep = currentRecording.documentationSteps?.find(s => s.id === editingScreenshot.id);
      
      if (existingStep) {
        const updatedStep: DocumentationStep = {
          ...existingStep,
          title: stepInfo?.title || existingStep.title,
          description: stepInfo?.description || existingStep.description,
          screenshot: editedImageData,
          actionType: (stepInfo?.actionType as any) || existingStep.actionType,
        };
        
        // Update the documentation step in the recording
        const updatedSteps = currentRecording.documentationSteps?.map(step => 
          step.id === editingScreenshot.id ? updatedStep : step
        ) || [];
        
        updateRecording(currentRecording.id, {
          ...currentRecording,
          documentationSteps: updatedSteps
        });
      }
      
      setShowImageEditor(false);
      setEditingScreenshot(null);
      toast.success(t('toast.stepUpdated'));
    }
  };

  // Helper function to sanitize data for React Router navigation
  // Removes non-serializable values like functions and React state setters
  const sanitizeForNavigation = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'function') return undefined;
    if (Array.isArray(obj)) return obj.map(sanitizeForNavigation).filter(item => item !== undefined);
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        const value = obj[key];
        // Skip functions and React-specific properties
        if (typeof value !== 'function' && key !== 'reactFlowInstance' && key !== 'rfInstance') {
          sanitized[key] = sanitizeForNavigation(value);
        }
      }
      return sanitized;
    }
    return obj;
  };

  // Helper function to load diagram JSON data from file
  const loadDiagramData = async (docStep: DocumentationStep): Promise<DocumentationStep> => {
    // If diagram data is already loaded, return as is
    if (docStep.diagramElements && docStep.diagramElements.length > 0) {
      logger.log('✅ Diagram data already loaded for:', docStep.id);
      return docStep;
    }

    // If no JSON path, return as is
    if (!docStep.diagramJsonPath || !currentProject?.name) {
      logger.warn('⚠️ No diagram JSON path or project name:', {
        diagramJsonPath: docStep.diagramJsonPath,
        projectName: currentProject?.name
      });
      return docStep;
    }

    try {
      logger.log('🔄 Loading diagram JSON data for:', docStep.id);

      // Extract filename from path
      const fileName = docStep.diagramJsonPath.split(/[\/\\]/).pop();
      if (!fileName) {
        logger.warn('⚠️ Could not extract filename from:', docStep.diagramJsonPath);
        return docStep;
      }

      // Load JSON file using IPC
      const absolutePath = await window.electronAPI.ipcInvoke('get-project-file-path', currentProject.name, `diagrams/${fileName}`);
      if (!absolutePath) {
        logger.warn('⚠️ Diagram JSON file not found:', fileName);
        return docStep;
      }

      // Read JSON file content
      const jsonContent = await window.electronAPI.ipcInvoke('read-file', absolutePath);
      if (!jsonContent) {
        logger.warn('⚠️ Failed to read diagram JSON file:', absolutePath);
        return docStep;
      }

      // Parse JSON
      const diagramData = JSON.parse(jsonContent);
      logger.log('✅ Successfully loaded diagram data:', {
        nodes: diagramData.nodes?.length || 0,
        edges: diagramData.edges?.length || 0,
        hasViewport: !!diagramData.viewport
      });

      // Ensure nodes have required position property
      const nodes = (diagramData.nodes || []).map((node: any) => ({
        ...node,
        position: node.position || { x: 0, y: 0 }
      }));

      // Ensure edges have valid type property for React Flow
      const edges = (diagramData.edges || []).map((edge: any) => {
        // If edge type is 'edge' (invalid), remove it to use default
        const { type, ...edgeRest } = edge;
        if (type === 'edge') {
          return edgeRest;
        }
        return edge;
      });

      // Return updated doc step with loaded data
      return {
        ...docStep,
        diagramElements: [...nodes, ...edges],
        diagramAppState: {
          viewport: diagramData.viewport || { x: 0, y: 0, zoom: 1 },
          zoom: diagramData.viewport?.zoom || 1
        }
      };
    } catch (error) {
      logger.error('❌ Error loading diagram JSON:', error);
      return docStep;
    }
  };

  const handleExportStepGuide = async () => {
    try {
      if (isInteractiveScreenshots) {
        // For interactive screenshots, use documentationSteps as source of truth for order
        const unifiedSteps = [];

        // Create a map of screenshots by ID for efficient lookup
        const screenshotMap = new Map();
        screenshots?.forEach((screenshot: any) => {
          screenshotMap.set(screenshot.id, screenshot);
        });

        // Iterate through documentationSteps to maintain reordered sequence
        for (const docStep of documentationSteps || []) {
          const screenshot = screenshotMap.get(docStep.id);

          if (screenshot) {
            // This is a screenshot step - ensure imageData is populated
            let imageData = screenshot.imageData;
            if (!imageData || !imageData.startsWith('data:')) {
              try {
                imageData = await getSecureScreenshotUrl(screenshot, currentProject.name);
              } catch (err) {
                logger.error('⚠️ Failed to load screenshot for export:', screenshot.id, err);
                imageData = screenshot.imageData || screenshot.filePath || null;
              }
            }

            // Check if this is a video step (no image data expected)
            const isVideoStep = docStep.mediaType === 'video' || screenshot.mediaType === 'video';

            if (isVideoStep) {
              // Video steps don't need imageData — pass through video metadata
              unifiedSteps.push({
                screenshot: {
                  ...screenshot,
                  imageData: imageData || null,
                  mediaType: 'video',
                  videoClipPath: docStep.videoClipPath || screenshot.videoClipPath,
                  videoClipMimeType: docStep.videoClipMimeType || screenshot.videoClipMimeType,
                },
                docStep,
                type: 'screenshot'
              });
            } else if (imageData) {
              // Regular screenshot step — requires valid image data
              unifiedSteps.push({
                screenshot: {
                  ...screenshot,
                  imageData: imageData
                },
                docStep,
                type: 'screenshot'
              });
            } else {
              logger.warn('⚠️ Skipping screenshot due to missing image data:', screenshot.id);
            }
          } else {
            // This is a diagram-only step
            unifiedSteps.push({
              screenshot: null,
              docStep,
              type: 'docStep'
            });
          }
        }

        if (unifiedSteps.length === 0) {
          toast.error(t('toast.noStepsToExport'));
          return;
        }

        logger.log('✅ Prepared', unifiedSteps.length, 'steps for export');

        // Sanitize all data before passing to navigate to avoid DataCloneError
        const sanitizedScreenshots = sanitizeForNavigation(unifiedSteps.filter(step => step.screenshot).map(step => step.screenshot));
        const sanitizedSteps = sanitizeForNavigation(unifiedSteps.map(step => step.docStep).filter(Boolean));
        const sanitizedUnifiedSteps = sanitizeForNavigation(unifiedSteps);
        const sanitizedCurrentProject = sanitizeForNavigation(currentProject);

        // Navigate to export page with unified steps data
        navigate('/export', {
          state: {
            screenshots: sanitizedScreenshots,
            steps: sanitizedSteps,
            unifiedSteps: sanitizedUnifiedSteps,
            projectTitle,
            projectSource,
            exportType: 'interactive-screenshots',
            currentProject: sanitizedCurrentProject
          }
        });
      } else {
        // For video projects, use local documentationSteps state (source of truth)
        if (!documentationSteps || documentationSteps.length === 0) {
          toast.error(t('toast.noDocStepsToExport'));
          return;
        }

        // Sync local documentationSteps to the recording before exporting
        if (currentRecording) {
          updateRecording(currentRecording.id, { documentationSteps: documentationSteps });
        }

        // Use local documentation steps
        const steps = documentationSteps;

        // Sanitize data to remove non-serializable values to avoid DataCloneError
        const sanitizedSteps = sanitizeForNavigation(steps);
        const sanitizedCurrentProject = sanitizeForNavigation(currentProject);

        // Navigate to export page with the steps
        navigate('/export', {
          state: {
            steps: sanitizedSteps,
            projectTitle,
            projectSource,
            exportType: 'step-guide',
            currentProject: sanitizedCurrentProject
          }
        });
      }
    } catch (error) {
      logger.error('Export error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Export error details:', errorMessage);
      toast.error(t('toast.exportFailed', { error: errorMessage }));
    }
  };

  const handleExportVideo = () => {
    if (!currentRecording?.filePath) {
      toast.error(t('toast.noVideoFile'));
      return;
    }

    // Save current documentationSteps to the recording before exporting
    const updatedRecording = {
      ...currentRecording,
      documentationSteps: documentationSteps
    };
    setCurrentRecording(updatedRecording);
    updateRecording(currentRecording.id, { documentationSteps: documentationSteps });

    navigate('/video-export', {
      state: {
        videoFilePath: currentRecording.filePath,
        projectTitle,
        projectSource
      }
    });
  };

  useEffect(() => {
    // Handle video file path from navigation state
    if (videoFilePath && (!currentRecording || !currentRecording.filePath)) {
      logger.log('Video file path from navigation:', videoFilePath);
      
      // Create or update current recording with the video file path
      const recordingWithVideo = {
        ...currentRecording,
        id: recordingId || currentRecording?.id || `recording-${Date.now()}`,
        filePath: videoFilePath,
        duration: recordingDuration || currentRecording?.duration || 0,
        bookmarks: navigationBookmarks || currentRecording?.bookmarks || [],
        name: currentRecording?.name || `Recording ${new Date().toLocaleString()}`,
        createdAt: currentRecording?.createdAt || new Date().toISOString(),
        metadata: {
          ...currentRecording?.metadata,
          projectTitle: projectTitle,
          projectSource: projectSource
        }
      };

      logger.log('Setting current recording with', recordingWithVideo.bookmarks?.length || 0, 'bookmarks');
      setCurrentRecording(recordingWithVideo);
      return;
    }
    
    // Only load recording data for video projects, not screenshot-only projects
    if (currentRecording && !fromInteractiveCapture && !isInteractiveScreenshots && currentRecording.filePath) {
      logger.log('Loading video recording data for video project');
      // Load recording data and generate timeline
      const loadData = async () => {
        try {
          const cleanup = await loadRecordingData();
          generateTimelineSegments();
          return cleanup;
        } catch (error) {
          logger.error('Error loading recording data:', error);
          toast.error(t('toast.videoLoadFailed'));
        }
      };
      
      loadData();
    } else if (currentRecording && (fromInteractiveCapture || isInteractiveScreenshots)) {
      logger.log('📸 Skipping video loading for screenshot-only project from interactive capture');
      // For screenshot-only projects, just load the screenshot data
      if (!isReorderingRef.current && !justSavedStep) {
        logger.log('📸 Loading screenshot data for interactive screenshots project');
        const loadData = async () => {
          try {
            await loadScreenshotData();
          } catch (error) {
            logger.error('❌ Error loading screenshot data for interactive screenshots:', error);
            toast.error(t('toast.interactiveScreenshotsLoadFailed'));
          }
        };
        loadData();
      }
    } else if (currentProject?.recordings && currentProject.recordings.length > 0 && !fromInteractiveCapture) {
      // Auto-select the most recent recording if no current recording is set (only for video projects)
      const mostRecentRecording = currentProject.recordings
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      logger.log('Auto-selecting most recent recording:', mostRecentRecording);
      setCurrentRecording(mostRecentRecording);
    } else if (currentProject?.metadata?.screenshots || fromInteractiveCapture) {
      // Handle screenshot-only projects, including from interactive capture
      if (!isReorderingRef.current && !justSavedStep) {
        logger.log('📸 Loading screenshot data (not during reordering or after save)');
        const loadData = async () => {
          try {
            await loadScreenshotData();
          } catch (error) {
            logger.error('❌ Error loading screenshot data:', error);
            toast.error(t('toast.screenshotsLoadFailed'));
          }
        };
        loadData();
      } else {
        logger.log('🚫 Skipping loadScreenshotData during reordering or after save');
      }
    }

    // Cleanup on unmount
    return () => {
      hasMountedRef.current = false;
      isLoadingScreenshotsRef.current = false;
    };
  }, [currentRecording?.id, currentProject?.id, videoFilePath, recordingId, fromInteractiveCapture, isInteractiveScreenshots]);

  // Watch for changes to currentRecording.documentationSteps and update local state
  useEffect(() => {
    if (isBulkDeletingRef.current) return;

    logger.log('🔄 useEffect triggered for currentRecording.documentationSteps');
    logger.log('📊 Current recording:', currentRecording?.id);
    logger.log('📊 Documentation steps in recording:', currentRecording?.documentationSteps?.length || 0);
    logger.log('📊 Current local documentationSteps:', documentationSteps.length);

    // Sync local state with recording data while preserving diagram steps from project metadata
    // Skip sync if recording steps are empty — this means steps were intentionally deleted
    if (currentRecording?.documentationSteps && currentRecording.documentationSteps.length > 0) {
      logger.log('📝 Syncing documentation steps from recording:', currentRecording.documentationSteps.length);
      logger.log('📝 Steps data:', currentRecording.documentationSteps.map(s => ({ id: s.id, title: s.title, timestamp: s.timestamp })));

      // Always prefer project metadata order if it exists (preserves custom reordering)
      if (currentProject?.metadata?.documentationSteps && currentProject.metadata.documentationSteps.length > 0) {
        logger.log('📝 Using project metadata documentationSteps (preserves custom reordering)');

        // IMPORTANT: When updating from project metadata, preserve existing local state diagram data
        // This prevents diagram flickering when navigating from project page
        const currentLocalSteps = documentationSteps;
        const projectSteps = currentProject.metadata.documentationSteps;

        // Merge project steps with local diagram data
        const mergedSteps = projectSteps.map(projectStep => {
          if (projectStep.type === 'diagram') {
            // Find matching local step to preserve diagram data
            const localStep = currentLocalSteps.find(ls => ls.id === projectStep.id);
            if (localStep && localStep.diagramElements && localStep.diagramElements.length > 0) {
              logger.log('🔄 Preserving diagram data for step:', projectStep.id);
              return {
                ...projectStep,
                diagramElements: localStep.diagramElements,
                diagramAppState: localStep.diagramAppState
              };
            }
          }
          return projectStep;
        });

        setDocumentationSteps(mergedSteps);
      } else {
        // Fallback: Use recording steps for initial load
        const recordingSteps = currentRecording.documentationSteps || [];
        logger.log('📝 Using recording steps (no project metadata available)');
        setDocumentationSteps(recordingSteps);
      }
    }
  }, [currentRecording?.documentationSteps, currentProject?.metadata?.documentationSteps]);

  // Fixed documentation steps synchronization - prevents infinite loops
  useEffect(() => {
    if (isBulkDeletingRef.current) return;
    if (!currentProject?.metadata?.documentationSteps || currentProject.metadata.documentationSteps.length === 0) return;

    const projectSteps = currentProject.metadata.documentationSteps;
    
    // Check if local state has diagram steps that aren't in project metadata
    const localDiagramSteps = documentationSteps.filter(step => step.type === 'diagram');
    const projectDiagramSteps = projectSteps.filter(step => step.type === 'diagram');
    
    // Find diagram steps in local state that aren't in project metadata
    const missingDiagramSteps = localDiagramSteps.filter(localStep => 
      !projectDiagramSteps.some(projectStep => projectStep.id === localStep.id)
    );
    
    // If local state has diagram steps not in project metadata, update project instead of overwriting local state
    if (missingDiagramSteps.length > 0) {
      logger.log('📝 Local state has', missingDiagramSteps.length, 'diagram steps not in project metadata');
      logger.log('📝 Updating project metadata with missing diagram steps');
      
      // Update project metadata with the missing diagram steps
      const updatedProjectSteps = [...projectSteps, ...missingDiagramSteps];
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          documentationSteps: updatedProjectSteps
        }
      };
      
      // Update project in store (this will trigger this useEffect again, but with matching data)
      updateProject(currentProject.id, updatedProject);
      return;
    }
    
    // Create a hash of project steps content to detect changes
    const projectStepsHash = JSON.stringify(
      projectSteps.map(s => ({ id: s.id, title: s.title, description: s.description, actionType: s.actionType }))
    );

    // Create a hash of local steps content
    const localStepsHash = JSON.stringify(
      documentationSteps.map(s => ({ id: s.id, title: s.title, description: s.description, actionType: s.actionType }))
    );

    // Sync if content is different
    if (projectStepsHash !== localStepsHash) {
      logger.log('🔄 Syncing documentation steps from project metadata');
      logger.log('📊 Project steps:', projectSteps.length, 'Local steps:', documentationSteps.length);
      logger.log('📝 Content changed detected - syncing titles/descriptions/actionTypes');
      setDocumentationSteps(projectSteps);
    } else {
      logger.log('✅ Documentation steps already in sync');
    }
  }, [currentProject?.metadata?.documentationSteps]);

  // Handle state synchronization after creating new diagram steps
  useEffect(() => {
    // This effect ensures the UI updates correctly after creating a new diagram step
    // by triggering a re-render when documentationSteps changes
    if (documentationSteps.length > 0) {
      // Small delay to ensure React has processed all state updates
      const timeoutId = setTimeout(() => {
        setForceUpdate(prev => prev + 1);
      }, 10);
      
      return () => clearTimeout(timeoutId);
    }
  }, [documentationSteps.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('ended', () => setIsPlaying(false));
    };
  }, []);

  // Load video when recording changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentRecording?.filePath) return;

    // Load the video file
    video.load();
    
    // Reset playback state
    setIsPlaying(false);
    setCurrentTime(0);
  }, [currentRecording?.filePath]);

  const loadRecordingData = async () => {
    if (!currentRecording) {
      logger.log('No currentRecording found');
      return;
    }
    
    // Skip video loading for screenshot-only projects
    if (fromInteractiveCapture || isInteractiveScreenshots) {
      logger.log('📸 Skipping video loading for screenshot-only project');
      // Set duration from recording or default for screenshot projects
      setDuration(currentRecording.duration || 120);
      
      // Load existing documentation steps only if local state is empty
      if (currentRecording.documentationSteps && documentationSteps.length === 0) {
        logger.log('📝 loadRecordingData: Setting initial documentation steps from recording');
        setDocumentationSteps(currentRecording.documentationSteps);
      }
      return;
    }
    
    logger.log('Loading recording data:', currentRecording);
    logger.log('Video file path:', currentRecording.filePath);
    logger.log('Current recording has filePath:', !!currentRecording.filePath);
    logger.log('File path type:', typeof currentRecording.filePath);
    logger.log('File path value:', JSON.stringify(currentRecording.filePath));
    
    // Set duration from recording or default
    setDuration(currentRecording.duration || 120);
    
    // Load existing documentation steps only if local state is empty
    if (currentRecording.documentationSteps && documentationSteps.length === 0) {
      logger.log('📝 loadRecordingData: Setting initial documentation steps from recording');
      setDocumentationSteps(currentRecording.documentationSteps);
    } else {
      logger.log('📝 loadRecordingData: Documentation steps already exist, preserving local state');
    }
    
    // Set up video element if file path exists and we have a video element
    if (currentRecording.filePath && videoRef.current) {
      const video = videoRef.current;
      
      try {
        // For Electron, we need to use a different approach to load local files
        // Check if we're in Electron environment
        if (window.electronAPI) {
          // Use file:// protocol for local files in Electron
          let videoSrc = currentRecording.filePath;
          
          // Convert relative paths to absolute paths using secure IPC
          if (!videoSrc.match(/^[A-Za-z]:/)) {
            // Relative path - convert to absolute using secure path methods
            try {
              const projectsDir = await window.electronAPI.getProjectsDirectory();
              const normalizedProjectsDir = projectsDir.replace(/\\/g, '/');
              const normalizedVideoSrc = videoSrc.replace(/\\/g, '/');
              videoSrc = `${normalizedProjectsDir}/${normalizedVideoSrc}`;
            } catch (error) {
              logger.error('Failed to get projects directory:', error);
              // Fallback to original path if secure method fails
            }
          }
          
          if (!videoSrc.startsWith('file://')) {
            // Convert Windows path to file:// URL
            videoSrc = `file:///${videoSrc.replace(/\\/g, '/').replace(/^[A-Z]:/, (match) => match.toLowerCase())}`;
          }
          logger.log('Setting Electron video source:', videoSrc);
          video.src = videoSrc;
        } else {
          // Fallback for web environment
          let videoSrc = currentRecording.filePath;
          if (!videoSrc.startsWith('http') && !videoSrc.startsWith('file://')) {
            videoSrc = `file://${videoSrc.replace(/\\/g, '/')}`;
          }
          logger.log('Setting web video source:', videoSrc);
          video.src = videoSrc;
        }
        
        // Add error handling
        const handleVideoError = (e: Event) => {
          logger.error('Video loading error:', e);
          logger.error('Video error details:', {
            error: video.error,
            networkState: video.networkState,
            readyState: video.readyState,
            src: video.src
          });
          
          // Show user-friendly error message
          logger.warn('Failed to load video file - this may be expected for screenshot-only projects');
        };
        
        const handleVideoLoad = () => {
          logger.log('Video loaded successfully:', {
            duration: video.duration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            src: video.src
          });
          // Validate duration before setting it
          const videoDuration = isFinite(video.duration) && video.duration > 0 ? video.duration : null;
          const recordingDuration = isFinite(currentRecording?.duration) && currentRecording.duration > 0 ? currentRecording.duration : null;
          const finalDuration = videoDuration || recordingDuration || 120;
          
          logger.log('Setting duration:', { videoDuration, recordingDuration, finalDuration });
          setDuration(finalDuration);
        };
        
        video.addEventListener('error', handleVideoError);
        video.addEventListener('loadedmetadata', handleVideoLoad);
        
        // Cleanup function
        return () => {
          video.removeEventListener('error', handleVideoError);
          video.removeEventListener('loadedmetadata', handleVideoLoad);
        };
      } catch (error) {
        logger.error('Error setting up video element:', error);
        logger.warn('Failed to set up video player - continuing without video');
      }
    } else if (!currentRecording.filePath) {
      logger.log('No video file path found in recording - this might be a screenshot-only project');
    }
  };

  const loadScreenshotData = () => {
    if (!currentProject?.metadata?.screenshots || currentProject.metadata.screenshots.length === 0) return;

    // CRITICAL FIX: If documentationSteps already exist in project metadata, DON'T regenerate them from screenshots
    // This function should only create NEW steps from screenshots, not overwrite existing edited steps
    if (currentProject.metadata?.documentationSteps && currentProject.metadata.documentationSteps.length > 0) {
      logger.log('⏭️ Documentation steps already exist in project metadata, skipping loadScreenshotData');
      logger.log('📊 Existing steps count:', currentProject.metadata.documentationSteps.length);
      return;
    }

    // Prevent concurrent loads
    if (isLoadingScreenshotsRef.current) {
      logger.log('⏸️ Screenshot loading already in progress, skipping...');
      return;
    }

    isLoadingScreenshotsRef.current = true;
    const projectScreenshots = currentProject.metadata.screenshots;
    
    // Set duration based on screenshot timestamps
    if (projectScreenshots.length > 0) {
      const maxTimestamp = Math.max(...projectScreenshots.map(s => s.timestamp));
      const minTimestamp = Math.min(...projectScreenshots.map(s => s.timestamp));
      setDuration((maxTimestamp - minTimestamp) / 1000 || 10);
      
      // Only automatically select the first screenshot if no screenshot is currently selected
      // This prevents overriding user selections after editing operations
      if (!selectedScreenshot) {
        // Handle both new file-based screenshots and legacy imageData screenshots
        const firstScreenshot = projectScreenshots[0];
        logger.log('🔍 First screenshot details:', {
          id: firstScreenshot.id,
          filePath: firstScreenshot.filePath,
          filePathType: typeof firstScreenshot.filePath,
          hasImageData: !!firstScreenshot.imageData
        });
        
        // Use secure method to get screenshot URL
        getSecureScreenshotUrl(firstScreenshot, currentProject.name).then(url => {
          if (url) {
            logger.log('📸 Setting secure screenshot URL');
            setSelectedScreenshot(url);
          } else {
            logger.warn('⚠️ Failed to get secure screenshot URL for first screenshot');
          }
        }).catch(error => {
          logger.error('Failed to set first screenshot:', error);
        });
      } else {
        logger.log('📸 Preserving existing screenshot selection:', selectedScreenshot.substring(0, 50) + '...');
      }
    }
    
    // Convert screenshots to documentation steps, but preserve existing step information
    const screenshotSteps: DocumentationStep[] = projectScreenshots.map((screenshot, index) => {
      // Handle both new file-based screenshots and legacy imageData screenshots
      let screenshotData;

      // Handle filePath - could be string or object (legacy format)
      let actualFilePath;
      if (typeof screenshot.filePath === 'string') {
        actualFilePath = screenshot.filePath;
      } else if (screenshot.filePath && typeof screenshot.filePath === 'object' && 'filePath' in screenshot.filePath) {
        // Legacy object format - extract the actual filePath string
        actualFilePath = (screenshot.filePath as any).filePath;
        logger.log('🔄 Migrating legacy filePath object to string:', actualFilePath);
      }

      // Use secure method to get screenshot data
      // For now, we'll use a placeholder and update asynchronously
      if (actualFilePath) {
        // New file-based screenshot - will be loaded securely
        screenshotData = 'loading'; // Placeholder
      } else if (screenshot.imageData) {
        // Legacy base64 screenshot
        screenshotData = screenshot.imageData;
      } else {
        logger.warn('⚠️ Screenshot has invalid filePath in documentation steps:', typeof screenshot.filePath, screenshot.filePath);
        screenshotData = 'error';
      }

      // CRITICAL FIX: Get step information from persisted project metadata, not from local state
      const persistedStep = currentProject.metadata?.documentationSteps?.find(step => step.id === screenshot.id);

      // Debug logging
      if (index === 0) {
        logger.log('🔍 [loadScreenshotData] First screenshot - checking persisted data:', {
          screenshotId: screenshot.id,
          persistedStepFound: !!persistedStep,
          persistedTitle: persistedStep?.title,
          persistedDescription: persistedStep?.description,
          totalPersistedSteps: currentProject.metadata?.documentationSteps?.length || 0
        });
      }

      return {
        id: screenshot.id, // Use screenshot ID to maintain consistency
        timestamp: projectScreenshots.length > 1 ? (screenshot.timestamp - projectScreenshots[0].timestamp) / 1000 : index * 2,
        title: persistedStep?.title || (screenshot as any).title || `Screenshot ${index + 1}`,
        description: persistedStep?.description || screenshot.description || `Describe what happens in this step...`,
        screenshot: screenshotData,
        actionType: persistedStep?.actionType || (screenshot as any).actionType || 'click',
        element: persistedStep?.element || 'Click action',
        isGenerated: persistedStep?.isGenerated ?? false
      };
    });

    // Preserve diagram steps and other non-screenshot steps from project metadata
    const existingDiagramSteps = (currentProject.metadata?.documentationSteps || []).filter(
      step => step.type === 'diagram'
    );

    // Merge screenshot steps with diagram steps
    const mergedSteps = [...screenshotSteps, ...existingDiagramSteps];

    // Always sync documentation steps with latest project metadata
    logger.log('📝 loadScreenshotData: Syncing documentation steps with project metadata');
    logger.log('📊 Screenshot steps:', screenshotSteps.length, 'Diagram steps:', existingDiagramSteps.length);
    setDocumentationSteps(mergedSteps);
    
    // Load secure URLs for file-based screenshots asynchronously
    const loadSecureUrls = async () => {
      const updatedSteps = await Promise.all(
        mergedSteps.map(async (step) => {
          // Only update screenshot steps that are loading
          if (step.screenshot === 'loading') {
            const screenshot = projectScreenshots.find(s => s.id === step.id);
            if (screenshot) {
              const secureUrl = await getSecureScreenshotUrl(screenshot, currentProject.name);
              return { ...step, screenshot: secureUrl || 'error' };
            }
          }
          return step;
        })
      );
      setDocumentationSteps(updatedSteps);
    };
    
    loadSecureUrls()
      .catch(error => {
        logger.error('Failed to load secure screenshot URLs:', error);
      })
      .finally(() => {
        isLoadingScreenshotsRef.current = false;
      });
    
    // Generate timeline segments for screenshots
    const segments: TimelineSegment[] = projectScreenshots.map((screenshot, index) => ({
      id: `screenshot-segment-${index}`,
      startTime: projectScreenshots.length > 1 ? (screenshot.timestamp - projectScreenshots[0].timestamp) / 1000 : index * 2,
      endTime: projectScreenshots.length > 1 ? (screenshot.timestamp - projectScreenshots[0].timestamp) / 1000 + 1 : index * 2 + 1,
      type: 'action',
      description: screenshot.description || `Screenshot ${index + 1}`,
      actionType: 'click'
    }));
    
    setTimelineSegments(segments);
  };

  const generateTimelineSegments = () => {
    if (!currentRecording?.actions) return;

    const segments: TimelineSegment[] = currentRecording.actions.map((action, index) => ({
      id: `segment-${index}`,
      startTime: action.timestamp,
      endTime: action.timestamp + 2, // 2 second duration for each action
      type: 'action',
      description: action.data?.description || `${action.type} action`,
      actionType: action.type === 'keypress' ? 'key' : action.type === 'navigation' || action.type === 'voice' ? 'click' : action.type as 'click' | 'type' | 'scroll' | 'key'
    }));

    setTimelineSegments(segments);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
      setCurrentTime(time);
    } else {
      // For screenshot-only projects, find and display the screenshot at this time
      setCurrentTime(time);
      const screenshot = screenshots?.find(s => {
        const screenshotTime = screenshots.length > 1 ? (s.timestamp - screenshots[0].timestamp) / 1000 : 0;
        return Math.abs(screenshotTime - time) < 1; // Within 1 second
      });
      if (screenshot) {
        // Handle both new file-based screenshots and legacy imageData screenshots
        let actualFilePath;
        if (typeof screenshot.filePath === 'string') {
          actualFilePath = screenshot.filePath;
        } else if (screenshot.filePath && typeof screenshot.filePath === 'object' && 'filePath' in screenshot.filePath) {
          // Legacy object format - extract the actual filePath string
          actualFilePath = (screenshot.filePath as any).filePath;
        }
        
        // Use secure method to get screenshot URL
        getSecureScreenshotUrl(screenshot, currentProject.name).then(url => {
          if (url) {
            setSelectedScreenshot(url);
          } else {
            logger.warn('⚠️ Failed to get secure screenshot URL in seekTo');
          }
        }).catch(error => {
          logger.error('Failed to set screenshot in seekTo:', error);
        });
      }
    }
  };

  const skipBackward = () => {
    seekTo(Math.max(0, currentTime - 10));
  };

  const skipForward = () => {
    seekTo(Math.min(duration, currentTime + 10));
  };

  const toggleMute = () => {
    // Simply toggle the muted state
    // VideoEditor component will handle the actual video element
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVolume: number) => {
    // Update volume state
    // VideoEditor component will handle the actual video element
    setVolume(newVolume);

    // If volume is set to 0, mute. Otherwise ensure unmuted.
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted && newVolume > 0) {
      setIsMuted(false);
    }
  };

  const handleSpeedChange = (speed: number) => {
    // Update playback speed state
    // VideoEditor component will handle the actual video element
    setPlaybackSpeed(speed);
  };

  const generateStepsFromBookmarks = async () => {
    if (!currentRecording?.filePath || !currentProject?.name) return;
    const bookmarks = currentRecording.bookmarks;
    if (!bookmarks || bookmarks.length === 0) return;
    if (!window.electronAPI?.extractStepsFromBookmarks) {
      toast.error(t('toast.desktopOnly'));
      return;
    }

    setIsGeneratingDocs(true);
    setSceneDetectionProgress({ stage: 'extracting', progress: 0, message: 'Extracting frames from bookmarks...' });

    const cleanupProgress = window.electronAPI.onSceneDetectionProgress((data) => {
      setSceneDetectionProgress(data);
    });

    try {
      const result = await window.electronAPI.extractStepsFromBookmarks(
        currentRecording.filePath,
        currentProject.name,
        bookmarks
      );

      if (!result.success || !result.steps) {
        throw new Error(result.error || 'Bookmark step extraction failed');
      }

      const generatedSteps = result.steps as DocumentationStep[];
      setDocumentationSteps(generatedSteps);

      // Create matching screenshot entries for the editing pipeline
      const newScreenshots = generatedSteps
        .filter(step => step.screenshot)
        .map(step => ({
          id: step.id,
          timestamp: step.timestamp,
          clickX: 0,
          clickY: 0,
          description: step.title,
          mediaType: 'image' as const,
          filePath: step.screenshot,
        }));
      setScreenshots(newScreenshots as any);

      // Persist to recording and project
      if (currentRecording) {
        updateRecording(currentRecording.id, {
          ...currentRecording,
          documentationSteps: generatedSteps
        });
      }
      if (currentProject) {
        updateProject(currentProject.id, {
          metadata: {
            ...currentProject.metadata,
            documentationSteps: generatedSteps,
            screenshots: newScreenshots,
          }
        });
      }

      toast.success(t('toast.bookmarksCreated', { count: result.stepCount }));
    } catch (error) {
      logger.error('Failed to generate steps from bookmarks:', error);
      toast.error(error instanceof Error ? error.message : t('toast.bookmarksFailed'));
    } finally {
      cleanupProgress();
      setIsGeneratingDocs(false);
      setSceneDetectionProgress(null);
    }
  };

  const addManualStep = () => {
    const currentTime = Date.now();
    const newStep: DocumentationStep = {
      id: `manual-${Date.now()}`,
      timestamp: currentTime,
      title: 'New Step',
      description: 'Describe what happens in this step...',
      actionType: 'click',
      isGenerated: false
    };
    
    const updatedSteps = [...documentationSteps, newStep].sort((a, b) => a.timestamp - b.timestamp);
    setDocumentationSteps(updatedSteps);
    
    // Save changes to the recording
    if (currentRecording) {
      updateRecording(currentRecording.id, {
        ...currentRecording,
        documentationSteps: updatedSteps
      });
    }
    
    setEditingStep(newStep.id);
  };

  // Create empty diagram step for React Flow
  const createEmptyFlowDiagram = () => {
    logger.log('🆕 Creating empty React Flow diagram step');

    const stepNumber = (screenshots?.length || 0) + documentationSteps.length + 1;

    const newDocumentationStep: DocumentationStep = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      title: `New Diagram Step ${stepNumber}`,
      description: `Step ${stepNumber} description`,
      actionType: 'diagram',
      type: 'diagram',
      isGenerated: false,
      diagramElements: [],
      diagramAppState: {},
      diagramJsonPath: undefined,
      diagramImagePath: undefined
    };

    logger.log('📝 Created empty documentation step:', newDocumentationStep);

    const updatedSteps = [...documentationSteps, newDocumentationStep];
    setDocumentationSteps(updatedSteps);

    if (currentRecording) {
      updateRecording(currentRecording.id, {
        documentationSteps: updatedSteps
      });
    }

    if (currentProject) {
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          documentationSteps: updatedSteps
        }
      };
      updateProject(currentProject.id, updatedProject);
    }

    setEditingFlow(newDocumentationStep);
    setForceUpdate(prev => prev + 1);

    return newDocumentationStep;
  };

  // Create or update workflow diagram from step titles (Auto-Generated Flow)
  const createWorkflowDiagram = () => {
    logger.log('🔄 Creating/updating workflow diagram from step titles');

    // Filter out diagram steps - only include screenshot/action steps
    const workflowSteps = documentationSteps.filter(step => step.type !== 'diagram');

    if (workflowSteps.length < 2) {
      toast.error(t('toast.needTwoSteps'));
      return;
    }

    // Check if an auto-generated workflow diagram already exists (by title and isGenerated flag)
    const existingWorkflowDiagram = documentationSteps.find(
      step => step.type === 'diagram' && step.title === 'Auto-Generated Flow' && step.isGenerated
    );

    // Generate ReactFlow nodes from step titles
    const NODE_WIDTH = 180;
    const NODE_HEIGHT = 60;
    const H_GAP = 100;
    const V_GAP = 100;
    const MAX_PER_ROW = 4;

    const nodes = workflowSteps.map((step, index) => {
      const row = Math.floor(index / MAX_PER_ROW);
      const col = index % MAX_PER_ROW;
      // Snake pattern: alternate direction on each row
      const effectiveCol = row % 2 === 0 ? col : (MAX_PER_ROW - 1 - col);

      return {
        id: `workflow-node-${index}`,
        type: 'process',
        position: {
          x: effectiveCol * (NODE_WIDTH + H_GAP) + 50,
          y: row * (NODE_HEIGHT + V_GAP) + 50
        },
        data: {
          label: step.title || `Step ${index + 1}`,
        },
        style: {
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
        }
      };
    });

    // Generate edges connecting consecutive nodes
    const edges = workflowSteps.slice(1).map((_, i) => {
      const sourceRow = Math.floor(i / MAX_PER_ROW);
      const targetRow = Math.floor((i + 1) / MAX_PER_ROW);

      // Determine handle positions based on snake pattern
      let sourceHandle = 'right';
      let targetHandle = 'left';

      if (sourceRow !== targetRow) {
        sourceHandle = 'bottom';
        targetHandle = 'top';
      } else if (sourceRow % 2 === 1) {
        sourceHandle = 'left';
        targetHandle = 'right';
      }

      return {
        id: `workflow-edge-${i}`,
        source: `workflow-node-${i}`,
        target: `workflow-node-${i + 1}`,
        sourceHandle,
        targetHandle,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: {
          type: 'arrowclosed',
          color: '#6366f1',
        }
      };
    });

    let workflowStep: DocumentationStep;
    let updatedSteps: DocumentationStep[];

    if (existingWorkflowDiagram) {
      // Update existing workflow diagram
      logger.log('📝 Updating existing workflow diagram:', existingWorkflowDiagram.id);

      workflowStep = {
        ...existingWorkflowDiagram,
        diagramElements: [...nodes, ...edges],
        diagramAppState: { viewport: { x: 0, y: 0, zoom: 0.8 } },
        // Keep existing image/json paths - they will be updated when saved
      };

      updatedSteps = documentationSteps.map(step =>
        step.id === existingWorkflowDiagram.id ? workflowStep : step
      );

      toast.success(t('toast.workflowUpdated'));
    } else {
      // Create new workflow diagram
      logger.log('📝 Creating new workflow diagram step with', nodes.length, 'nodes and', edges.length, 'edges');

      workflowStep = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        title: 'Auto-Generated Flow',
        description: 'Auto-generated workflow diagram from step titles',
        actionType: 'diagram',
        type: 'diagram',
        isGenerated: true,
        diagramElements: [...nodes, ...edges],
        diagramAppState: { viewport: { x: 0, y: 0, zoom: 0.8 } },
        diagramJsonPath: undefined,
        diagramImagePath: undefined
      };

      updatedSteps = [...documentationSteps, workflowStep];
      toast.success(t('toast.workflowCreated'));
    }

    setDocumentationSteps(updatedSteps);

    if (currentRecording) {
      updateRecording(currentRecording.id, {
        documentationSteps: updatedSteps
      });
    }

    if (currentProject) {
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          documentationSteps: updatedSteps
        }
      };
      updateProject(currentProject.id, updatedProject);
    }

    setEditingFlow(workflowStep);
    setShowFlowEditor(true);
    setForceUpdate(prev => prev + 1);
  };

  // Handle React Flow diagram save
  const handleFlowDiagramSave = async (diagramData: {
    id: string;
    title: string;
    jsonPath: string;
    imagePath: string;
    elements: any[];
    appState: any;
  }) => {
    if (!currentProject) {
      alert('No project selected');
      return;
    }

    if (!editingFlow) {
      logger.error('❌ No editing flow found');
      return;
    }

    try {
      const updatedStepData: DocumentationStep = {
        ...editingFlow,
        title: diagramData.title || editingFlow.title,
        description: editingFlow.description,
        diagramJsonPath: diagramData.jsonPath,
        diagramImagePath: diagramData.imagePath,
        diagramElements: diagramData.elements,
        diagramAppState: diagramData.appState
      };

      logger.log('📝 Updating existing diagram step:', updatedStepData);

      const updatedSteps = documentationSteps.map(step =>
        step.id === editingFlow.id ? updatedStepData : step
      );

      setDocumentationSteps(updatedSteps);

      if (currentRecording) {
        updateRecording(currentRecording.id, {
          documentationSteps: updatedSteps
        });
      }

      if (currentProject) {
        const updatedProject = {
          ...currentProject,
          metadata: {
            ...currentProject.metadata,
            documentationSteps: updatedSteps
          }
        };
        updateProject(currentProject.id, updatedProject);
      }

      setForceUpdate(prev => prev + 1);
      setShowFlowEditor(false);
      setEditingFlow(null);
    } catch (error) {
      logger.error('Failed to save diagram:', error);
      alert('Failed to save diagram. Please try again.');
    }
  };

  const updateStep = (stepId: string, updates: Partial<DocumentationStep>) => {
    // Use functional state update to get the latest state and avoid closure issues
    setDocumentationSteps(prev => {
      const updatedSteps = prev.map(step =>
        step.id === stepId ? { ...step, ...updates } : step
      );

      // Save changes to the recording with the updated steps
      // CRITICAL FIX: Get fresh recording from store to avoid stale closure data
      if (currentRecording) {
        const { recordings } = useAppStore.getState();
        const freshRecording = recordings.find(r => r.id === currentRecording.id);
        if (freshRecording) {
          updateRecording(freshRecording.id, {
            ...freshRecording,
            documentationSteps: updatedSteps
          });
        }
      }

      return updatedSteps;
    });

    // Save changes to project metadata for persistence
    if (currentProject) {
      // CRITICAL FIX: Get fresh project from store to avoid stale closure data
      const { projects } = useAppStore.getState();
      const freshProject = projects.find(p => p.id === currentProject.id);

      if (!freshProject) {
        logger.error('Could not find fresh project in store!');
        return;
      }

      // Update documentationSteps in project metadata using FRESH data
      const updatedDocumentationSteps = (freshProject.metadata?.documentationSteps || []).map(step =>
        step.id === stepId
          ? { ...step, ...updates }
          : step
      );

      // If updating description, also update the corresponding screenshot's description
      let updatedScreenshots = freshProject.metadata?.screenshots;
      if (updates.description && updatedScreenshots) {
        updatedScreenshots = updatedScreenshots.map(screenshot =>
          screenshot.id === stepId
            ? { ...screenshot, description: updates.description }
            : screenshot
        );
      }

      const updatedProject = {
        ...freshProject,
        metadata: {
          ...freshProject.metadata,
          screenshots: updatedScreenshots,
          documentationSteps: updatedDocumentationSteps
        }
      };

      updateProject(currentProject.id, updatedProject);
    }

    // Removed setForceUpdate to prevent input focus loss during editing
  };

  const replaceStepScreenshot = async (stepId: string) => {
    if (!videoEditorRef.current || !currentProject) return;

    try {
      const imageData = await videoEditorRef.current.extractCurrentFrame();
      if (!imageData) {
        toast.error(t('toast.frameCaptureFailed'));
        return;
      }

      // Save new screenshot to disk
      const filename = `replaced_step_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
      const saveResult = await window.electronAPI.saveProjectScreenshot(
        currentProject.name,
        filename,
        imageData
      );

      if (!saveResult?.relativePath) {
        toast.error(t('toast.saveReplacementFailed'));
        return;
      }

      // Update the screenshot in local state
      setScreenshots((prev: any[]) =>
        prev.map((s: any) =>
          s.id === stepId ? { ...s, imageData, filePath: saveResult.relativePath } : s
        )
      );

      // Update documentation step with new screenshot path
      updateStep(stepId, { screenshot: saveResult.relativePath });

      // Update project metadata screenshots
      const { projects } = useAppStore.getState();
      const freshProject = projects.find(p => p.id === currentProject.id);
      if (freshProject) {
        const updatedScreenshots = (freshProject.metadata?.screenshots || []).map((s: any) =>
          s.id === stepId ? { ...s, imageData, filePath: saveResult.relativePath } : s
        );
        updateProject(currentProject.id, {
          metadata: { ...freshProject.metadata, screenshots: updatedScreenshots }
        });
      }

      // Cache for instant thumbnail update
      savedScreenshotCacheRef.current[stepId] = imageData;

      // Clear secure URL cache so it reloads from new file
      setSecureScreenshotUrls(prev => {
        const updated = { ...prev };
        delete updated[stepId];
        return updated;
      });

      setForceUpdate(prev => prev + 1);
      toast.success(t('toast.screenshotReplaced'));
    } catch (error) {
      logger.error('Failed to replace screenshot:', error);
      toast.error(t('toast.replaceFailed'));
    }
  };

  const openRetakeSourcePicker = async (stepId: string) => {
    if (!window.electronAPI?.getRetakeSources) return;
    try {
      const result = await window.electronAPI.getRetakeSources();
      if (!result.success || !result.sources.length) {
        toast.error(t('toast.noCaptureSources'));
        return;
      }
      // Filter out overlay apps on the renderer side
      const filtered = result.sources.filter((s) => {
        const name = s.name.toLowerCase();
        const exclude = ['nvidia', 'geforce', 'amd radeon', 'shadowplay', 'rtss', 'discord overlay', 'steam overlay', 'xbox game bar'];
        return !exclude.some(p => name.includes(p));
      });
      setRetakeSources(filtered);
      setRetakingStepId(stepId);
    } catch (error) {
      logger.error('Failed to load sources for retake:', error);
      toast.error(t('toast.captureSourcesFailed'));
    }
  };

  const retakeStepScreenshot = async (sourceId: string) => {
    if (!retakingStepId || !currentProject) return;
    const stepId = retakingStepId;

    try {
      setRetakingStepId(null);
      setRetakeSources([]);

      const result = await window.electronAPI.captureSourceScreenshot(sourceId);
      if (!result.success || !result.imageData) {
        toast.error(result.error || t('toast.captureFailed'));
        return;
      }

      // Save to disk
      const filename = `retake_step_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
      const saveResult = await window.electronAPI.saveProjectScreenshot(
        currentProject.name,
        filename,
        result.imageData
      );

      if (!saveResult?.relativePath) {
        toast.error(t('toast.saveReplacementFailed'));
        return;
      }

      // Update screenshot in local state
      setScreenshots((prev: any[]) =>
        prev.map((s: any) =>
          s.id === stepId ? { ...s, imageData: result.imageData, filePath: saveResult.relativePath } : s
        )
      );

      // Update documentation step
      updateStep(stepId, { screenshot: saveResult.relativePath });

      // Update project metadata
      const { projects } = useAppStore.getState();
      const freshProject = projects.find(p => p.id === currentProject.id);
      if (freshProject) {
        const updatedScreenshots = (freshProject.metadata?.screenshots || []).map((s: any) =>
          s.id === stepId ? { ...s, imageData: result.imageData, filePath: saveResult.relativePath } : s
        );
        updateProject(currentProject.id, {
          metadata: { ...freshProject.metadata, screenshots: updatedScreenshots }
        });
      }

      // Cache for instant thumbnail update
      savedScreenshotCacheRef.current[stepId] = result.imageData;
      setSecureScreenshotUrls(prev => {
        const updated = { ...prev };
        delete updated[stepId];
        return updated;
      });

      setForceUpdate(prev => prev + 1);
      toast.success(t('toast.retakeSuccess'));
    } catch (error) {
      logger.error('Failed to retake screenshot:', error);
      toast.error(t('toast.retakeFailed'));
    }
  };

  const deleteStep = async (stepId: string) => {
    // Find the step being deleted to check its type
    const stepToDelete = documentationSteps.find(step => step.id === stepId);
    
    const updatedSteps = documentationSteps.filter(step => step.id !== stepId);
    setDocumentationSteps(updatedSteps);
    
    // Also remove the corresponding screenshot from project metadata
    if (currentProject && currentProject.metadata?.screenshots) {
      // Find the screenshot to get its filename before deleting
      const screenshotToDelete = currentProject.metadata.screenshots.find(screenshot => screenshot.id === stepId);
      
      const updatedScreenshots = currentProject.metadata.screenshots.filter(screenshot => screenshot.id !== stepId);
      
      // CRITICAL FIX: Also remove the step from project metadata documentationSteps
      // to prevent useEffect hooks from re-adding it
      const updatedDocumentationSteps = (currentProject.metadata.documentationSteps || []).filter(step => step.id !== stepId);
      
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          screenshots: updatedScreenshots,
          documentationSteps: updatedDocumentationSteps,
          actionCount: updatedScreenshots.length // Update actionCount to reflect actual screenshot count
        }
      };
      updateProject(currentProject.id, updatedProject);
      
      // Delete the screenshot file from disk
      if (screenshotToDelete && screenshotToDelete.filePath) {
        try {
          const fileName = screenshotToDelete.filePath.split(/[\\/]/).pop();
          if (fileName) {
            await window.electronAPI.deleteProjectScreenshot(currentProject.name, fileName);
            logger.log(`Deleted screenshot file: ${fileName}`);
          }
        } catch (error) {
          logger.error('Failed to delete screenshot file:', error);
        }
      }
      
      // Update local screenshots state
      setScreenshots(updatedScreenshots);
    }
    
    // Save changes to the recording
    if (currentRecording) {
      updateRecording(currentRecording.id, {
        ...currentRecording,
        documentationSteps: updatedSteps
      });
    }
    
    // Handle diagram step deletion - delete both JSON and PNG files
    if (stepToDelete && stepToDelete.type === 'diagram' && currentProject) {
      try {
        // Delete diagram JSON file
        if (stepToDelete.diagramJsonPath) {
          const jsonFileName = stepToDelete.diagramJsonPath.split(/[\\/]/).pop();
          if (jsonFileName) {
            await window.electronAPI.deleteDiagramFile(currentProject.name, jsonFileName);
            logger.log(`Deleted diagram JSON file: ${jsonFileName}`);
          }
        } else {
          // Fallback: construct filename from step ID
          const jsonFileName = `step-${stepId}.json`;
          await window.electronAPI.deleteDiagramFile(currentProject.name, jsonFileName);
          logger.log(`Deleted diagram JSON file: ${jsonFileName}`);
        }
        
        // Delete diagram PNG file
        if (stepToDelete.diagramImagePath) {
          const pngFileName = stepToDelete.diagramImagePath.split(/[\\/]/).pop();
          if (pngFileName) {
            await window.electronAPI.deleteDiagramFile(currentProject.name, pngFileName);
            logger.log(`Deleted diagram PNG file: ${pngFileName}`);
          }
        } else {
          // Fallback: construct filename from step ID
          const pngFileName = `step-${stepId}.png`;
          await window.electronAPI.deleteDiagramFile(currentProject.name, pngFileName);
          logger.log(`Deleted diagram PNG file: ${pngFileName}`);
        }
      } catch (error) {
        logger.error('Failed to delete diagram files:', error);
      }
      
      // Clean up secureDiagramUrls state to prevent UI errors
      setSecureDiagramUrls(prevUrls => {
        const updatedUrls = { ...prevUrls };
        delete updatedUrls[stepId];
        logger.log(`Cleaned up secure diagram URL for step: ${stepId}`);
        return updatedUrls;
      });
    }
    
    const successMessage = stepToDelete?.type === 'diagram'
      ? t('toast.diagramDeleted')
      : t('toast.stepDeleted');
    toast.success(successMessage);
  };

  const bulkDeleteSteps = async () => {
    if (selectedStepIds.size === 0) return;
    const count = selectedStepIds.size;
    const idsToDelete = new Set(selectedStepIds);

    // Prevent sync effects from repopulating deleted steps
    isBulkDeletingRef.current = true;

    // Collect steps to delete for file cleanup
    const stepsToDelete = documentationSteps.filter(step => idsToDelete.has(step.id));

    // Batch update: filter out all selected steps at once
    const updatedSteps = documentationSteps.filter(step => !idsToDelete.has(step.id));
    setDocumentationSteps(updatedSteps);

    // Update project metadata in one operation
    if (currentProject) {
      const updatedScreenshots = (currentProject.metadata?.screenshots || []).filter(s => !idsToDelete.has(s.id));
      const updatedDocSteps = (currentProject.metadata?.documentationSteps || []).filter(s => !idsToDelete.has(s.id));

      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          screenshots: updatedScreenshots,
          documentationSteps: updatedDocSteps,
          actionCount: updatedScreenshots.length
        }
      };
      updateProject(currentProject.id, updatedProject);
      setScreenshots(updatedScreenshots);
    }

    // Update recording in one operation
    if (currentRecording) {
      updateRecording(currentRecording.id, {
        ...currentRecording,
        documentationSteps: updatedSteps
      });
    }

    // Delete files from disk (can run in parallel)
    const fileDeletePromises: Promise<void>[] = [];
    for (const step of stepsToDelete) {
      // Delete screenshot files
      if (currentProject) {
        const screenshot = currentProject.metadata?.screenshots?.find(s => s.id === step.id);
        if (screenshot?.filePath) {
          const fileName = screenshot.filePath.split(/[\\/]/).pop();
          if (fileName) {
            fileDeletePromises.push(
              window.electronAPI.deleteProjectScreenshot(currentProject.name, fileName)
                .then(() => logger.log(`Deleted screenshot file: ${fileName}`))
                .catch(err => logger.error('Failed to delete screenshot file:', err))
            );
          }
        }

        // Delete diagram files
        if (step.type === 'diagram') {
          const jsonFile = step.diagramJsonPath?.split(/[\\/]/).pop() || `step-${step.id}.json`;
          const pngFile = step.diagramImagePath?.split(/[\\/]/).pop() || `step-${step.id}.png`;
          fileDeletePromises.push(
            window.electronAPI.deleteDiagramFile(currentProject.name, jsonFile)
              .then(() => logger.log(`Deleted diagram JSON: ${jsonFile}`))
              .catch(err => logger.error('Failed to delete diagram file:', err))
          );
          fileDeletePromises.push(
            window.electronAPI.deleteDiagramFile(currentProject.name, pngFile)
              .then(() => logger.log(`Deleted diagram PNG: ${pngFile}`))
              .catch(err => logger.error('Failed to delete diagram file:', err))
          );

          // Clean up secure diagram URLs
          setSecureDiagramUrls(prevUrls => {
            const updatedUrls = { ...prevUrls };
            delete updatedUrls[step.id];
            return updatedUrls;
          });
        }
      }
    }

    await Promise.all(fileDeletePromises);

    setSelectedStepIds(new Set());
    setBulkSelectMode(false);
    toast.success(t('toast.stepsDeleted', { count }));

    // Allow sync effects to resume after React has processed all state updates
    setTimeout(() => {
      isBulkDeletingRef.current = false;
    }, 500);
  };

  const toggleStepSelection = (stepId: string) => {
    setSelectedStepIds(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedStepIds.size === documentationSteps.length) {
      setSelectedStepIds(new Set());
    } else {
      setSelectedStepIds(new Set(documentationSteps.map(s => s.id)));
    }
  };

  const reorderSteps = (draggedId: string, targetId: string) => {
    logger.log('🔄 Reordering steps:', { draggedId, targetId });

    // Find indices in documentationSteps array (which is our source of truth for order)
    const draggedIndex = documentationSteps.findIndex(step => step.id === draggedId);
    const targetIndex = documentationSteps.findIndex(step => step.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      logger.log('❌ Invalid indices:', { draggedIndex, targetIndex });
      return;
    }

    logger.log('📊 Before reorder:', documentationSteps.map(s => ({ id: s.id, title: s.title, type: s.type })));

    // Set flag to prevent useEffect from overriding our manual updates
    isReorderingRef.current = true;
    logger.log('🚩 Set reordering flag to true');

    // Reorder documentationSteps array
    const newDocSteps = [...documentationSteps];
    const [draggedStep] = newDocSteps.splice(draggedIndex, 1);
    newDocSteps.splice(targetIndex, 0, draggedStep);

    logger.log('📊 After reorder:', newDocSteps.map(s => ({ id: s.id, title: s.title, type: s.type })));

    // Update documentationSteps
    setDocumentationSteps(newDocSteps);

    // Also rebuild screenshots array to match the new documentationSteps order
    const screenshotMap = new Map(screenshots?.map((s: any) => [s.id, s]) || []);
    const newScreenshots: any[] = [];

    newDocSteps.forEach((docStep) => {
      const screenshot = screenshotMap.get(docStep.id);
      if (screenshot) {
        newScreenshots.push(screenshot);
      }
    });

    logger.log('📝 New screenshots order:', newScreenshots.map((s: any) => ({ id: s.id, description: s.description })));

    // Update screenshots array
    if (newScreenshots.length > 0) {
      // Update project metadata FIRST to ensure persistence
      if (currentProject) {
        const updatedProject = {
          ...currentProject,
          metadata: {
            ...currentProject.metadata,
            screenshots: newScreenshots,
            documentationSteps: newDocSteps
          }
        };
        updateProject(currentProject.id, updatedProject);
        logger.log('💾 Updated project metadata');
      }

      // Update local screenshots state
      setScreenshots([...newScreenshots]);
      logger.log('✅ Updated local screenshots state');

      // Force re-render
      setForceUpdate(prev => prev + 1);
    }
    
    // Save changes to the recording
    if (currentRecording) {
      updateRecording(currentRecording.id, {
        ...currentRecording,
        documentationSteps: newDocSteps
      });
      logger.log('💾 Updated recording');
    }
    
    // Reset the flag after a longer delay to ensure all updates complete
    setTimeout(() => {
      isReorderingRef.current = false;
      logger.log('🚩 Reset reordering flag to false');
    }, 200);
    
    toast.success(t('toast.stepsReordered'));
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    const currentIndex = documentationSteps.findIndex(step => step.id === stepId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= documentationSteps.length) return;
    const targetId = documentationSteps[targetIndex].id;
    reorderSteps(stepId, targetId);
  };

  const handleDragStart = (e: React.DragEvent, stepId: string) => {
    setDraggedStep(stepId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stepId: string) => {
    e.preventDefault();
    // Show 'copy' cursor for external file drops, 'move' for internal reorder
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'move';
    }
    setDragOverStep(stepId);
  };

  const handleDragLeave = () => {
    setDragOverStep(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();

    // Check for external file drop FIRST
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleExternalFileDrop(files, targetId);
      setDragOverStep(null);
      return;
    }

    // Existing internal reorder logic
    if (draggedStep && draggedStep !== targetId) {
      reorderSteps(draggedStep, targetId);
    }
    setDraggedStep(null);
    setDragOverStep(null);
  };

  const handleDragEnd = () => {
    setDraggedStep(null);
    setDragOverStep(null);
  };

  // --- External file drop support (images & video clips) ---

  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
  const MAX_VIDEO_SIZE_MB = 100;

  const handleExternalFileDrop = async (files: FileList, targetStepId: string) => {
    const file = files[0];
    if (!file) return;

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      toast.error(t('toast.unsupportedFile'));
      return;
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      toast.error(t('toast.videoTooLarge', { max: MAX_VIDEO_SIZE_MB }));
      return;
    }

    if (!currentProject) {
      toast.error(t('toast.noActiveProject'));
      return;
    }

    if (isImage) {
      await handleExternalImageDrop(file, targetStepId);
    } else {
      await handleExternalVideoDrop(file, targetStepId);
    }
  };

  const handleExternalImageDrop = async (file: File, targetStepId: string) => {
    const projectName = currentProject!.name;
    const filename = `screenshot_dropped_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    try {
      // Read file as base64 using a promise-based approach (no callback race conditions)
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const result = await window.electronAPI.saveProjectScreenshot(projectName, filename, base64Data);
      if (!result || !result.filePath) {
        toast.error(t('toast.saveImageFailed'));
        return;
      }

      // Update the target documentation step
      updateStep(targetStepId, {
        screenshot: base64Data,
        mediaType: 'image',
        videoClipPath: undefined,
        videoClipMimeType: undefined,
      });

      // Update local screenshots state directly with filePath for persistence
      setScreenshots(prev => prev.map(s =>
        s.id === targetStepId
          ? { ...s, imageData: base64Data, filePath: result.filePath, mediaType: 'image' as const, videoClipPath: undefined, videoClipMimeType: undefined }
          : s
      ));

      // Update the screenshot entry in project metadata
      if (currentProject) {
        const { projects } = useAppStore.getState();
        const freshProject = projects.find(p => p.id === currentProject.id);
        if (freshProject) {
          const updatedScreenshots = (freshProject.metadata?.screenshots || []).map(s =>
            s.id === targetStepId
              ? { ...s, imageData: base64Data, filePath: result.filePath, mediaType: 'image' as const, videoClipPath: undefined, videoClipMimeType: undefined }
              : s
          );
          updateProject(currentProject.id, {
            ...freshProject,
            metadata: { ...freshProject.metadata, screenshots: updatedScreenshots }
          });
        }
      }

      // Update secure URL cache
      setSecureScreenshotUrls(prev => ({ ...prev, [targetStepId]: base64Data }));
      setSelectedScreenshot(base64Data);
      setSelectedVideoUrl(null);
      setForceUpdate(prev => prev + 1);
      toast.success(t('toast.imageAdded'));
    } catch (error) {
      logger.error('Failed to save dropped image:', error);
      toast.error(t('toast.saveImageFailed'));
    }
  };

  const generateVideoThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const url = URL.createObjectURL(file);
      video.src = url;
      video.currentTime = 0.5;
      video.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, 160, 120);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('');
      };
    });
  };

  const handleExternalVideoDrop = async (file: File, targetStepId: string) => {
    const projectName = currentProject!.name;
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `clip_${Date.now()}_${sanitizedName}`;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.electronAPI.saveProjectUpload(projectName, filename, arrayBuffer);
      if (!result.success) {
        toast.error(t('toast.saveVideoFailed'));
        return;
      }

      // Generate thumbnail from video
      const thumbnail = await generateVideoThumbnail(file);

      // Update the step with video data
      // IPC returns { path (absolute), relativePath } — NOT filePath
      const savedPath = result.path || result.relativePath || `uploads/${filename}`;
      updateStep(targetStepId, {
        videoClipPath: savedPath,
        videoClipMimeType: file.type,
        mediaType: 'video',
        actionType: 'video',
        screenshot: thumbnail || undefined, // Use thumbnail as the screenshot preview
      });

      // Get secure URL for video playback
      if (savedPath) {
        try {
          const videoUrl = await getSecureVideoUrl(savedPath);
          if (videoUrl) {
            setSecureVideoUrls(prev => ({ ...prev, [targetStepId]: videoUrl }));
            setSelectedVideoUrl(videoUrl);
            setSelectedScreenshot(null);
          }
        } catch {
          logger.warn('Could not get secure video URL, will try on click');
        }
      }

      setForceUpdate(prev => prev + 1);
      toast.success(t('toast.videoClipAdded'));
    } catch (error) {
      logger.error('Failed to save video clip:', error);
      toast.error(t('toast.saveVideoFailed'));
    }
  };

  const handleExternalFileDropAsNewStep = async (files: FileList) => {
    const file = files[0];
    if (!file || !currentProject) return;

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      toast.error(t('toast.unsupportedFileShort'));
      return;
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      toast.error(t('toast.videoTooLarge', { max: MAX_VIDEO_SIZE_MB }));
      return;
    }

    const newStepId = `dropped-${Date.now()}`;

    if (isImage) {
      // For images: save file FIRST, then create step with filePath already set
      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        const projectName = currentProject.name;
        const filename = `screenshot_dropped_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const result = await window.electronAPI.saveProjectScreenshot(projectName, filename, base64Data);
        if (!result || !result.filePath) {
          toast.error(t('toast.saveImageFailed'));
          return;
        }

        // Now create step and screenshot entries with filePath already set
        const newStep: DocumentationStep = {
          id: newStepId,
          timestamp: Date.now(),
          title: 'New Step',
          description: `Added from: ${file.name}`,
          actionType: 'click',
          isGenerated: false,
          mediaType: 'image',
          screenshot: base64Data,
        };
        const newScreenshot = {
          id: newStepId,
          timestamp: Date.now(),
          clickX: 0,
          clickY: 0,
          description: file.name,
          mediaType: 'image' as const,
          imageData: base64Data,
          filePath: result.filePath,
        };

        // Update all state atomically — compute full arrays for both local state and project metadata
        const newSteps = [...documentationSteps, newStep];
        const newScreenshots = [...screenshots, newScreenshot];
        setDocumentationSteps(newSteps);
        setScreenshots(newScreenshots);

        // Persist to project — use full arrays (not appending to project metadata which may be incomplete)
        const { projects } = useAppStore.getState();
        const freshProject = projects.find(p => p.id === currentProject.id);
        if (freshProject) {
          updateProject(currentProject.id, {
            ...freshProject,
            metadata: {
              ...freshProject.metadata,
              screenshots: newScreenshots,
              documentationSteps: newSteps,
            }
          });
        }
        if (currentRecording) {
          // CRITICAL FIX: Get fresh recording from store to avoid stale closure data
          const { recordings } = useAppStore.getState();
          const freshRecording = recordings.find(r => r.id === currentRecording.id);
          if (freshRecording) {
            updateRecording(freshRecording.id, {
              ...freshRecording,
              documentationSteps: newSteps
            });
          }
        }

        // Update caches and selection
        setSecureScreenshotUrls(prev => ({ ...prev, [newStepId]: base64Data }));
        setSelectedScreenshot(base64Data);
        setSelectedVideoUrl(null);
        setForceUpdate(prev => prev + 1);
        toast.success(t('toast.imageAdded'));
      } catch (error) {
        logger.error('Failed to add image step:', error);
        toast.error(t('toast.addImageStepFailed'));
      }
    } else {
      // For video: create step first, then handle video content
      const newStep: DocumentationStep = {
        id: newStepId,
        timestamp: Date.now(),
        title: 'Video Step',
        description: `Added from: ${file.name}`,
        actionType: 'video',
        isGenerated: false,
        mediaType: 'video',
      };
      const newScreenshot = {
        id: newStepId,
        timestamp: Date.now(),
        clickX: 0,
        clickY: 0,
        description: file.name,
        mediaType: 'video' as const,
      };

      // Update all state atomically — compute full arrays for both local state and project metadata
      const newSteps = [...documentationSteps, newStep];
      const newScreenshots = [...screenshots, newScreenshot];
      setDocumentationSteps(newSteps);
      setScreenshots(newScreenshots);

      // Persist to project — use full arrays (not appending to project metadata which may be incomplete)
      const { projects } = useAppStore.getState();
      const freshProject = projects.find(p => p.id === currentProject.id);
      if (freshProject) {
        updateProject(currentProject.id, {
          ...freshProject,
          metadata: {
            ...freshProject.metadata,
            screenshots: newScreenshots,
            documentationSteps: newSteps,
          }
        });
      }
      if (currentRecording) {
        // CRITICAL FIX: Get fresh recording from store to avoid stale closure data
        const { recordings: recs } = useAppStore.getState();
        const freshRec = recs.find(r => r.id === currentRecording.id);
        if (freshRec) {
          updateRecording(freshRec.id, {
            ...freshRec,
            documentationSteps: newSteps
          });
        }
      }

      await handleExternalVideoDrop(file, newStepId);
    }
  };

  // Convert a data: URL to a blob: URL (CSP blocks data: for media-src but allows blob:)
  const dataUrlToBlobUrl = (dataUrl: string): string => {
    const [header, base64Data] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
    const byteString = atob(base64Data);
    const uint8Array = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([uint8Array], { type: mimeType }));
  };

  const getSecureVideoUrl = async (videoClipPath: string): Promise<string | null> => {
    if (!videoClipPath || !currentProject) return null;
    try {
      let url: string | null = null;
      // If the path looks absolute (contains drive letter or starts with /), use it directly
      const isAbsolute = /^[a-zA-Z]:/.test(videoClipPath) || videoClipPath.startsWith('/');
      if (isAbsolute) {
        url = await window.electronAPI.getFileUrl(videoClipPath);
      } else {
        // Otherwise resolve relative path through project
        const absPath = await window.electronAPI.getProjectFilePath(currentProject.name, videoClipPath);
        if (absPath) {
          url = await window.electronAPI.getFileUrl(absPath);
        }
      }
      if (url) {
        // Fix incorrect MIME type from getFileUrl which may return data:image/jpeg for video files
        if (url.startsWith('data:image/') && videoClipPath.match(/\.(mp4|webm|mov)$/i)) {
          const ext = videoClipPath.match(/\.(mp4|webm|mov)$/i)?.[1]?.toLowerCase();
          const mimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
          const correctMime = mimeMap[ext || 'mp4'] || 'video/mp4';
          url = url.replace(/^data:image\/[^;]+/, `data:${correctMime}`);
        }
        // CSP blocks data: URLs for media-src — convert to blob: URL which is allowed
        if (url.startsWith('data:')) {
          url = dataUrlToBlobUrl(url);
        }
        return url;
      }
    } catch (error) {
      logger.error('Failed to get secure video URL:', error);
    }
    return null;
  };

  const saveProjectSettings = () => {
    if (currentProject) {
      updateProject(currentProject.id, {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          projectTitle: projectTitle,
          projectSource: projectSource
        }
      });
    } else if (currentRecording) {
      updateRecording(currentRecording.id, {
        ...currentRecording,
        metadata: {
          ...currentRecording.metadata,
          projectTitle: projectTitle,
          projectSource: projectSource
        }
      });
    }
  };

  // Auto-save project settings when they change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveProjectSettings();
    }, 1000); // Save after 1 second of no changes

    return () => clearTimeout(timeoutId);
  }, [projectTitle, projectSource]);

  // Removed problematic useEffect that was causing race conditions with immediate UI updates

  const handleEditScreenshot = (screenshot: {id: string, imageData: string}) => {
    logger.log(' handleEditScreenshot called with:', {
      id: screenshot.id,
      imageDataLength: screenshot.imageData?.length,
      imageDataType: screenshot.imageData?.startsWith('data:') ? 'base64' : 'url'
    });
    
    setEditingScreenshot(screenshot);
    setShowImageEditor(true);
    
    logger.log(' State updated - showImageEditor should be true, editingScreenshot:', screenshot.id);
  };

  const handleDeleteScreenshot = async (screenshotId: string) => {
    if (!currentProject) {
      toast.error(t('toast.noProjectSelected'));
      return;
    }

    try {
      // Find the screenshot to get its filename
      const screenshotToDelete = currentProject.metadata?.screenshots?.find(screenshot => screenshot.id === screenshotId);
      
      if (screenshotToDelete?.filePath) {
        // Extract filename from path
        const fileName = screenshotToDelete.filePath.replace(/.*[\/\\]/, '');
        
        // Delete the file from disk
        await window.electronAPI.deleteProjectScreenshot(currentProject.name, fileName);
      }

      // Remove from project metadata
      const updatedScreenshots = currentProject.metadata?.screenshots?.filter(screenshot => screenshot.id !== screenshotId) || [];
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          screenshots: updatedScreenshots
        }
      };

      // Update states
      setScreenshots(prev => prev.filter(screenshot => screenshot.id !== screenshotId));
      setDocumentationSteps(prev => prev.filter(step => step.id !== screenshotId));
      
      // Clear selected screenshot if it was the deleted one
      if (selectedScreenshot && screenshotToDelete?.imageData === selectedScreenshot) {
        setSelectedScreenshot(null);
      }

      // Update project in store
      updateProject(currentProject.id, updatedProject);

      // Update recording if exists
      if (currentRecording) {
        const updatedSteps = documentationSteps.filter(step => step.id !== screenshotId);
        const updatedRecording = {
          ...currentRecording,
          documentationSteps: updatedSteps
        };
        updateRecording(currentRecording.id, updatedRecording);
      }

      toast.success(t('toast.screenshotDeleted'));
    } catch (error) {
      logger.error('Error deleting screenshot:', error);
      toast.error(t('toast.deleteScreenshotFailed'));
    }
  };

  const handleCreateDocumentation = () => {
    // Get the video file path from either navigation state or current recording
    const videoPath = videoFilePath || currentRecording?.filePath;
    
    if (!videoPath) {
      toast.error(t('toast.noVideoForDoc'));
      return;
    }
    
    // Navigate to documentation wizard with video file
    navigate('/documentation-wizard', {
      state: {
        videoFile: videoPath,
        recordingId: recordingId || currentRecording?.id,
        projectTitle: projectTitle,
        projectSource: projectSource,
        duration: recordingDuration || duration,
        documentationSteps: documentationSteps
      }
    });
  };

  const getStepInfoForScreenshot = (screenshotId: string) => {
    logger.log(' [STEP-DEBUG] getStepInfoForScreenshot called with:', {
      screenshotId,
      documentationStepsLength: documentationSteps.length,
      documentationSteps: documentationSteps.map(s => ({ id: s.id, title: s.title, description: s.description })),
      projectMetadataSteps: currentProject?.metadata?.documentationSteps?.map(s => ({ id: s.id, title: s.title, description: s.description })) || [],
      projectMetadataStepsLength: currentProject?.metadata?.documentationSteps?.length || 0
    });

    // Helper: get screenshot description as fallback
    const screenshotDesc = screenshots?.find((s: any) => s.id === screenshotId)?.description
      || currentProject?.metadata?.screenshots?.find(s => s.id === screenshotId)?.description
      || '';

    // Find step by matching the step ID with the screenshot ID in local state
    let step = documentationSteps.find(step => step.id === screenshotId);
    if (step) {
      logger.log(' [STEP-DEBUG] Found step by ID in local state:', { id: step.id, title: step.title, description: step.description });
      return {
        title: step.title,
        description: step.description || screenshotDesc,
        actionType: step.actionType
      };
    }

    // If not found in local state, try project metadata directly
    const projectStep = currentProject?.metadata?.documentationSteps?.find(step => step.id === screenshotId);
    if (projectStep) {
      logger.log(' [STEP-DEBUG] Found step by ID in project metadata:', projectStep);
      return {
        title: projectStep.title,
        description: projectStep.description || screenshotDesc,
        actionType: projectStep.actionType
      };
    }

    // If no direct match, try to find by index (fallback for inconsistent ID formats)
    if (currentProject?.metadata?.screenshots) {
      const screenshotIndex = currentProject.metadata.screenshots.findIndex(s => s.id === screenshotId);
      if (screenshotIndex !== -1 && screenshotIndex < documentationSteps.length) {
        step = documentationSteps[screenshotIndex];
        logger.log(' [STEP-DEBUG] Found step by index in local state:', step);
        return {
          title: step.title,
          description: step.description || screenshotDesc,
          actionType: step.actionType
        };
      }

      // Try project metadata by index as fallback
      if (screenshotIndex !== -1 && screenshotIndex < (currentProject?.metadata?.documentationSteps?.length || 0)) {
        const projectStepByIndex = currentProject.metadata.documentationSteps[screenshotIndex];
        logger.log(' [STEP-DEBUG] Found step by index in project metadata:', projectStepByIndex);
        return {
          title: projectStepByIndex.title,
          description: projectStepByIndex.description || screenshotDesc,
          actionType: projectStepByIndex.actionType
        };
      }
    }

    logger.log(' [STEP-DEBUG] No step found for screenshot:', screenshotId);
    return undefined;
  };

  const handleSaveEditedScreenshot = async (editedImageData: string, stepInfo?: { title: string; description: string; actionType: string }, keepOpen?: boolean) => {
    if (!editingScreenshot || !currentProject) {
      return;
    }

    // CRITICAL: Cache in ref FIRST (synchronous, immune to React batching/timing)
    // This guarantees the thumbnail has image data on the very next render.
    savedScreenshotCacheRef.current[editingScreenshot.id] = editedImageData;

    // Save edited screenshot to disk file (replaces base64 storage)
    try {
      // Find the screenshot in metadata to get its filePath
      const screenshot = currentProject.metadata?.screenshots?.find(s => s.id === editingScreenshot.id);
      const fileName = screenshot?.filePath?.split(/[\/\\]/).pop() || `screenshot-${editingScreenshot.id}.jpg`;
      logger.log(` Saving edited screenshot to disk: ${fileName}`);

      await window.electronAPI.ipcInvoke('save-project-screenshot',
        currentProject.name,
        fileName,
        editedImageData
      );

      logger.log(` Edited screenshot saved to disk: ${fileName}`);
    } catch (error) {
      logger.error(' Failed to save edited screenshot to disk:', error);
      // Continue anyway - the imageData will be in memory for this session
    }

    // Update the screenshot in the project's metadata
    // CRITICAL: Include editedImageData so that any state sync from project metadata
    // preserves the thumbnail. The partialize function will strip imageData for disk persistence.
    const updatedScreenshots = currentProject.metadata?.screenshots?.map(screenshot =>
      screenshot.id === editingScreenshot.id
        ? {
            ...screenshot,
            imageData: editedImageData,
            description: stepInfo?.description || screenshot.description
          }
        : screenshot
    ) || [];

    // Update documentation steps - combine both step info updates and screenshot updates
    let updatedSteps = [...documentationSteps];
    
    // Find and update the step if stepInfo is provided
    if (stepInfo) {
      // Find step by matching the step ID with the screenshot ID
      let stepIndex = updatedSteps.findIndex(step => step.id === editingScreenshot.id);

      // If no direct match, try to find by index (fallback for inconsistent ID formats)
      if (stepIndex === -1) {
        const screenshotIndex = currentProject.metadata?.screenshots?.findIndex(s => s.id === editingScreenshot.id) ?? -1;
        if (screenshotIndex !== -1 && screenshotIndex < updatedSteps.length) {
          stepIndex = screenshotIndex;
        }
      }

      if (stepIndex !== -1) {
        // Preserve existing description if editor sends empty/whitespace-only content
        const isDescriptionEmpty = !stepInfo.description || stepInfo.description.trim() === '' || stepInfo.description === '<p><br></p>';
        const existingDesc = updatedSteps[stepIndex].description
          || screenshots?.find((s: any) => s.id === editingScreenshot.id)?.description
          || '';

        updatedSteps[stepIndex] = {
          ...updatedSteps[stepIndex],
          title: stepInfo.title || updatedSteps[stepIndex].title,
          description: isDescriptionEmpty ? existingDesc : stepInfo.description,
          actionType: stepInfo.actionType as any
        };
      } else {
        // If step not found, create a new one
        logger.warn('Step not found for screenshot ID:', editingScreenshot.id, 'Creating new step');
        const newStep: DocumentationStep = {
          id: editingScreenshot.id,
          timestamp: 0,
          title: stepInfo.title,
          description: stepInfo.description,
          actionType: stepInfo.actionType as any,
          screenshot: editedImageData,
          isGenerated: false
        };
        updatedSteps.push(newStep);
      }
    }
    
    // Update screenshot references in steps
    // Match by step ID (more reliable than comparing imageData which may differ in format)
    updatedSteps = updatedSteps.map(step => {
      if (step.id === editingScreenshot.id) {
        return { ...step, screenshot: editedImageData };
      }
      if (step.screenshot === editingScreenshot.imageData) {
        return { ...step, screenshot: editedImageData };
      }
      return step;
    });

    // CRITICAL FIX: Update the project with BOTH screenshots AND documentationSteps
    const updatedProject = {
      ...currentProject,
      metadata: {
        ...currentProject.metadata,
        screenshots: updatedScreenshots,
        documentationSteps: updatedSteps  // ✅ Include updated steps!
      }
    };

    // Update states immediately FIRST to ensure instant UI refresh
    setDocumentationSteps([...updatedSteps]);
    
    // Update screenshots state directly with the edited imageData and description
    setScreenshots(prev =>
      prev.map(screenshot =>
        screenshot.id === editingScreenshot.id
          ? {
              ...screenshot,
              imageData: editedImageData,
              description: stepInfo?.description || screenshot.description
            }
          : screenshot
      )
    );
    
    // Update selected screenshot to show the edited version immediately
    setSelectedScreenshot(editedImageData);

    // CRITICAL: Update secureScreenshotUrls cache so thumbnail survives screenshot state sync
    // When the consolidated sync useEffect (line ~629) re-syncs screenshots from project metadata,
    // the in-memory base64 imageData gets lost. The secure URL cache ensures the thumbnail persists.
    setSecureScreenshotUrls(prev => ({ ...prev, [editingScreenshot.id]: editedImageData }));

    // Force a re-render to ensure UI updates immediately
    setForceUpdate(prev => prev + 1);

    // Set flag to prevent loadScreenshotData from overwriting our changes
    setJustSavedStep(true);
    
    // Update the project in the store to persist changes
    updateProject(currentProject.id, updatedProject);

    // Update recording with new documentation steps
    if (currentRecording) {
      const updatedRecording = {
        ...currentRecording,
        documentationSteps: [...updatedSteps]
      };
      updateRecording(currentRecording.id, updatedRecording);
    }
    
    // Clear the flag after state updates complete - increased timeout to prevent race conditions
    setTimeout(() => {
      setJustSavedStep(false);
    }, 500);
    
    // Close editor and show success message (unless navigating between steps)
    if (!keepOpen) {
      setShowImageEditor(false);
      setEditingScreenshot(null);
      toast.success(t('toast.screenshotUpdated'));
    }
  };

  const handleNavigateStep = async (direction: 'prev' | 'next') => {
    if (!editingScreenshot) return;

    // Find current index in documentationSteps
    const currentIndex = documentationSteps.findIndex(s => s.id === editingScreenshot.id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= documentationSteps.length) return;

    const targetStep = documentationSteps[newIndex];
    // Skip diagram and video steps — they don't have editable screenshots
    if (targetStep.type === 'diagram' || targetStep.mediaType === 'video') return;

    const targetScreenshot = screenshots?.find((s: any) => s.id === targetStep.id);
    if (!targetScreenshot || !currentProject) return;

    // Load image data using same priority as the Palette button
    let imageDataToEdit: string;
    if (targetScreenshot.imageData && targetScreenshot.imageData.startsWith('data:')) {
      imageDataToEdit = targetScreenshot.imageData;
    } else if (targetStep.screenshot && typeof targetStep.screenshot === 'string' && targetStep.screenshot.startsWith('data:')) {
      imageDataToEdit = targetStep.screenshot;
    } else {
      const secureUrl = await getSecureScreenshotUrl(targetScreenshot, currentProject.name);
      if (!secureUrl) {
        toast.error(t('toast.nextScreenshotFailed'));
        return;
      }
      imageDataToEdit = secureUrl;
    }

    setEditingScreenshot({ id: targetStep.id, imageData: imageDataToEdit });
  };

  const handleCloseImageEditor = () => {
    setShowImageEditor(false);
    setEditingScreenshot(null);
  };

  const exportAsVideo = () => {
    if (!currentRecording?.filePath) {
      toast.error(t('toast.noVideoForExport'));
      return;
    }
    
    // Navigate to video export page
    navigate('/video-export', {
      state: {
        videoFilePath: currentRecording.filePath,
        projectTitle,
        projectSource
      }
    });
  };



  if (!currentProject && !currentRecording) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('empty.title')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('empty.subtitle')}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('empty.goToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  // Check if we have screenshots from the current project
  const hasScreenshots = currentProject?.metadata?.screenshots && currentProject.metadata.screenshots.length > 0;

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-7xl mx-auto relative h-full">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-3 py-2">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              // Always navigate back to dashboard
              navigate('/dashboard');
            }}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title={t('header.backToDashboard')}
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {isVideoProject ? <Video className="w-5 h-5 text-blue-600" /> : <Camera className="w-5 h-5 text-green-600" />}
              {currentRecording?.name || currentProject?.name || t('header.editor')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatTime(duration)} • {isVideoProject ? t('header.videoProject') : t('header.screenshots')}
            </p>
          </div>
        </div>
        {/* Header actions moved below timeline */}
        <div className="hidden" />
      </div>

      <div className={cn("grid grid-cols-12 gap-3 relative transition-all duration-300 items-start h-full")}> 
        {/* Main Content Area */}
        <div className={cn("transition-all duration-300 col-span-8")}>
          {/* Edit / Preview Toggle Bar */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 mb-2">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('edit')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  viewMode === 'edit'
                    ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                )}
              >
                <Edit3 className="w-4 h-4 inline mr-1.5" />
                {t('view.edit')}
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  viewMode === 'preview'
                    ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                )}
              >
                <Eye className="w-4 h-4 inline mr-1.5" />
                {t('view.preview')}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAllOnboardingHints}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  hintsSuppressed
                    ? "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                )}
                title={hintsSuppressed ? t('view.showHints') : t('view.hideHints')}
                aria-label={hintsSuppressed ? t('view.showHints') : t('view.hideHints')}
                aria-pressed={!hintsSuppressed}
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('view.stepsCount', { count: (documentationSteps || []).length })}
              </span>
              <button
                onClick={handleExportStepGuide}
                disabled={!isInteractiveScreenshots && (!documentationSteps || documentationSteps.length === 0)}
                className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                title={!isInteractiveScreenshots && (!documentationSteps || documentationSteps.length === 0) ? t('view.exportEmpty') : t('view.exportReady')}
              >
                <Download className="w-4 h-4" />
                {t('view.exportDocumentation')}
              </button>
            </div>
          </div>

          {viewMode === 'edit' ? (
          <>
          {/* Video Player and Timeline */}
          <div className="space-y-2">
          {/* Video or Screenshots */}
          <div className="bg-black rounded-lg overflow-hidden aspect-video max-h-[45vh] sm:max-h-[50vh] md:max-h-[55vh] lg:max-h-[60vh]">
            {(currentRecording?.filePath || videoFilePath) ? (
              <VideoEditor
                ref={videoEditorRef}
                filePath={currentRecording?.filePath || videoFilePath}
                duration={duration}
                currentTime={currentTime}
                isPlaying={isPlaying}
                volume={volume}
                isMuted={isMuted}
                playbackSpeed={playbackSpeed}
                projectName={currentProject?.name}
                fromUpload={fromUpload}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onPlayStateChange={setIsPlaying}
                onVolumeChange={handleVolumeChange}
                onMuteToggle={toggleMute}
                onSpeedChange={handleSpeedChange}
                onSeek={seekTo}
              />
            ) : selectedVideoUrl ? (
              <div className="w-full h-full relative flex items-center justify-center bg-gray-900">
                <video
                  key={`video-${forceUpdate}`}
                  src={selectedVideoUrl}
                  controls
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            ) : selectedScreenshot ? (
              <div className="w-full h-full relative">
                <img
                  key={`selected-${forceUpdate}`}
                  src={selectedScreenshot}
                  alt="Selected screenshot"
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={() => setShowScreenshotModal(true)}
                  className="absolute top-4 right-4 p-2 bg-black bg-opacity-50 text-white rounded-lg hover:bg-opacity-75 transition-opacity"
                  title={t('stage.viewFullSize')}
                >
                  <Eye className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-900">
                <div className="text-center text-white max-w-sm">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-blue-400" />
                  <h3 className="text-lg font-semibold mb-2">{t('stage.buildingTitle')}</h3>
                  <p className="text-gray-400 mb-4">{t('stage.buildingSubtitle')}</p>
                  {(documentationSteps && documentationSteps.length > 0) && (
                    <button
                      onClick={() => setViewMode('preview')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      {t('stage.previewDocument')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

            {/* Compact Timeline */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => toggleSection('timeline')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 transition-colors"
                >
                  {collapsedSections.timeline ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <Layers className="w-4 h-4" />
                  {t('timeline.label', { count: (() => {
                    const stepCount = documentationSteps.filter(s => s.type !== 'diagram').length;
                    const hasBookmarkSteps = documentationSteps.some(s => s.id?.startsWith('bookmark_'));
                    const bookmarkCount = hasBookmarkSteps ? 0 : (currentRecording?.bookmarks?.filter(bookmark => {
                      const bookmarkTimeSec = bookmark.timestamp / 1000;
                      return !documentationSteps.some(step =>
                        step.type !== 'diagram' && Math.abs(step.timestamp - bookmarkTimeSec) < 2
                      );
                    }).length || 0);
                    return stepCount + bookmarkCount;
                  })() })}
                </button>
              </div>
              
              {!collapsedSections.timeline && (
                <div>
                  {/* Timeline Bar */}
            <div 
              ref={timelineRef}
              className="relative h-16 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percentage = x / rect.width;
                seekTo(percentage * duration);
              }}
            >
              {/* Progress Bar */}
              <div 
                className="absolute top-0 left-0 h-full bg-blue-500 opacity-30"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              
              {/* Current Time Indicator */}
              <div
                className="absolute top-0 w-0.5 h-full bg-blue-600"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />

              {/* Action Segments - Disabled to avoid collision with F10 bookmarks */}
              {/* {showActions && timelineSegments.map((segment) => (
                <div
                  key={segment.id}
                  className={cn(
                    "absolute top-2 h-12 rounded opacity-80 hover:opacity-100 transition-opacity cursor-pointer",
                    getActionColor(segment.actionType || 'click')
                  )}
                  style={{
                    left: `${(segment.startTime / duration) * 100}%`,
                    width: `${((segment.endTime - segment.startTime) / duration) * 100}%`,
                    minWidth: '4px'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekTo(segment.startTime);
                    // For screenshot projects, also find and display the corresponding screenshot
                    if (!currentRecording?.filePath && screenshots) {
                      const screenshot = screenshots.find(s => {
                        const screenshotTime = screenshots.length > 1 ? (s.timestamp - screenshots[0].timestamp) / 1000 : 0;
                        return Math.abs(screenshotTime - segment.startTime) < 1;
                      });
                      if (screenshot) {
                        // Prioritize edited imageData over file URLs to show edited versions
                        if (screenshot.imageData && screenshot.imageData.startsWith('data:')) {
                          // Use edited imageData (base64) if available
                          setSelectedScreenshot(screenshot.imageData);
                        } else if (screenshot.filePath && typeof screenshot.filePath === 'string' && currentProject) {
                          // Fall back to secure URL if no edited data
                          getSecureScreenshotUrl(screenshot, currentProject.name).then(secureUrl => {
                            if (secureUrl) {
                              setSelectedScreenshot(secureUrl);
                            } else {
                              logger.warn('⚠️ Failed to get secure screenshot URL in timeline');
                            }
                          }).catch(error => {
                            logger.error('Failed to get secure screenshot URL in timeline:', error);
                          });
                        } else if (screenshot.imageData) {
                          // Use original imageData as last resort
                          setSelectedScreenshot(screenshot.imageData);
                        } else {
                          logger.warn('⚠️ Screenshot has invalid filePath in timeline:', typeof screenshot.filePath, screenshot.filePath);
                        }
                      }
                    }
                  }}
                  title={segment.description}
                >
                  <div className="p-1 text-white text-xs">
                    {getActionIcon(segment.actionType || 'click')}
                  </div>
                </div>
              ))} */}

              {/* F10 Bookmarks - Show only bookmarks that DON'T have steps generated yet */}
              {/* Hide all bookmark dots if bookmark-generated steps exist */}
              {!documentationSteps.some(s => s.id?.startsWith('bookmark_')) && currentRecording?.bookmarks?.map((bookmark, index) => {
                const bookmarkTimeSec = bookmark.timestamp / 1000; // seconds for timeline positioning

                // Also check for any step near this bookmark (within 2 seconds)
                const hasScreenshotNearby = documentationSteps.some(step =>
                  step.type !== 'diagram' && Math.abs(step.timestamp - bookmarkTimeSec) < 2
                );

                // Skip this bookmark if it already has a screenshot
                if (hasScreenshotNearby) return null;

                const rawPosition = duration > 0
                  ? (bookmarkTimeSec / duration) * 100
                  : 0;

                // Clamp position to 2% - 98% to ensure markers are fully visible
                const position = Math.min(Math.max(rawPosition, 2), 98);

                return (
                  <div
                    key={bookmark.id}
                    className="absolute -translate-x-1/2 cursor-pointer group"
                    style={{
                      left: `${position}%`,
                      top: `50%`,
                      transform: `translate(-50%, -50%)`,
                      zIndex: 15 + index
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      seekTo(bookmarkTimeSec);
                    }}
                    title={bookmark.title || `Bookmark at ${formatTime(bookmarkTimeSec)}`}
                  >
                    {/* Orange dot with number */}
                    <div className="w-5 h-5 bg-orange-400 rounded-full border-2 border-orange-600 shadow-md hover:scale-125 transition-transform flex items-center justify-center">
                      <span className="text-[9px] font-bold text-orange-900">{index + 1}</span>
                    </div>

                    {/* Tooltip */}
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-30">
                      {bookmark.title || formatTime(bookmarkTimeSec)}
                      <div className="text-gray-400 text-[10px]">F10 Bookmark — click to seek</div>
                    </div>
                  </div>
                );
              })}

              {/* Documentation Step Markers - Screenshots taken at bookmarks */}
              {documentationSteps.filter(step => step.type !== 'diagram').map((step, index, filteredSteps) => {
                // Detect if step has a video-relative timestamp or a Unix timestamp (externally dropped)
                // Unix timestamps are orders of magnitude larger than video duration
                const isVideoRelativeTimestamp = duration > 0 && step.timestamp <= duration * 10;

                let rawPosition: number;
                if (duration > 0 && isVideoRelativeTimestamp) {
                  // Video-captured step: position by timestamp within video
                  rawPosition = (step.timestamp / duration) * 100;
                } else if (duration > 0) {
                  // Externally dropped step: position at the end, spread to avoid overlap
                  const externalSteps = filteredSteps.filter(s => s.timestamp > duration * 10);
                  const externalIndex = externalSteps.findIndex(s => s.id === step.id);
                  const spacing = externalSteps.length > 1 ? 6 : 0;
                  rawPosition = 98 - (externalSteps.length - 1 - externalIndex) * spacing;
                } else {
                  // No video duration: spread evenly
                  rawPosition = filteredSteps.length > 1
                    ? (index / (filteredSteps.length - 1)) * 100
                    : 50;
                }

                // Clamp position to 2% - 98% to ensure markers are fully visible
                const position = Math.min(Math.max(rawPosition, 2), 98);

                return (
                  <div
                    key={step.id}
                    className="absolute -translate-x-1/2 cursor-pointer group"
                    style={{
                      left: `${position}%`,
                      top: `50%`,
                      transform: `translate(-50%, -50%)`,
                      zIndex: 20 + index
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      seekTo(step.timestamp);

                      // Display the step's screenshot
                      if (step.screenshot) {
                        if (step.screenshot.startsWith('data:')) {
                          setSelectedScreenshot(step.screenshot);
                        } else if (currentProject) {
                          getSecureScreenshotUrl({ filePath: step.screenshot } as any, currentProject.name).then(secureUrl => {
                            if (secureUrl) {
                              setSelectedScreenshot(secureUrl);
                            }
                          }).catch(() => {});
                        }
                      }
                    }}
                    title={`${step.title} - ${step.description || formatTime(step.timestamp)}`}
                  >
                    {/* Numbered yellow dot */}
                    <div className="w-5 h-5 bg-yellow-400 rounded-full border-2 border-yellow-600 shadow-md hover:scale-125 transition-transform flex items-center justify-center">
                      <span className="text-[9px] font-bold text-yellow-900">{index + 1}</span>
                    </div>

                    {/* Tooltip */}
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-30">
                      {step.title} - {formatTime(step.timestamp)}
                      <div className="text-gray-400 text-[10px]">Click to jump to step</div>
                    </div>
                  </div>
                );
              })}
            </div>

                  {/* Time Labels */}
                  <div className="flex justify-between mt-2 text-sm text-gray-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              )}
            </div>

          {/* Video Info */}
          {(currentRecording?.filePath || videoFilePath) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-gray-500">
                  <Camera className="w-4 h-4" />
                  <span className="text-sm">{t('videoInfo.videoRecording')}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {t('videoInfo.duration', { time: formatTime(duration) })}
                </div>
              </div>
            </div>
          )}
          
          {!(currentRecording?.filePath || videoFilePath) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center space-x-2 text-gray-500">
                <Camera className="w-5 h-5" />
                <span className="text-sm">{t('videoInfo.screenshotBased')}</span>
              </div>
            </div>
          )}

          {/* Video-only export button - show when there's a video recording */}
          {currentRecording?.filePath && (
            <div className="mt-3">
              <button
                onClick={handleExportVideo}
                className="w-full px-3 py-2 text-sm rounded transition-colors flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700"
                title={t('videoInfo.exportVideoOnlyTitle')}
              >
                <Video className="w-4 h-4" />
                <span>{t('videoInfo.exportVideoOnly')}</span>
              </button>
            </div>
          )}

          {/* Project Settings card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 mt-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-500" />
              {t('projectSettings.heading')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('projectSettings.titleLabel')}
                </label>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('projectSettings.titlePlaceholder')}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('projectSettings.titleHint')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('projectSettings.sourceLabel')}
                </label>
                <input
                  type="text"
                  value={projectSource}
                  onChange={(e) => setProjectSource(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('projectSettings.sourcePlaceholder')}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('projectSettings.sourceHint')}
                </p>
              </div>
            </div>
          </div>
        </div>
          </>
          ) : (
          /* Preview Mode */
          <div className="space-y-2">
            <div ref={assignTemplateStripRef}>
            <QuickTemplateStrip
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={async (template) => {
                setSelectedTemplateId(template.id);
                const existing = await getTemplateCustomization(template.id);
                setTemplateCustomization(existing || null);
                await saveTemplateSettings(template.id, existing || getDefaultCustomization());
              }}
            />
            </div>
            <PreviewPanel
              data={previewData}
              format="pdf"
              template={selectedTemplate}
              className="border-0 shadow-none"
            />
          </div>
          )}
        </div>

        {/* Right Sidebar - Always Present */}
        <div className="col-span-4 self-start sticky top-3 h-fit bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          {/* Conditional Content Based on Available Data */}
          {(screenshots && screenshots.length > 0) || (documentationSteps && documentationSteps.length > 0) ? (
            <div>

              {/* Documentation Steps Header */}
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleSection('documentation')}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    {collapsedSections.documentation ? (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {t('steps.heading', { count: Math.max(screenshots?.length || 0, documentationSteps?.length || 0) })}
                  </h3>
                </div>
                <div className="flex items-center justify-center gap-1 flex-wrap">
                  {/* Bookmark Steps Button — shown when recording has bookmarks */}
                  {isVideoProject && currentRecording?.filePath && currentRecording.bookmarks && currentRecording.bookmarks.length > 0 && (
                    <button
                      onClick={generateStepsFromBookmarks}
                      disabled={isGeneratingDocs}
                      className="px-2 py-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1"
                      title={t('steps.bookmarksTitle')}
                    >
                      <Bookmark className={`w-3 h-3 ${isGeneratingDocs ? 'animate-spin' : ''}`} />
                      {t('steps.bookmarks', { count: currentRecording.bookmarks.length })}
                    </button>
                  )}
                  {/* Generate Workflow Diagram Button */}
                  {documentationSteps.filter(s => s.type !== 'diagram').length >= 2 && (
                    <button
                      ref={assignWorkflowButtonRef}
                      onClick={createWorkflowDiagram}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1"
                      title={t('steps.workflowTitle')}
                    >
                      <GitBranch className="w-3 h-3" />
                      {t('steps.workflow')}
                    </button>
                  )}
                  <button
                    ref={assignDiagramButtonRef}
                    onClick={() => {
                      createEmptyFlowDiagram();
                      setShowFlowEditor(true);
                    }}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1"
                    title={t('steps.diagramTitle')}
                  >
                    <Plus className="w-3 h-3" />
                    {t('steps.diagram')}
                  </button>
                  {/* Bulk Select Toggle */}
                  {documentationSteps.length >= 2 && (
                    <button
                      onClick={() => {
                        setBulkSelectMode(!bulkSelectMode);
                        setSelectedStepIds(new Set());
                      }}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
                        bulkSelectMode
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400"
                      )}
                      title={bulkSelectMode ? t('steps.selectTitleExit') : t('steps.selectTitleEnter')}
                    >
                      <CheckSquare className="w-3 h-3" />
                      {bulkSelectMode ? t('steps.cancel') : t('steps.select')}
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk Select Action Bar */}
              {bulkSelectMode && (
                <div className="mx-4 mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      {selectedStepIds.size === documentationSteps.length ? t('steps.deselectAll') : t('steps.selectAll')}
                    </button>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {t('steps.selectedCount', { selected: selectedStepIds.size, total: documentationSteps.length })}
                    </span>
                  </div>
                  <button
                    onClick={bulkDeleteSteps}
                    disabled={selectedStepIds.size === 0}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('steps.bulkDelete', { count: selectedStepIds.size })}
                  </button>
                </div>
              )}

              {/* Scene detection progress bar */}
              {isGeneratingDocs && sceneDetectionProgress && (
                <div className="mx-4 mb-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {sceneDetectionProgress.message}
                    </span>
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {sceneDetectionProgress.progress}%
                    </span>
                  </div>
                  <div className="w-full bg-amber-200 dark:bg-amber-800 rounded-full h-1.5">
                    <div
                      className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${sceneDetectionProgress.progress}%` }}
                    />
                  </div>
                </div>
              )}
              
              {!collapsedSections.documentation && (
                <div className="space-y-3 max-h-[calc(100vh-20rem)] overflow-y-auto pr-1">
                  {/* Create unified steps by using documentationSteps as source of truth for order */}
                  {(() => {
                    // Use documentationSteps as the single source of truth for display order
                    const unifiedSteps = [];

                    // Create a map of screenshots by ID for efficient lookup
                    const screenshotMap = new Map();
                    screenshots?.forEach((screenshot: any) => {
                      screenshotMap.set(screenshot.id, screenshot);
                    });

                    // Iterate through documentationSteps to build unified list in their order
                    documentationSteps?.forEach((docStep, index) => {
                      const screenshot = screenshotMap.get(docStep.id);

                      unifiedSteps.push({
                        screenshot: screenshot || null,
                        docStep,
                        index,
                        type: screenshot ? 'screenshot' : 'docStep'
                      });
                    });

                    // Index of the first step that renders the "Edit image & text" button (screenshot, not video).
                    // Used to anchor the onboarding CoachMark.
                    const firstEditableIndex = unifiedSteps.findIndex(
                      s => s.screenshot && s.docStep?.mediaType !== 'video'
                    );

                  return unifiedSteps.map(({ screenshot, docStep, index, type }) => {
                    const stepId = screenshot?.id || docStep?.id || `step-${index}`;
                    const isEditing = editingStep === stepId;

                    // Completion status: green border when both title and description are filled
                    // Title counts as filled when it's not empty and not the auto-default "Step N" placeholder.
                    // Description counts as filled when stripped HTML has visible text.
                    const rawTitle = (docStep?.title || '').trim();
                    const rawDescription = (docStep?.description || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                    const hasTitle = rawTitle.length > 0 && !/^Step \d+$/i.test(rawTitle);
                    const hasDescription = rawDescription.length > 0;
                    const isComplete = hasTitle && hasDescription;

                    return (
                      <div
                        key={`unified-${type}-${stepId}-${forceUpdate}`}
                        data-step-id={stepId}
                        draggable={!isEditing}
                        onDragStart={(e) => {
                          if (isEditing) { e.preventDefault(); return; }
                          handleDragStart(e, stepId);
                        }}
                        onDragOver={(e) => handleDragOver(e, stepId)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, stepId)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "border-2 rounded-lg p-3 hover:shadow-lg transition-all",
                          isComplete
                            ? "border-green-500 dark:border-green-500"
                            : "border-gray-200 dark:border-gray-600",
                          isEditing ? "cursor-default" : "cursor-move",
                          (selectedScreenshot === screenshot?.imageData ||
                           (screenshot?.filePath && typeof screenshot.filePath === 'string' && selectedScreenshot === secureScreenshotUrls[screenshot.id]) ||
                           (docStep?.mediaType === 'video' && selectedVideoUrl && selectedVideoUrl === secureVideoUrls[stepId])) &&
                          "border-blue-500 bg-blue-50 dark:bg-blue-900/20",
                          draggedStep === stepId && "opacity-50",
                          dragOverStep === stepId && "border-blue-500 bg-blue-50 dark:bg-blue-900/20",
                          editingStep === stepId && "ring-2 ring-indigo-500"
                        )}
                        onClick={async () => {
                          // Check for video step FIRST (before screenshot branch)
                          // because video steps also have a screenshot entry for consistency
                          if (docStep?.mediaType === 'video' && docStep.videoClipPath) {
                            // Handle video step click - show video player
                            setSelectedScreenshot(null);
                            const cachedUrl = secureVideoUrls[docStep.id];
                            if (cachedUrl) {
                              setSelectedVideoUrl(cachedUrl);
                            } else {
                              const videoUrl = await getSecureVideoUrl(docStep.videoClipPath);
                              if (videoUrl) {
                                setSecureVideoUrls(prev => ({ ...prev, [docStep.id]: videoUrl }));
                                setSelectedVideoUrl(videoUrl);
                              }
                            }
                          } else if (screenshot) {
                            // Use secure method to get screenshot URL
                            setSelectedVideoUrl(null);
                            if (currentProject) {
                              // Check cached URL first, then fall back to secure load
                              const cachedUrl = secureScreenshotUrls[screenshot.id];
                              if (cachedUrl) {
                                setSelectedScreenshot(cachedUrl);
                              } else {
                                const secureUrl = await getSecureScreenshotUrl(screenshot, currentProject.name);
                                if (secureUrl) {
                                  setSecureScreenshotUrls(prev => ({ ...prev, [screenshot.id]: secureUrl }));
                                  setSelectedScreenshot(secureUrl);
                                } else {
                                  logger.warn('⚠️ Failed to get secure screenshot URL');
                                }
                              }
                            }
                            const screenshotTime = screenshots && screenshots.length > 1 ? (screenshot.timestamp - screenshots[0].timestamp) / 1000 : 0;
                            setCurrentTime(screenshotTime);
                          } else if (docStep) {
                            // Handle documentation step click
                            if (docStep.type === 'diagram' && docStep.diagramImagePath) {
                              // Handle diagram step click - show preview only (editing disabled)
                              logger.log('🎯 Diagram step clicked:', docStep.id, docStep.title);
                              const secureUrl = secureDiagramUrls[docStep.id];
                              if (secureUrl) {
                                setSelectedScreenshot(secureUrl);
                                logger.log('🖼️ Set diagram preview URL:', secureUrl.substring(0, 50) + '...');
                              } else {
                                logger.warn('⚠️ No secure diagram URL available for step:', docStep.id);
                              }
                              // REMOVED: setEditingDiagram(docStep) - diagram editing disabled
                              // REMOVED: setShowDiagramEditor(true) - diagram editing disabled
                            } else {
                              // Handle regular documentation step - look for associated screenshot
                              setSelectedVideoUrl(null);
                              const associatedScreenshot = screenshots?.find(s => s.id === docStep.id);
                              if (associatedScreenshot && currentProject) {
                                const secureUrl = await getSecureScreenshotUrl(associatedScreenshot, currentProject.name);
                                if (secureUrl) {
                                  setSelectedScreenshot(secureUrl);
                                }
                              }
                            }
                            if (screenshots && screenshots.length > 1 && docStep.timestamp) {
                              const screenshotTime = (docStep.timestamp - screenshots[0].timestamp) / 1000;
                              setCurrentTime(screenshotTime);
                            }
                          }
                        }}
                      >
                        <div className="flex items-start space-x-3">
                          {/* Bulk select checkbox */}
                          {bulkSelectMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStepSelection(stepId);
                              }}
                              className="flex-shrink-0 mt-1 p-0.5 text-gray-400 hover:text-blue-600 transition-colors"
                            >
                              {selectedStepIds.has(stepId) ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          )}
                          {/* Thumbnail - Screenshot or Diagram (skip for video steps) */}
                          {screenshot && docStep?.mediaType !== 'video' && (() => {
                            // Determine the best available image source
                            // Priority: ref cache (bulletproof) > secure URL cache > inline base64
                            const cachedImage = savedScreenshotCacheRef.current[screenshot.id];
                            const secureUrl = secureScreenshotUrls[screenshot.id];
                            const dataUrl = screenshot.imageData && screenshot.imageData.startsWith('data:') ? screenshot.imageData : null;
                            const imageSrc = cachedImage || secureUrl || dataUrl;

                            // Only render image if we have a valid source
                            if (!imageSrc) {
                              return (
                                <div className="relative flex-shrink-0">
                                  <div className="w-20 h-20 bg-gray-200 dark:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                                    <Camera className="w-6 h-6 text-gray-400" />
                                  </div>
                                </div>
                              );
                            }
                            
                            return (
                              <div className="relative flex-shrink-0">
                                <img
                                  key={`${screenshot.id}-${forceUpdate}`}
                                  src={imageSrc}
                                  alt={`Step ${index + 1}`}
                                  className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                                  onError={(e) => {
                                    logger.error('🚨 Unified view image failed to load:', {
                                      src: e.currentTarget.src,
                                      screenshotId: screenshot.id,
                                      projectName: currentProject?.name,
                                      hasSecureUrl: !!secureUrl,
                                      hasImageData: !!screenshot.imageData,
                                      imageDataType: screenshot.imageData ? (screenshot.imageData.startsWith('data:') ? 'data-url' : 'path') : 'none'
                                    });
                                    // Replace with placeholder on error (Security: using DOM API instead of innerHTML)
                                    const placeholder = document.createElement('div');
                                    placeholder.className = 'w-20 h-20 bg-gray-200 dark:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center';

                                    // Create SVG element programmatically (safe from XSS)
                                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                                    svg.setAttribute('class', 'w-6 h-6 text-gray-400');
                                    svg.setAttribute('fill', 'none');
                                    svg.setAttribute('stroke', 'currentColor');
                                    svg.setAttribute('viewBox', '0 0 24 24');

                                    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                    path1.setAttribute('stroke-linecap', 'round');
                                    path1.setAttribute('stroke-linejoin', 'round');
                                    path1.setAttribute('stroke-width', '2');
                                    path1.setAttribute('d', 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z');

                                    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                    path2.setAttribute('stroke-linecap', 'round');
                                    path2.setAttribute('stroke-linejoin', 'round');
                                    path2.setAttribute('stroke-width', '2');
                                    path2.setAttribute('d', 'M15 13a3 3 0 11-6 0 3 3 0 016 0z');

                                    svg.appendChild(path1);
                                    svg.appendChild(path2);
                                    placeholder.appendChild(svg);

                                    e.currentTarget.parentNode?.replaceChild(placeholder, e.currentTarget);
                                  }}
                                />
                              </div>
                            );
                          })()}
                          {docStep && docStep.type === 'diagram' && docStep.diagramImagePath && (
                            <div className="relative flex-shrink-0 cursor-pointer" onClick={() => {
                              // Show diagram in preview
                              const secureUrl = secureDiagramUrls[docStep.id];
                              if (secureUrl) {
                                setSelectedScreenshot(secureUrl);
                              }
                            }}>
                              <img
                                src={secureDiagramUrls[docStep.id]}
                                alt={`Diagram ${index + 1}`}
                                className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-400 transition-colors"
                                onError={(e) => {
                                  logger.error('🚨 Diagram thumbnail failed to load:', {
                                    src: e.currentTarget.src,
                                    diagramImagePath: docStep.diagramImagePath,
                                    secureUrl: secureDiagramUrls[docStep.id],
                                    stepId: docStep.id,
                                    timestamp: docStep.timestamp
                                  });
                                  // Try to reload secure URL if not available
                                  if (!secureDiagramUrls[docStep.id] && docStep.diagramImagePath) {
                                    logger.log('🔄 Attempting to reload secure diagram URL for:', docStep.id);
                                    // The loadSecureDiagramUrls useEffect should handle this
                                  }
                                  // Hide broken image by setting a transparent placeholder
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 rounded-lg transition-all duration-200 flex items-center justify-center">
                                <Eye className="w-4 h-4 text-white opacity-0 hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          )}
                          {/* Video clip thumbnail */}
                          {docStep && docStep.mediaType === 'video' && docStep.videoClipPath && !docStep.diagramImagePath && (
                            <div className="relative flex-shrink-0">
                              {docStep.screenshot ? (
                                <div className="relative">
                                  <img
                                    src={docStep.screenshot}
                                    alt={`Video ${index + 1}`}
                                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-lg">
                                    <Play className="w-6 h-6 text-white drop-shadow-lg" />
                                  </div>
                                </div>
                              ) : (
                                <div className="w-20 h-20 bg-gray-700 rounded-lg flex items-center justify-center border border-gray-600">
                                  <Video className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Step Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                {docStep && (
                                  <div className="flex items-center space-x-1">
                                    <GripVertical className="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing" />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); moveStep(stepId, 'up'); }}
                                      disabled={index === 0}
                                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-20 disabled:hover:text-gray-400 disabled:hover:bg-transparent transition-colors"
                                      title={t('steps.moveUp')}
                                    >
                                      <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button
                                      ref={index === 0 && docStep ? assignFirstOrderButtonRef : undefined}
                                      onClick={(e) => { e.stopPropagation(); moveStep(stepId, 'down'); }}
                                      disabled={index === documentationSteps.length - 1}
                                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-20 disabled:hover:text-gray-400 disabled:hover:bg-transparent transition-colors"
                                      title={t('steps.moveDown')}
                                    >
                                      <ChevronDown className="w-4 h-4" />
                                    </button>
                                    <span className="flex items-center justify-center w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full text-sm font-medium">
                                      {index + 1}
                                    </span>
                                  </div>
                                )}
                                {!docStep && screenshot && (
                                  <span className="flex items-center justify-center w-6 h-6 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm font-medium">
                                    {index + 1}
                                  </span>
                                )}

                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex items-center space-x-1">
                                {/* Timestamp button hidden - uncomment to restore
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (docStep) {
                                      seekTo(docStep.timestamp);
                                    } else if (screenshot) {
                                      const screenshotTime = screenshots && screenshots.length > 1 ? (screenshot.timestamp - screenshots[0].timestamp) / 1000 : 0;
                                      setCurrentTime(screenshotTime);
                                    }
                                  }}
                                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                  title={t('steps.goToTimestamp')}
                                >
                                  <Clock className="w-4 h-4" />
                                </button>
                                */}
                                {/* Replace screenshot — video: capture current frame, screenshots: retake from source */}
                                {screenshot && docStep?.mediaType !== 'video' && (
                                  <button
                                    ref={index === firstEditableIndex ? assignFirstReplaceButtonRef : undefined}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isVideoProject) {
                                        replaceStepScreenshot(stepId);
                                      } else {
                                        openRetakeSourcePicker(stepId);
                                      }
                                    }}
                                    className="p-1 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                    title={isVideoProject ? t('steps.replaceVideoFrame') : t('steps.retakeFromWindow')}
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                  </button>
                                )}
                                {/* Edit screenshot annotations */}
                                {screenshot && docStep?.mediaType !== 'video' && (
                                  <button
                                    ref={index === firstEditableIndex ? assignFirstEditButtonRef : undefined}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (currentProject) {
                                        try {
                                          // IMPORTANT: Priority order for finding edited screenshots:
                                          // 1. Check screenshots array for edited imageData (most recent)
                                          // 2. Check documentation step for edited screenshot
                                          // 3. Load original from file

                                          let imageDataToEdit: string;

                                          // Priority 1: Check screenshots array for edited imageData
                                          if (screenshot.imageData && screenshot.imageData.startsWith('data:')) {
                                            logger.log('✅ Using edited imageData from screenshots array for:', screenshot.id);
                                            imageDataToEdit = screenshot.imageData;
                                          }
                                          // Priority 2: Check documentation step for edited screenshot
                                          else if (docStep?.screenshot && typeof docStep.screenshot === 'string' && docStep.screenshot.startsWith('data:')) {
                                            logger.log('✅ Using edited screenshot from documentation step for:', screenshot.id);
                                            imageDataToEdit = docStep.screenshot;
                                          }
                                          // Priority 3: Load original from file
                                          else {
                                            logger.log('📄 Loading original screenshot from file for:', screenshot.id);
                                            const secureUrl = await getSecureScreenshotUrl(screenshot, currentProject.name);
                                            if (!secureUrl) {
                                              logger.error('❌ Failed to get secure screenshot URL');
                                              toast.error(t('toast.screenshotEditLoadFailed'));
                                              return;
                                            }
                                            imageDataToEdit = secureUrl;
                                          }

                                          handleEditScreenshot({ id: screenshot.id, imageData: imageDataToEdit });
                                        } catch (error) {
                                          logger.error('❌ Error loading screenshot for editing:', error);
                                          toast.error(t('toast.screenshotEditLoadFailed'));
                                        }
                                      }
                                    }}
                                    className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                    title={t('steps.editScreenshot')}
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                                {docStep && docStep.type === 'diagram' && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      // Load diagram data from JSON file before editing
                                      const loadedDocStep = await loadDiagramData(docStep);
                                      setEditingFlow(loadedDocStep);
                                      setShowFlowEditor(true);
                                    }}
                                    className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                    title={t('steps.editDiagram')}
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  ref={index === 0 ? assignFirstDeleteButtonRef : undefined}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (docStep) {
                                      deleteStep(docStep.id);
                                    } else if (screenshot) {
                                      handleDeleteScreenshot(screenshot.id);
                                    }
                                  }}
                                  className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                  title={t('steps.delete')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            
                            {/* Step Content - Inline editable (double-click) with auto-save on blur */}
                            {isEditing && docStep ? (
                              <div
                                className="space-y-1.5"
                                onBlur={(e) => {
                                  // Only close edit mode when focus leaves the entire container
                                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                    setEditingStep(null);
                                  }
                                }}
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  value={docStep.title}
                                  onChange={(e) => updateStep(docStep.id, { title: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingStep(null); if (e.key === 'Enter') (e.target as HTMLInputElement).nextElementSibling?.querySelector('textarea')?.focus(); }}
                                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm font-medium"
                                  placeholder={t('steps.stepTitlePlaceholder')}
                                />
                                <textarea
                                  value={docStep.description}
                                  onChange={(e) => updateStep(docStep.id, { description: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingStep(null); }}
                                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none text-sm"
                                  rows={2}
                                  placeholder={t('steps.stepDescriptionPlaceholder')}
                                />
                              </div>
                            ) : (
                              <div
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (docStep) setEditingStep(docStep.id);
                                }}
                                className="cursor-default group/edit"
                                title={t('steps.doubleClickToEdit')}
                              >
                                <h4 className="font-medium text-gray-900 dark:text-white mb-1 truncate group-hover/edit:text-blue-600 dark:group-hover/edit:text-blue-400 transition-colors">
                                  {docStep?.title || screenshot?.description || t('steps.stepNumber', { n: index + 1 })}
                                </h4>
                                <div
                                  className="rich-text-content text-sm text-gray-600 dark:text-gray-400 line-clamp-2"
                                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(docStep?.description || screenshot?.description || '&nbsp;') }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
                
                {/* Drop zone for adding new steps from external files */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length > 0) {
                      await handleExternalFileDropAsNewStep(e.dataTransfer.files);
                    }
                  }}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center text-gray-400 dark:text-gray-500 mt-2 hover:border-blue-400 hover:text-blue-400 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <Plus className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-sm">{t('steps.dropZone')}</span>
                </div>

                {/* Empty State */}
                {(!screenshots || screenshots.length === 0) && (!documentationSteps || documentationSteps.length === 0) && (
                  <div className="text-center py-8">
                    <Camera className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {isInteractiveScreenshots ? t('emptyState.noStepsYet') : t('emptyState.captureFirstSteps')}
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                      {isInteractiveScreenshots
                        ? t('emptyState.goBackToCapture')
                        : t('emptyState.takeScreenshotsHint')}
                    </p>
                    {isInteractiveScreenshots && currentProject && (
                      <button
                        onClick={() => navigate('/interactive-screenshots', { state: { projectId: currentProject.id, projectName: currentProject.name } })}
                        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                        {t('emptyState.retakeScreenshots')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
          ) : (
            <div className="text-center py-8">
              {isVideoProject && currentRecording?.filePath && currentRecording.bookmarks && currentRecording.bookmarks.length > 0 ? (
                <>
                  <Bookmark className="w-12 h-12 text-orange-500 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {t('emptyState.generateFromBookmarksTitle')}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {t('emptyState.generateFromBookmarksSubtitle')}
                  </p>
                  <button
                    onClick={generateStepsFromBookmarks}
                    disabled={isGeneratingDocs}
                    className="inline-flex items-center px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg transition-colors font-medium"
                  >
                    <Bookmark className={`w-4 h-4 mr-2 ${isGeneratingDocs ? 'animate-spin' : ''}`} />
                    {t('emptyState.stepsFromBookmarks', { count: currentRecording.bookmarks.length })}
                  </button>
                  {/* Bookmark extraction progress bar */}
                  {isGeneratingDocs && sceneDetectionProgress && (
                    <div className="mt-4 mx-auto max-w-xs p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg text-left">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-orange-800 dark:text-orange-300">
                          {sceneDetectionProgress.message}
                        </span>
                        <span className="text-xs text-orange-600 dark:text-orange-400">
                          {sceneDetectionProgress.progress}%
                        </span>
                      </div>
                      <div className="w-full bg-orange-200 dark:bg-orange-800 rounded-full h-1.5">
                        <div
                          className="bg-orange-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${sceneDetectionProgress.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Camera className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {t('emptyState.captureFirstSteps')}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {t('emptyState.takeScreenshotsHint')}
                  </p>
                  {currentProject && !currentRecording?.filePath && !videoFilePath && (
                    <button
                      onClick={() => {
                        navigate('/dashboard');
                        setTimeout(() => {
                          navigate('/interactive-screenshots', {
                            state: {
                              projectName: currentProject.name,
                              projectId: currentProject.id
                            }
                          });
                        }, 100);
                      }}
                      className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {t('emptyState.startTakingScreenshots')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

      </div>
      
      {/* Screenshot Modal */}
      {/* Retake Source Picker */}
      {retakingStepId && retakeSources.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { setRetakingStepId(null); setRetakeSources([]); }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-lg w-full mx-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('retakeModal.heading')}</h3>
              <button onClick={() => { setRetakingStepId(null); setRetakeSources([]); }} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors">
                <EyeOff className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {retakeSources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => retakeStepScreenshot(source.id)}
                  className="group border border-gray-200 dark:border-gray-600 rounded-lg p-2 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
                >
                  {source.thumbnail && (
                    <img src={source.thumbnail} alt={source.name} className="w-full h-20 object-cover rounded mb-2 bg-gray-100 dark:bg-gray-700" />
                  )}
                  <p className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{source.name}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showScreenshotModal && selectedScreenshot && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setShowScreenshotModal(false)}>
          <div className="relative max-w-7xl max-h-full p-4">
            <img 
              src={selectedScreenshot} 
              alt="Full size screenshot" 
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setShowScreenshotModal(false)}
              className="absolute top-6 right-6 p-2 bg-black bg-opacity-50 text-white rounded-lg hover:bg-opacity-75 transition-opacity"
            >
              <EyeOff className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Image Editor */}
      {showImageEditor && editingScreenshot && (
        <ImageEditor
          imageData={editingScreenshot.imageData}
          onSave={handleSaveEditedScreenshot}
          onClose={handleCloseImageEditor}
          stepInfo={getStepInfoForScreenshot(editingScreenshot.id)}
          stepId={editingScreenshot.id}
          currentStepIndex={documentationSteps.findIndex(s => s.id === editingScreenshot.id)}
          totalSteps={documentationSteps.filter(s => s.type !== 'diagram' && s.mediaType !== 'video').length}
          onNavigateStep={handleNavigateStep}
        />
      )}

      {/* Onboarding coach marks — one shown at a time (highest priority first) */}
      {editHint.visible && editHintAnchorReady && !showImageEditor && !showFlowEditor && (
        <CoachMark
          anchorRef={firstEditButtonRef}
          title={t('coach.editTitle')}
          description={t('coach.editDesc')}
          placement="left"
          onDismiss={editHint.dismiss}
        />
      )}
      {replaceHint.visible && replaceHintAnchorReady && !showImageEditor && !showFlowEditor && (
        <CoachMark
          anchorRef={firstReplaceButtonRef}
          title={t('coach.replaceTitle')}
          description={t('coach.replaceDesc')}
          placement="left"
          onDismiss={replaceHint.dismiss}
        />
      )}
      {deleteHint.visible && deleteHintAnchorReady && !showImageEditor && !showFlowEditor && (
        <CoachMark
          anchorRef={firstDeleteButtonRef}
          title={t('coach.deleteTitle')}
          description={t('coach.deleteDesc')}
          placement="left"
          onDismiss={deleteHint.dismiss}
        />
      )}
      {orderHint.visible && orderHintAnchorReady && !showImageEditor && !showFlowEditor && (
        <CoachMark
          anchorRef={firstOrderButtonRef}
          title={t('coach.reorderTitle')}
          description={t('coach.reorderDesc')}
          placement="left"
          onDismiss={orderHint.dismiss}
        />
      )}
      {templateHint.visible && templateHintAnchorReady && !showImageEditor && !showFlowEditor && (
        <CoachMark
          anchorRef={templateStripRef}
          title={t('coach.templateTitle')}
          description={t('coach.templateDesc')}
          placement="bottom"
          onDismiss={templateHint.dismiss}
        />
      )}
      {workflowHint.visible && workflowHintAnchorReady && !showImageEditor && !showFlowEditor && (
        <CoachMark
          anchorRef={workflowButtonRef}
          title={t('coach.workflowTitle')}
          description={t('coach.workflowDesc')}
          placement="bottom"
          onDismiss={workflowHint.dismiss}
        />
      )}
      {diagramHint.visible && diagramHintAnchorReady && !showImageEditor && !showFlowEditor && (
        <CoachMark
          anchorRef={diagramButtonRef}
          title={t('coach.diagramTitle')}
          description={t('coach.diagramDesc')}
          placement="bottom"
          onDismiss={diagramHint.dismiss}
        />
      )}

      {/* Flow Diagram Editor */}
      <FlowDiagramEditor
        key={editingFlow?.id || 'new-diagram'}
        isOpen={showFlowEditor}
        onSave={handleFlowDiagramSave}
        onClose={() => {
          setShowFlowEditor(false);
          setEditingFlow(null);
        }}
        initialData={editingFlow ? {
          elements: editingFlow.diagramElements || [],
          appState: editingFlow.diagramAppState || {},
          title: editingFlow.title || 'Diagram',
          id: editingFlow.id
        } : undefined}
        projectPath={currentProject?.name || ''}
        stepNumber={editingFlow ? undefined : (screenshots?.length || 0) + documentationSteps.length + 1}
      />
      </div>
    </div>
  );
};

export default EditingPage;
