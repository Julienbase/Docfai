import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Monitor, Camera, Play, Square, Clock, Eye, Trash2, X, Plus, AlertCircle, CheckCircle, Settings, Keyboard, Pause, RefreshCw, GripVertical, ChevronDown, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import CoachMark from '../components/CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';
import { createLogger } from '../utils/logger';

const logger = createLogger("InteractiveScreenshots");


interface CaptureSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail?: string;
  selected?: boolean;
}

interface CaptureStats {
  source: string;
  method: string;
  duration: string;
  screenshots: number;
}

interface Screenshot {
  id: string;
  timestamp: number;
  imageData?: string;
  filePath?: string;
  clickX: number;
  clickY: number;
  description: string;
  filename?: string;
  size?: number;
}

// Screenshot Card Component with async image loading
interface ScreenshotCardProps {
  screenshot: Screenshot;
  index: number;
  onPreview: () => void;
  onDelete: () => void;
  getScreenshotImageUrl: (screenshot: Screenshot) => Promise<string | null>;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

// Preview Modal Component with async image loading
interface PreviewModalProps {
  screenshot: Screenshot;
  onClose: () => void;
  getScreenshotImageUrl: (screenshot: Screenshot) => Promise<string | null>;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ screenshot, onClose, getScreenshotImageUrl }) => {
  const { t } = useTranslation('interactiveScreenshots');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const loadImage = async () => {
      setIsLoading(true);
      setHasError(false);
      
      try {
        const url = await getScreenshotImageUrl(screenshot);
        if (url) {
          setImageUrl(url);
        } else {
          setHasError(true);
        }
      } catch (error) {
        logger.error('Failed to load preview image:', error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [screenshot.id, screenshot.imageData, screenshot.filePath]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {screenshot.description}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">{t('previewModal.loading')}</p>
              </div>
            </div>
          ) : hasError || !imageUrl ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-2">{t('previewModal.loadError')}</p>
                <p className="text-sm text-gray-400">{t('previewModal.screenshotId', { id: screenshot.id })}</p>
              </div>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={screenshot.description}
              className="max-w-full h-auto rounded-lg"
              onError={() => {
                logger.error('❌ Failed to load preview image:', screenshot.id);
                setHasError(true);
              }}
            />
          )}
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>{t('previewModal.captured', { time: new Date(screenshot.timestamp).toLocaleString() })}</p>
            {screenshot.size && (
              <p>{t('previewModal.size', { size: (screenshot.size / 1024).toFixed(1) })}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
 };

const ScreenshotCard: React.FC<ScreenshotCardProps> = ({ screenshot, index, onPreview, onDelete, getScreenshotImageUrl, onDragStart, onDragOver, onDragEnd, isDragOver }) => {
  const { t } = useTranslation('interactiveScreenshots');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const loadImage = async () => {
      try {
        setIsLoading(true);
        setHasError(false);
        const url = await getScreenshotImageUrl(screenshot);
        setImageUrl(url);
      } catch (error) {
        logger.error('Failed to load screenshot image:', error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [screenshot.id, screenshot.imageData, screenshot.filePath]);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, screenshot.id)}
      onDragOver={(e) => onDragOver(e, screenshot.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "flex gap-3 p-3 rounded-lg border transition-all group",
        isDragOver
          ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md"
      )}
    >
      {/* Drag handle + step number */}
      <div className="flex flex-col items-center gap-1 pt-1 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{index + 1}</span>
      </div>

      {/* Thumbnail */}
      <div className="w-32 h-20 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 relative">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hasError || !imageUrl ? (
          <div className="w-full h-full flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-gray-400" />
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={screenshot.description}
            className="w-full h-full object-cover cursor-pointer"
            onClick={onPreview}
            onError={() => setHasError(true)}
          />
        )}
      </div>

      {/* Step title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {t('card.step', { number: index + 1 })}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {new Date(screenshot.timestamp).toLocaleTimeString()}
          {screenshot.size ? ` · ${(screenshot.size / 1024).toFixed(0)} KB` : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onPreview} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors" title={t('card.preview')}>
          <Eye className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <button onClick={onDelete} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title={t('card.delete')}>
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
        </button>
      </div>
    </div>
  );
};

const InteractiveScreenshots: React.FC = () => {
  const { t } = useTranslation('interactiveScreenshots');
  const navigate = useNavigate();
  const location = useLocation();
  const { addProject, setCurrentProject, projects, currentProject, setCapturingScreenshots } = useAppStore();
  
  // Get project info from navigation state
  const navigationState = location.state as { projectName?: string; projectId?: string } | null;
  const projectName = navigationState?.projectName || currentProject?.name || 'New Project';
  const projectId = navigationState?.projectId || currentProject?.id;
  
  const [captureSources, setCaptureSources] = useState<CaptureSource[]>([]);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [captureCompleted, setCaptureCompleted] = useState(false);
  const [captureStats, setCaptureStats] = useState<CaptureStats>({
    source: 'Entire screen',
    method: 'Realtime',
    duration: '00:00',
    screenshots: 0
  });
  
  const [captureStartTime, setCaptureStartTime] = useState<number | null>(null);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [previewScreenshot, setPreviewScreenshot] = useState<Screenshot | null>(null);

  // Hotkey configuration state
  const [hotkeyConfig, setHotkeyConfig] = useState<{ primary: string; secondary?: string }>({ primary: 'F8', secondary: 'CommandOrControl+Shift+C' });
  const [isEditingHotkey, setIsEditingHotkey] = useState(false);

  // Auto-capture mode state (disabled in Microsoft Store builds — WH_MOUSE_LL prohibited)
  const [isStoreVersion, setIsStoreVersion] = useState(false);
  const [captureMode, setCaptureMode] = useState<'manual' | 'auto'>('manual');
  const [autoCaptureConfig, setAutoCaptureConfig] = useState({
    debounceMs: 300,
    captureRightClicks: false,
  });
  const [recentAutoClicks, setRecentAutoClicks] = useState<Array<{
    clickX: number;
    clickY: number;
    clickType: string;
    timestamp: number;
    elementName: string | null;
    elementType: string;
    stepDescription: string;
  }>>([]);

  // Preview state
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  

  


  // Component mount logging removed for performance

  // Load hotkey configuration on mount
  useEffect(() => {
    const loadHotkeyConfig = async () => {
      if (window.electronAPI?.getHotkeyConfig) {
        const result = await window.electronAPI.getHotkeyConfig();
        if (result.success && result.config) {
          setHotkeyConfig(result.config);
        }
      }
    };
    loadHotkeyConfig();
  }, []);

  // Detect Store version to disable auto-capture (WH_MOUSE_LL prohibited in appx)
  useEffect(() => {
    const checkStoreVersion = async () => {
      if (window.electronAPI?.getAppVersion) {
        const info = await window.electronAPI.getAppVersion();
        if (info.isStoreVersion) {
          setIsStoreVersion(true);
        }
      }
    };
    checkStoreVersion();
  }, []);

  // Clear global capture flag on unmount (safety net)
  useEffect(() => {
    return () => {
      setCapturingScreenshots(false);
    };
  }, [setCapturingScreenshots]);

  // Load capture sources on component mount
  useEffect(() => {
    loadSources();
  }, []); // Remove captureSources dependency to prevent infinite loop

  // Auto-open new project modal when arriving without a project
  useEffect(() => {
    if (!currentProject && !projectId) {
      setShowNewProjectModal(true);
    }
  }, []); // Only on mount

  // Auto-select current project when navigating from project page
  useEffect(() => {
    if (projectId && !currentProject) {
      // If we have a projectId from navigation but no current project selected, auto-select it
      const project = projects.find(p => p.id === projectId);
      if (project) {
        logger.log('Auto-selecting project from navigation:', project.name);
        setCurrentProject(project);
      }
    } else if (currentProject && projectId && currentProject.id !== projectId) {
      // If current project doesn't match navigation projectId, update it
      const project = projects.find(p => p.id === projectId);
      if (project) {
        logger.log('Updating to project from navigation:', project.name);
        setCurrentProject(project);
      }
    }
  }, [projectId, currentProject, projects, setCurrentProject]);

  // Force refresh project data on mount and when location changes
  useEffect(() => {
    const refreshProjectData = () => {
      // Project data refresh logging removed for performance
      if (projectId) {
        const project = projects.find(p => p.id === projectId);
        // Project found logging removed for performance
        if (project?.metadata?.screenshots) {
          // Screenshot refresh logging removed for performance
          setScreenshots([...project.metadata.screenshots]); // Create new array to force re-render
          setCaptureStats(prev => ({
            ...prev,
            screenshots: project.metadata.screenshots.length
          }));
        } else {
          // No screenshots warning removed for performance
        }
      } else {
        // No projectId warning removed for performance
      }
    };

    refreshProjectData();
  }, [projectId, projects, location]);

  // Additional refresh on mount with a small delay to ensure data is loaded
  useEffect(() => {
    const refreshProjectData = () => {
      // Delayed project refresh logging removed for performance
      if (projectId) {
        const project = projects.find(p => p.id === projectId);
        // Delayed project lookup logging removed for performance
        if (project?.metadata?.screenshots) {
          // Initial project refresh logging removed for performance
          setScreenshots([...project.metadata.screenshots]);
          setCaptureStats(prev => ({
            ...prev,
            screenshots: project.metadata.screenshots.length
          }));
        } else {
          // No screenshots warning removed for performance
        }
      } else {
        // No projectId warning removed for performance
      }
    };
    
    // Delay refresh to ensure store is updated
    const timer = setTimeout(refreshProjectData, 50);
    return () => clearTimeout(timer);
  }, [projectId, projects]);
  
  // SECURITY: EnhancedInputCaptureService initialization removed (service deleted)



  // Set up screenshot capture listener and cleanup on unmount
  useEffect(() => {
    if (!window.electronAPI) return;

    // No need for capture-from-source handler since capture is now done entirely in main process
    // Just ensure we have the screenshot listener set up

    return () => {
      // Cleanup: ALWAYS stop screenshot capture when component unmounts
      // This ensures capture stops when navigating to editing page or any other page
      logger.log('🛑 InteractiveScreenshots component unmounting - stopping capture');
      if (window.electronAPI.stopScreenshotCapture) {
        window.electronAPI.stopScreenshotCapture()
          .then(() => logger.log('✅ Screenshot capture stopped successfully on unmount'))
          .catch((err) => logger.error('❌ Error stopping capture on unmount:', err));
      }
      // SECURITY: Enhanced capture service cleanup removed (service deleted)
    };
  }, []); // Empty dependency - cleanup runs only on unmount

  // Handle page unload/refresh to stop recording
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isCapturing && window.electronAPI) {
        // Stop screenshot capture before page unloads
        if (window.electronAPI.stopScreenshotCapture) {
          window.electronAPI.stopScreenshotCapture().catch((err) => logger.error(err));
        }
        // Show warning to user
        event.preventDefault();
        event.returnValue = 'Screenshot capture is in progress. Are you sure you want to leave?';
        return 'Screenshot capture is in progress. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isCapturing]);

  // Track processed clicks to prevent duplicates
  const processedClicks = useRef(new Set<string>());

  // Button detection helper function
  const detectUIElement = (canvas: HTMLCanvasElement, clickX: number, clickY: number) => {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Sample colors around click point to detect UI elements
    const sampleRadius = 20;
    const samples: { r: number; g: number; b: number; x: number; y: number }[] = [];
    
    for (let dy = -sampleRadius; dy <= sampleRadius; dy += 5) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx += 5) {
        const x = Math.max(0, Math.min(canvas.width - 1, clickX + dx));
        const y = Math.max(0, Math.min(canvas.height - 1, clickY + dy));
        const idx = (y * canvas.width + x) * 4;
        
        samples.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          x, y
        });
      }
    }
    
    // Analyze color uniformity to detect buttons
    const avgColor = samples.reduce((acc, sample) => ({
      r: acc.r + sample.r,
      g: acc.g + sample.g,
      b: acc.b + sample.b
    }), { r: 0, g: 0, b: 0 });
    
    avgColor.r /= samples.length;
    avgColor.g /= samples.length;
    avgColor.b /= samples.length;
    
    // Calculate color variance to detect uniform backgrounds (buttons)
    const colorVariance = samples.reduce((acc, sample) => {
      const dr = sample.r - avgColor.r;
      const dg = sample.g - avgColor.g;
      const db = sample.b - avgColor.b;
      return acc + (dr * dr + dg * dg + db * db);
    }, 0) / samples.length;
    
    // Detect edges to find button boundaries
    const edgeStrength = detectEdges(canvas, clickX, clickY, 30);
    
    // Determine element type based on analysis (more lenient thresholds for better detection)
    const isButton = colorVariance < 5000 && edgeStrength > 0.15;
    const isDesktopIcon = clickY < canvas.height * 0.7 && colorVariance > 5000;
    const isTextArea = colorVariance < 1000 && edgeStrength < 0.2;
    
    return {
      type: isButton ? 'button' : isDesktopIcon ? 'desktop-icon' : isTextArea ? 'text-area' : 'unknown',
      colorVariance,
      edgeStrength,
      avgColor,
      confidence: isButton ? 0.8 : isDesktopIcon ? 0.7 : isTextArea ? 0.6 : 0.3
    };
  };
  
  // Edge detection helper
  const detectEdges = (canvas: HTMLCanvasElement, centerX: number, centerY: number, radius: number): number => {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(
      Math.max(0, centerX - radius),
      Math.max(0, centerY - radius),
      Math.min(radius * 2, canvas.width - Math.max(0, centerX - radius)),
      Math.min(radius * 2, canvas.height - Math.max(0, centerY - radius))
    );
    
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    let edgeSum = 0;
    let pixelCount = 0;
    
    // Simple Sobel edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Convert to grayscale
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        
        // Get neighboring pixels
        const neighbors = [
          0.299 * data[((y-1) * width + (x-1)) * 4] + 0.587 * data[((y-1) * width + (x-1)) * 4 + 1] + 0.114 * data[((y-1) * width + (x-1)) * 4 + 2],
          0.299 * data[((y-1) * width + x) * 4] + 0.587 * data[((y-1) * width + x) * 4 + 1] + 0.114 * data[((y-1) * width + x) * 4 + 2],
          0.299 * data[((y-1) * width + (x+1)) * 4] + 0.587 * data[((y-1) * width + (x+1)) * 4 + 1] + 0.114 * data[((y-1) * width + (x+1)) * 4 + 2],
          0.299 * data[(y * width + (x-1)) * 4] + 0.587 * data[(y * width + (x-1)) * 4 + 1] + 0.114 * data[(y * width + (x-1)) * 4 + 2],
          0.299 * data[(y * width + (x+1)) * 4] + 0.587 * data[(y * width + (x+1)) * 4 + 1] + 0.114 * data[(y * width + (x+1)) * 4 + 2],
          0.299 * data[((y+1) * width + (x-1)) * 4] + 0.587 * data[((y+1) * width + (x-1)) * 4 + 1] + 0.114 * data[((y+1) * width + (x-1)) * 4 + 2],
          0.299 * data[((y+1) * width + x) * 4] + 0.587 * data[((y+1) * width + x) * 4 + 1] + 0.114 * data[((y+1) * width + x) * 4 + 2],
          0.299 * data[((y+1) * width + (x+1)) * 4] + 0.587 * data[((y+1) * width + (x+1)) * 4 + 1] + 0.114 * data[((y+1) * width + (x+1)) * 4 + 2]
        ];
        
        // Sobel X and Y gradients
        const gx = (-1 * neighbors[0] + 1 * neighbors[2] + -2 * neighbors[3] + 2 * neighbors[4] + -1 * neighbors[5] + 1 * neighbors[7]);
        const gy = (-1 * neighbors[0] + -2 * neighbors[1] + -1 * neighbors[2] + 1 * neighbors[5] + 2 * neighbors[6] + 1 * neighbors[7]);
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edgeSum += magnitude;
        pixelCount++;
      }
    }
    
    return pixelCount > 0 ? edgeSum / pixelCount / 255 : 0;
  };



  // REMOVED: Global mouse click listener (Microsoft Store compliance)
  // The app now uses ONLY hotkeys for screenshot capture (Ctrl+Shift+S)
  // Global mouse hooks are flagged as security risks by Microsoft Store

  // Listen for debug logs from main process
  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.onDebugLog) return;

    const removeListener = window.electronAPI.onDebugLog((event: any, debugData: any) => {
      logger.log('🔍 [MAIN PROCESS DEBUG]', debugData);
    });

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  // Listen for native screenshot events (instant capture) - ALWAYS active
  useEffect(() => {
    logger.log('Native screenshot listener useEffect - electronAPI:', !!window.electronAPI);

    if (!window.electronAPI) {
      logger.log('Early return from native screenshot listener - no electronAPI');
      return;
    }

    const handleNativeScreenshot = async (event: any, screenshotData: {
      pngBuffer: string; // Now expecting base64 string instead of Buffer
      clickX: number;
      clickY: number;
      timestamp: number;
      clickId?: string;
      stepDescription?: string;
    }) => {
      try {
        // Check if we're currently importing a project - if so, skip native screenshot processing
        const { isImportingProject, currentProject } = useAppStore.getState();
        
        logger.log('[DEBUG-NATIVE-SCREENSHOT] Native screenshot handler triggered:', {
          hasCurrentProject: !!currentProject,
          currentProjectName: currentProject?.name,
          currentProjectId: currentProject?.id,
          isImportingProject,
          timestamp: new Date().toISOString(),
          screenshotTimestamp: screenshotData.timestamp,
          clickPosition: `(${screenshotData.clickX}, ${screenshotData.clickY})`
        });
        
        if (isImportingProject) {
          logger.log('[DEBUG-IMPORT] Skipping native screenshot processing during project import');
          return;
        }
        
        logger.log('[DEBUG-RENDERER] Native screenshot received:', {
          base64DataLength: screenshotData.pngBuffer?.length || 'undefined',
          clickX: screenshotData.clickX,
          clickY: screenshotData.clickY,
          clickId: screenshotData.clickId,
          timestamp: screenshotData.timestamp,
          bufferType: typeof screenshotData.pngBuffer,
          isBase64String: typeof screenshotData.pngBuffer === 'string',
          eventType: typeof event,
          screenshotDataKeys: Object.keys(screenshotData || {})
        });
        
        // Native screenshots are always processed (independent of isCapturing state)
        logger.log('[DEBUG-RENDERER] Processing native screenshot - always active mode');
        logger.log('[DEBUG-RENDERER] Current isCapturing state:', isCapturing);
        
        // Validate screenshot data
        if (!screenshotData) {
          logger.error('[DEBUG-RENDERER] No screenshot data received');
          toast.error(t('toast.noScreenshotData'));
          return;
        }
        
        if (!screenshotData.pngBuffer) {
          logger.error('[DEBUG-RENDERER] No PNG buffer in screenshot data');
          toast.error(t('toast.noImageData'));
          return;
        }

        // Create unique click ID for deduplication
        const clickId = screenshotData.clickId || `native-${screenshotData.clickX}-${screenshotData.clickY}-${screenshotData.timestamp}`;
        
        // Check if we've already processed this screenshot
        if (processedClicks.current.has(clickId)) {
          logger.log('🚫 Ignoring duplicate native screenshot:', clickId);
          return;
        }
        
        // Mark this screenshot as processed
        processedClicks.current.add(clickId);
        
        // Clean up old processed clicks (keep last 100)
        if (processedClicks.current.size > 100) {
          const clicksArray = Array.from(processedClicks.current);
          processedClicks.current.clear();
          clicksArray.slice(-50).forEach(id => processedClicks.current.add(id));
        }

        // Create data URL from base64 string (no conversion needed)
        logger.log('[DEBUG-RENDERER] Creating data URL from base64 string...');
        const base64Data = screenshotData.pngBuffer; // Already a base64 string
        const dataUrl = `data:image/jpeg;base64,${base64Data}`;
        logger.log('[DEBUG-RENDERER] Data URL creation complete, base64 length:', base64Data.length);

        // Create screenshot object
        // Estimate original buffer size from base64 string (base64 is ~33% larger than original)
        const bufferSize = Math.floor((screenshotData.pngBuffer.length * 3) / 4);
        const screenshot: Screenshot = {
          id: uuidv4(),
          timestamp: Date.now(),
          imageData: dataUrl,
          clickX: screenshotData.clickX,
          clickY: screenshotData.clickY,
          description: `  `,
          filename: `screenshot-${Date.now()}.jpg`,
          size: bufferSize
        };

        // Screenshot object creation logging removed for performance

        

        // Add to screenshots state
        setScreenshots(prev => {
          const newScreenshots = [...prev, screenshot];
          return newScreenshots;
        });

        // Update capture stats
        setCaptureStats(prev => ({
          ...prev,
          screenshots: prev.screenshots + 1
        }));

        // Save to current project if available
        const { updateProject, setCurrentProject } = useAppStore.getState();
        if (currentProject && window.electronAPI.saveProjectScreenshot) {
          try {
            logger.log('[DEBUG-NATIVE-SCREENSHOT] Saving screenshot to project:', {
              projectName: currentProject.name,
              projectId: currentProject.id,
              filename: screenshot.filename,
              timestamp: new Date().toISOString()
            });
            
            // Convert base64 back to buffer for saving (the save function expects buffer data)
            const saveResult = await window.electronAPI.saveProjectScreenshot(
              currentProject.name,
              screenshot.filename,
              screenshotData.pngBuffer // Pass base64 string - the save function will handle conversion
            );
            
            logger.log('[DEBUG-NATIVE-SCREENSHOT] Screenshot saved successfully:', {
              projectName: currentProject.name,
              savedPath: saveResult.filePath,
              relativePath: saveResult.relativePath
            });
            // Screenshot save logging removed for performance
            
            // Add filePath to screenshot object
            screenshot.filePath = saveResult.filePath;
            
            // Create documentation step — use auto-generated description from UIAutomation if available
            const stepTitle = `Step ${(currentProject.metadata?.documentationSteps || []).length + 1}`;
            const stepDescription = screenshotData.stepDescription || '';
            
            // Create documentation step
            const newDocumentationStep = {
              id: screenshot.id,
              timestamp: screenshot.timestamp,
              title: stepTitle,
              description: stepDescription,
              screenshot: saveResult.relativePath,
              actionType: 'click' as const,
              element: 'Interactive element',
              isGenerated: true // Mark as auto-generated
            };
            
            // Update project metadata with the complete screenshot object and documentation step
            const updatedProject = {
              ...currentProject,
              metadata: {
                ...currentProject.metadata,
                screenshots: [...(currentProject.metadata?.screenshots || []), {
                  id: screenshot.id,
                  timestamp: screenshot.timestamp,
                  filePath: screenshot.filePath,
                  clickX: screenshot.clickX,
                  clickY: screenshot.clickY,
                  description: screenshot.description,
                  filename: screenshot.filename,
                  size: screenshot.size
                }],
                documentationSteps: [...(currentProject.metadata?.documentationSteps || []), newDocumentationStep]
              }
            };
            
            updateProject(currentProject.id, updatedProject);
            setCurrentProject(updatedProject);
            
          } catch (saveError) {
            logger.error('Error saving native screenshot to project:', saveError);
          }
        }

        // Show success toast
        toast.success(t('toast.nativeScreenshot', { size: bufferSize }), {
          duration: 2000
        });

      } catch (error) {
        logger.error('Error handling native screenshot:', error);
        toast.error(t('toast.nativeScreenshotFailed'));
      }
    };

    // Add IPC listener for native screenshots using the exposed API
    if (window.electronAPI.onNativeScreenshotReady) {
      // IPC listener setup logging removed for performance
      
      // Add the actual screenshot handler with enhanced debugging
      const removeListener = window.electronAPI.onNativeScreenshotReady((event: any, data: any) => {
        // Call the actual handler (which will check isCapturing internally)
        handleNativeScreenshot(event, data);
      });
      
      // Listener registration logging removed for performance
      
      return () => {
        if (removeListener) {
          removeListener();
        }
      };
    } else {
      logger.error('electronAPI.onNativeScreenshotReady is not available!');
      return () => {};
    }
  }, []); // No dependencies needed for this effect

  // Listen for auto-capture click detection events (live feed)
  useEffect(() => {
    if (!window.electronAPI?.onAutoCaptureClickDetected) return;

    const removeClickListener = window.electronAPI.onAutoCaptureClickDetected((data) => {
      setRecentAutoClicks(prev => {
        const updated = [...prev, data];
        // Keep last 20 clicks, display last 5
        return updated.slice(-20);
      });
    });

    let removeErrorListener: (() => void) | undefined;
    if (window.electronAPI.onAutoCaptureError) {
      removeErrorListener = window.electronAPI.onAutoCaptureError((data) => {
        logger.error('Auto-capture error:', data.error);
      });
    }

    return () => {
      removeClickListener();
      if (removeErrorListener) removeErrorListener();
    };
  }, []);

  // Helper function to get image URL from screenshot (handles both imageData and filePath)
  const getScreenshotImageUrl = async (screenshot: Screenshot): Promise<string | null> => {
    // Priority 1: Use imageData if available (base64 format)
    if (screenshot.imageData && screenshot.imageData.startsWith('data:')) {
      return screenshot.imageData;
    }
    
    // Priority 2: Load from filePath using electronAPI.getFileUrl
    if (screenshot.filePath && window.electronAPI?.getFileUrl) {
      try {
        const fileUrl = await window.electronAPI.getFileUrl(screenshot.filePath);
        // Image loading logging removed for performance
        return fileUrl;
      } catch (error) {
        logger.error('Failed to load image from filePath:', error);
        return null;
      }
    }
    
    logger.warn('Screenshot has no imageData or filePath for ID:', screenshot.id);
    return null;
  };

  // Helper function to format source names for better user experience
  const formatSourceName = (sourceName: string, sourceType: 'screen' | 'window'): string => {
    // Handle screen sources
    if (sourceType === 'screen') {
      if (sourceName.toLowerCase().includes('entire screen')) {
        return 'Entire Screen';
      }
      // Keep screen numbers (Screen 1, Screen 2, etc.) for multi-monitor support
      return sourceName.trim();
    }

    // Handle window sources - extract application names
    const name = sourceName.trim();

    // Common application patterns (check most specific first)
    // Check Explorer BEFORE IDE names, since folder paths in Explorer titles can contain app names
    if (name.includes('File Explorer') || name.includes('Explorer.EXE')) {
      return 'File Explorer';
    }
    // Trae IDE: titles end with " - Trae" — don't match folder names containing "trae"
    if (name === 'Trae' || name.endsWith(' - Trae') || name.endsWith(' — Trae')) {
      return 'Trae';
    }
    // Docfai app window — exact match only, not folder names
    if (name === 'Docfai' || name.startsWith('Docfai ')) {
      return 'Docfai';
    }
    if (name.includes('Visual Studio Code')) {
      return 'VS Code';
    }
    if (name.includes('Chrome') || name.includes('Google Chrome')) {
      return 'Chrome';
    }
    if (name.includes('Firefox') || name.includes('Mozilla Firefox')) {
      return 'Firefox';
    }
    if (name.includes('Edge') || name.includes('Microsoft Edge')) {
      return 'Edge';
    }
    if (name.includes('Notepad')) {
      return 'Notepad';
    }
    if (name.includes('Word') || name.includes('Microsoft Word')) {
      return 'Word';
    }
    if (name.includes('Excel') || name.includes('Microsoft Excel')) {
      return 'Excel';
    }
    if (name.includes('PowerPoint') || name.includes('Microsoft PowerPoint')) {
      return 'PowerPoint';
    }
    if (name.includes('Outlook') || name.includes('Microsoft Outlook')) {
      return 'Outlook';
    }
    if (name.includes('Teams') || name.includes('Microsoft Teams')) {
      return 'Teams';
    }
    if (name.includes('Slack')) {
      return 'Slack';
    }
    if (name.includes('Discord')) {
      return 'Discord';
    }
    if (name.includes('Zoom')) {
      return 'Zoom';
    }
    if (name.includes('Calculator')) {
      return 'Calculator';
    }
    if (name.includes('Settings')) {
      return 'Settings';
    }
    if (name.includes('Control Panel')) {
      return 'Control Panel';
    }
    
    // Extract application name from common window title patterns
    // Pattern: "Document - Application" or "Application - Document"
    const dashSplit = name.split(' - ');
    if (dashSplit.length >= 2) {
      // Try to identify which part is the application name
      const lastPart = dashSplit[dashSplit.length - 1];
      const firstPart = dashSplit[0];

      // Check if last part is a known application name
      if (lastPart.includes('Visual Studio Code') || lastPart === 'Code') {
        return 'VS Code';
      }
      if (lastPart.includes('Chrome')) {
        return 'Chrome';
      }
      if (lastPart.includes('Firefox')) {
        return 'Firefox';
      }
      if (lastPart.includes('Edge')) {
        return 'Edge';
      }

      // If last part looks like an app name (no file extensions), use it
      if (!lastPart.includes('.') && lastPart.length < 25 && lastPart.length > 0) {
        return lastPart;
      }
      // Otherwise use first part if it's reasonable length
      if (firstPart.length < 25 && !firstPart.includes('.') && firstPart.length > 0) {
        return firstPart;
      }
    }
    
    // Remove common file extensions and paths
    let cleanName = name
      .replace(/\.[a-zA-Z0-9]+$/, '') // Remove file extensions
      .replace(/.*[\\\/]/, '') // Remove file paths
      .replace(/\s*-\s*.*$/, '') // Remove everything after first dash
      .trim();
    
    // If name is still too long, truncate it
    if (cleanName.length > 15) {
      cleanName = cleanName.substring(0, 15) + '...';
    }
    
    return cleanName || 'Unknown Window';
  };

  const loadSources = async () => {
    try {
      if (window.electronAPI) {
        const electronSources = await window.electronAPI.getSources();
        
        if (!electronSources || electronSources.length === 0) {
          toast.warning(t('toast.noSourcesFound'));
          // Provide fallback screen option
          const fallbackSources: CaptureSource[] = [
            {
              id: 'entire-screen',
              name: formatSourceName('Entire screen (fallback)', 'screen'),
              type: 'screen',
              selected: true
            }
          ];
          setCaptureSources(fallbackSources);
          setCaptureStats(prev => ({
            ...prev,
            source: 'Entire screen (fallback)'
          }));
          return;
        }
        
        // Filter out system overlays and unwanted sources
        const filteredSources = electronSources.filter(source => {
          const name = source.name.toLowerCase();

          // Exclude patterns for system overlays and GPU software
          const excludePatterns = [
            'nvidia',
            'geforce',
            'amd radeon',
            'radeon software',
            'shadowplay',
            'rtss',
            'rivatuner',
            'msi afterburner',
            'fraps',
            'discord overlay',
            'steam overlay',
            'xbox game bar',
            'nvidia share',
            'nvidia broadcast'
          ];

          return !excludePatterns.some(pattern => name.includes(pattern));
        });

        const formattedSources: CaptureSource[] = filteredSources.map(source => {
          const sourceType = source.id.startsWith('screen') ? 'screen' : 'window';
          return {
            id: source.id,
            name: formatSourceName(source.name, sourceType),
            type: sourceType,
            thumbnail: typeof source.thumbnail === 'string' ? source.thumbnail : source.thumbnail.toDataURL(),
            selected: false
          };
        });
        setCaptureSources(formattedSources);
        
        // Auto-select primary screen
        const primaryScreen = formattedSources.find(s => s.type === 'screen');
        if (primaryScreen) {
          setCaptureSources(prev => prev.map(source => ({
            ...source,
            selected: source.id === primaryScreen.id
          })));
          setCaptureStats(prev => ({
            ...prev,
            source: primaryScreen.name
          }));
        }
        
        // Show info if some sources were filtered
        const screenCount = formattedSources.filter(s => s.type === 'screen').length;
        const windowCount = formattedSources.filter(s => s.type === 'window').length;
        logger.log(`Loaded ${screenCount} screen(s) and ${windowCount} window(s) for capture`);
        
      } else {
        // Fallback for web environment
        const fallbackSources: CaptureSource[] = [
          {
            id: 'entire-screen',
            name: formatSourceName('Entire screen', 'screen'),
            type: 'screen',
            selected: true
          }
        ];
        setCaptureSources(fallbackSources);
        setCaptureStats(prev => ({
          ...prev,
          source: 'Entire screen'
        }));
      }
    } catch (error) {
      logger.error('Failed to load capture sources:', error);
      toast.error(t('toast.loadSourcesFailed'));
      
      // Provide fallback even on error
      const fallbackSources: CaptureSource[] = [
        {
          id: 'entire-screen',
          name: formatSourceName('Entire screen (fallback)', 'screen'),
          type: 'screen',
          selected: true
        }
      ];
      setCaptureSources(fallbackSources);
      setCaptureStats(prev => ({
        ...prev,
        source: 'Entire screen (fallback)'
      }));
    }
  };

  const handleDeleteScreenshot = (screenshotId: string) => {
    setScreenshots(prev => prev.filter(s => s.id !== screenshotId));
    setCaptureStats(prev => ({
      ...prev,
      screenshots: prev.screenshots - 1
    }));
    
    // Update project if available — sync both screenshots and documentationSteps
    const { currentProject, updateProject, setCurrentProject } = useAppStore.getState();
    if (currentProject) {
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          screenshots: currentProject.metadata?.screenshots?.filter(s => s.id !== screenshotId) || [],
          documentationSteps: currentProject.metadata?.documentationSteps?.filter(s => s.id !== screenshotId) || []
        }
      };
      updateProject(currentProject.id, updatedProject);
      setCurrentProject(updatedProject);
    }
    
    toast.success(t('toast.screenshotDeleted'));
  };

  // Drag-reorder state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggedId) setDragOverId(id);
  };

  const handleDragEnd = () => {
    if (draggedId && dragOverId && draggedId !== dragOverId) {
      setScreenshots(prev => {
        const newList = [...prev];
        const fromIdx = newList.findIndex(s => s.id === draggedId);
        const toIdx = newList.findIndex(s => s.id === dragOverId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const [moved] = newList.splice(fromIdx, 1);
        newList.splice(toIdx, 0, moved);

        // Persist reordered screenshots and documentationSteps to project
        const { currentProject, updateProject, setCurrentProject } = useAppStore.getState();
        if (currentProject) {
          // Reorder documentationSteps to match the new screenshot order
          const existingSteps = currentProject.metadata?.documentationSteps || [];
          const reorderedSteps = newList
            .map(s => existingSteps.find(step => step.id === s.id))
            .filter(Boolean);
          // Append any steps that weren't matched (safety net)
          const matchedIds = new Set(reorderedSteps.map(s => s!.id));
          const unmatchedSteps = existingSteps.filter(s => !matchedIds.has(s.id));

          const updatedProject = {
            ...currentProject,
            metadata: {
              ...currentProject.metadata,
              screenshots: newList.map(s => ({ ...s, imageData: undefined })),
              documentationSteps: [...reorderedSteps, ...unmatchedSteps],
            }
          };
          updateProject(currentProject.id, updatedProject);
          setCurrentProject(updatedProject);
        }

        return newList;
      });
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  // Inline description change handler
  const handleDescriptionChange = (id: string, description: string) => {
    setScreenshots(prev => prev.map(s => s.id === id ? { ...s, description } : s));

    // Persist to project
    const { currentProject, updateProject, setCurrentProject } = useAppStore.getState();
    if (currentProject) {
      const updatedScreenshots = (currentProject.metadata?.screenshots || []).map(s =>
        s.id === id ? { ...s, description } : s
      );
      const updatedSteps = (currentProject.metadata?.documentationSteps || []).map(s =>
        s.id === id ? { ...s, description } : s
      );
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          screenshots: updatedScreenshots,
          documentationSteps: updatedSteps,
        }
      };
      updateProject(currentProject.id, updatedProject);
      setCurrentProject(updatedProject);
    }
  };

  // Pause/resume capture
  const handlePauseCapture = async () => {
    if (!isCapturing) return;
    try {
      if (captureMode === 'auto') {
        if (window.electronAPI?.stopAutoCapture) {
          await window.electronAPI.stopAutoCapture();
        }
      } else {
        if (window.electronAPI?.stopScreenshotCapture) {
          await window.electronAPI.stopScreenshotCapture();
        }
      }
      setIsPaused(true);
      toast.info(t('toast.capturePaused'));
    } catch (error) {
      logger.error('Error pausing capture:', error);
    }
  };

  const handleResumeCapture = async () => {
    if (!isCapturing || !isPaused) return;
    const selectedSource = captureSources.find(s => s.selected);
    if (!selectedSource) return;
    try {
      if (captureMode === 'auto') {
        await window.electronAPI.startAutoCapture({
          debounceMs: autoCaptureConfig.debounceMs,
          captureRightClicks: autoCaptureConfig.captureRightClicks,
          sourceInfo: selectedSource,
          initialStepCount: captureStats.screenshots,
        });
      } else {
        await window.electronAPI.startScreenshotCapture(selectedSource);
      }
      setIsPaused(false);
      toast.success(t('toast.captureResumed'));
    } catch (error) {
      logger.error('Error resuming capture:', error);
      toast.error(t('toast.resumeFailed'));
    }
  };

  // Source switch during capture
  const handleSourceSwitchDuringCapture = async (sourceId: string) => {
    const newSource = captureSources.find(s => s.id === sourceId);
    if (!newSource) return;

    // Update selection
    setCaptureSources(sources => sources.map(s => ({ ...s, selected: s.id === sourceId })));
    setCaptureStats(prev => ({ ...prev, source: newSource.name }));

    if (!isCapturing || isPaused) return;

    // Stop current, restart with new source
    try {
      if (captureMode === 'auto') {
        if (window.electronAPI?.stopAutoCapture) await window.electronAPI.stopAutoCapture();
        await window.electronAPI.startAutoCapture({
          debounceMs: autoCaptureConfig.debounceMs,
          captureRightClicks: autoCaptureConfig.captureRightClicks,
          sourceInfo: newSource,
          initialStepCount: captureStats.screenshots,
        });
      } else {
        if (window.electronAPI?.stopScreenshotCapture) await window.electronAPI.stopScreenshotCapture();
        await window.electronAPI.startScreenshotCapture(newSource);
      }
      toast.success(t('toast.switchedSource', { name: newSource.name }));
    } catch (error) {
      logger.error('Error switching source:', error);
      toast.error(t('toast.switchFailed'));
    }
  };

  // Update duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isCapturing && captureStartTime) {
      interval = setInterval(() => {
        const elapsed = Date.now() - captureStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        setCaptureStats(prev => ({
          ...prev,
          duration: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        }));
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCapturing, captureStartTime]);

  const handleSourceSelect = (sourceId: string) => {
    setCaptureSources(sources =>
      sources.map(source => ({
        ...source,
        selected: source.id === sourceId
      }))
    );

    const selectedSource = captureSources.find(s => s.id === sourceId);
    if (selectedSource) {
      setCaptureStats(prev => ({
        ...prev,
        source: selectedSource.name
      }));
    }

    // Stop preview when changing source
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      setPreviewStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  const startPreview = async () => {
    const selectedSource = captureSources.find(s => s.selected);

    if (!selectedSource) {
      toast.error(t('toast.previewSelectFirst'));
      return;
    }

    // Stop existing preview first
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      setPreviewStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    try {
      if (window.electronAPI) {
        logger.log('Starting preview for source:', selectedSource.id);

        // Use getUserMedia with chromeMediaSource for Electron
        const constraints = {
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSource.id,
              maxWidth: 1920,
              maxHeight: 1080
            }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints as any);
        logger.log('MediaStream created successfully');

        setPreviewStream(stream);

        // Wait for state update
        await new Promise(resolve => setTimeout(resolve, 100));

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.autoplay = true;
          videoRef.current.playsInline = true;

          videoRef.current.load();

          try {
            await videoRef.current.play();
            toast.success(t('toast.previewStarted'));
          } catch (playError) {
            logger.error('Error playing video:', playError);
            // Retry
            setTimeout(async () => {
              try {
                if (videoRef.current) {
                  await videoRef.current.play();
                }
              } catch (retryError) {
                logger.error('Retry failed:', retryError);
              }
            }, 100);
          }
        }
      } else {
        toast.error(t('toast.previewDesktopOnly'));
      }
    } catch (error) {
      logger.error('Error starting preview:', error);
      toast.error(t('toast.previewFailed'));

      // Clean up on error
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
        setPreviewStream(null);
      }
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error(t('toast.noProjectName'));
      return;
    }

    try {
      // Create project folder structure if in Electron environment
      if (window.electronAPI) {
        await window.electronAPI.createProjectFolder(newProjectName.trim());
      }

      // Create the project object
      const newProject = {
        name: newProjectName.trim(),
        description: newProjectDescription.trim(),
        recordings: [],
        status: 'draft' as const,
        metadata: {
          totalDuration: 0,
          actionCount: 0,
          lastActivity: new Date().toISOString(),
        },
      };

      const createdProject = addProject(newProject);

      // Set as current project immediately
      setCurrentProject(createdProject);

      setNewProjectName('');
      setNewProjectDescription('');
      setShowNewProjectModal(false);
      toast.success(t('toast.projectCreated'));
    } catch (error) {
      logger.error('Failed to create project folder:', error);
      toast.error(t('toast.projectFolderFailed'));
    }
  };

  const handleSelectProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      toast.success(t('toast.projectSelected', { name: project.name }));
    }
  };

  const handleSaveHotkeys = async () => {
    if (window.electronAPI?.saveHotkeyConfig) {
      const result = await window.electronAPI.saveHotkeyConfig(hotkeyConfig);
      if (result.success) {
        toast.success(t('toast.hotkeySaved'));
        setIsEditingHotkey(false);
      } else {
        toast.error(t('toast.hotkeyFailed'));
      }
    }
  };

  const handleStartCapture = async () => {
    try {
      // Check if we're in Electron environment
      if (!window.electronAPI) {
        toast.error(t('toast.desktopRequired'));
        return;
      }

      const selectedSource = captureSources.find(s => s.selected);
      if (!selectedSource) {
        toast.error(t('toast.noSource'));
        return;
      }

      if (!currentProject) {
        toast.error(t('toast.noProject'));
        return;
      }

      logger.log('🚀 Setting isCapturing to true - starting capture');
      setIsCapturing(true);
      setCapturingScreenshots(true);
      setCaptureCompleted(false); // Reset completion state when starting new capture
      setCaptureStartTime(Date.now());
      logger.log('🚀 isCapturing state after setting:', true);
      setScreenshots([]);
      setCaptureStats(prev => ({ ...prev, screenshots: 0 }));

      // MEMORY LEAK FIX: Clear processed clicks before starting new capture
      processedClicks.current.clear();
      logger.log('✅ Processed clicks Set cleared for new capture session');

      // SECURITY: Enhanced input capture service removed (service deleted)

      // Use existing project if projectId is provided, otherwise create new one
      let captureProject;
      if (projectId) {
        captureProject = projects.find(p => p.id === projectId);
        if (captureProject) {
          setCurrentProject(captureProject);
        } else {
          toast.error(t('toast.projectNotFound'));
          return;
        }
      } else {
        const newProjectData = {
          name: projectName || `Step-by-Step Screenshots ${new Date().toLocaleDateString()}`,
          description: `Screen capture session - ${selectedSource.name}`,
          status: 'recording' as const,
          projectType: 'interactive-screenshots' as const,
          recordings: [],
          metadata: {
            totalDuration: 0,
            actionCount: 0,
            lastActivity: new Date().toISOString(),
            screenshots: [],
            documentationSteps: []
          }
        };
        
        addProject(newProjectData);
        
        // Get the actual project from store with generated ID
        const { projects } = useAppStore.getState();
        captureProject = projects[projects.length - 1]; // Most recently added project
        setCurrentProject(captureProject);
      }

      if (captureMode === 'auto') {
        // AUTO-CAPTURE MODE: start click detection + UIAutomation
        // Pass source info directly — the handler sets up everything
        const autoResult = await window.electronAPI.startAutoCapture({
          debounceMs: autoCaptureConfig.debounceMs,
          captureRightClicks: autoCaptureConfig.captureRightClicks,
          sourceInfo: selectedSource,
        });
        if (!autoResult.success) {
          throw new Error(autoResult.error || 'Failed to start auto-capture');
        }

        // Clear live click feed
        setRecentAutoClicks([]);

        logger.log('📸 Auto-capture mode activated');
        toast.success(t('toast.autoCaptureActivated'));
      } else {
        // MANUAL MODE: existing hotkey-based capture
        const startResult = await window.electronAPI.startScreenshotCapture(selectedSource);
        if (!startResult.success) {
          throw new Error(startResult.error || 'Failed to start screenshot capture');
        }

        logger.log('📸 Manual hotkey mode - press hotkey to capture');
        toast.success(t('toast.hotkeyCaptureActivated'));
      }

      // Screenshot capture is now handled entirely in handleGlobalMouseClick
      // No need for separate screenshot-captured event listener

    } catch (error: any) {
      logger.error('Capture start error:', error?.message || error);
      toast.error(error?.message || t('toast.captureStartFailed'));
      setIsCapturing(false);
      setCapturingScreenshots(false);
      setCaptureStartTime(null);
    }
  };

  const handleGoToEdit = () => {
    const { currentProject } = useAppStore.getState();
    if (currentProject && screenshots.length > 0) {
      navigate('/editing', {
        state: {
          projectId: currentProject.id,
          fromInteractiveCapture: true,
          screenshots: screenshots,
          navigationScreenshots: screenshots
        }
      });
    }
  };

  const handleStopCapture = async () => {
    try {
      if (captureMode === 'auto') {
        // Stop auto-capture service
        if (window.electronAPI.stopAutoCapture) {
          const stopResult = await window.electronAPI.stopAutoCapture();
          if (!stopResult.success) {
            logger.error('Failed to stop auto-capture:', stopResult.error);
          } else {
            logger.log(`📸 Auto-capture stopped. ${stopResult.captureCount} screenshots captured.`);
          }
        }
      } else {
        // Stop manual hotkey capture
        if (window.electronAPI.stopScreenshotCapture) {
          const stopResult = await window.electronAPI.stopScreenshotCapture();
          if (!stopResult.success) {
            logger.error('Failed to stop screenshot capture:', stopResult.error);
          } else {
            logger.log('🎯 Mouse event monitoring stopped in main process');
          }
        }
      }

      logger.log('📸 Stopping capture mode');

      // Wait briefly for any in-flight native screenshots to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // NOW freeze the screenshot list to prevent race conditions
      const frozenScreenshots = [...screenshots];
      logger.log(`📸 Frozen screenshot count: ${frozenScreenshots.length}`);

      setIsCapturing(false);
      setIsPaused(false);
      setCapturingScreenshots(false);
      setCaptureStartTime(null);

      // MEMORY LEAK FIX: Clear processed clicks Set to free memory
      processedClicks.current.clear();
      logger.log('✅ Processed clicks Set cleared to free memory');

      if (frozenScreenshots.length > 0) {
        // Save screenshots to the current project before navigating
        const { currentProject, updateProject, setCurrentProject } = useAppStore.getState();
        if (currentProject) {
          const updatedProject = {
            ...currentProject,
            status: 'completed' as const,
            metadata: {
              ...currentProject.metadata,
              screenshots: frozenScreenshots.map(screenshot => ({
                ...screenshot,
                // Remove imageData if it exists (legacy support)
                imageData: undefined
              })),
              // Ensure documentation steps created during capture are preserved
              documentationSteps: currentProject.metadata?.documentationSteps || [],
              totalDuration: captureStartTime ? (Date.now() - captureStartTime) / 1000 : 0,
              actionCount: frozenScreenshots.length,
              lastActivity: new Date().toISOString(),
              projectType: 'interactive-screenshots'
            }
          };

          // Update project and ensure state is synchronized
          updateProject(currentProject.id, updatedProject);
          setCurrentProject(updatedProject);

          // Notify user that capture is completed
          toast.success(t('toast.captureCompleted', { count: frozenScreenshots.length }));

          // Set capture completed flag to show "Go to Edit" button
          setCaptureCompleted(true);
        }
      } else {
        toast.info(t('toast.noScreenshots'));
        setCaptureCompleted(false);
      }
    } catch (error) {
      logger.error('Error stopping capture:', error);
      toast.error(t('toast.stopFailed'));
    }
  };

  const selectedSource = captureSources.find(s => s.selected);

  // Onboarding hints
  const hintsSuppressed = useHintsSuppressed();

  const sourceGridRef = useRef<HTMLDivElement | null>(null);
  const captureModeRef = useRef<HTMLDivElement | null>(null);
  const startCaptureBtnRef = useRef<HTMLButtonElement | null>(null);
  const stopCaptureBtnRef = useRef<HTMLButtonElement | null>(null);
  const goToEditBtnRef = useRef<HTMLButtonElement | null>(null);

  const [sourceGridReady, setSourceGridReady] = useState(false);
  const [captureModeReady, setCaptureModeReady] = useState(false);
  const [startCaptureReady, setStartCaptureReady] = useState(false);
  const [stopCaptureReady, setStopCaptureReady] = useState(false);
  const [goToEditReady, setGoToEditReady] = useState(false);

  const assignSourceGridRef = useCallback((node: HTMLDivElement | null) => {
    sourceGridRef.current = node;
    setSourceGridReady(!!node);
  }, []);
  const assignCaptureModeRef = useCallback((node: HTMLDivElement | null) => {
    captureModeRef.current = node;
    setCaptureModeReady(!!node);
  }, []);
  const assignStartCaptureRef = useCallback((node: HTMLButtonElement | null) => {
    startCaptureBtnRef.current = node;
    setStartCaptureReady(!!node);
  }, []);
  const assignStopCaptureRef = useCallback((node: HTMLButtonElement | null) => {
    stopCaptureBtnRef.current = node;
    setStopCaptureReady(!!node);
  }, []);
  const assignGoToEditRef = useCallback((node: HTMLButtonElement | null) => {
    goToEditBtnRef.current = node;
    setGoToEditReady(!!node);
  }, []);

  const sourceHint = useOnboardingHint('is.sourceSelector', { priority: 100, when: !isCapturing && captureSources.length > 0 });
  const modeHint = useOnboardingHint('is.captureMode', { priority: 90, when: !isCapturing });
  const startHint = useOnboardingHint('is.startCapture', { priority: 80, when: !isCapturing && !!selectedSource && !!currentProject });
  const stopHint = useOnboardingHint('is.stopCapture', { priority: 70, when: isCapturing });
  const goToEditHint = useOnboardingHint('is.goToEdit', { priority: 60, when: screenshots.length > 0 && !isCapturing });

  return (
    <div className="min-h-full">
    <div className="flex h-full overflow-hidden">

      {/* ========== LEFT SIDEBAR ========== */}
      <div className="w-[480px] flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {t('header.title')}
              </h1>
              {currentProject ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{currentProject.name}</p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">{t('header.noProject')}</p>
              )}
            </div>
            <button
              onClick={toggleAllOnboardingHints}
              className={cn(
                "p-1.5 rounded-md transition-colors flex-shrink-0",
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

        {/* Create New Project prompt — shown when no project is selected */}
        {!currentProject && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">
                {t('noProject.prompt')}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                {t('noProject.description')}
              </p>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('noProject.createButton')}
              </button>
            </div>
          </div>
        )}

        {/* Source Selection */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('source.heading')}</h3>
            <button
              onClick={loadSources}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('source.refreshTitle')}
            >
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
          <div ref={assignSourceGridRef} className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
            {captureSources.map((source) => (
              <button
                key={source.id}
                onClick={() => isCapturing ? handleSourceSwitchDuringCapture(source.id) : handleSourceSelect(source.id)}
                className={cn(
                  "flex flex-col rounded-lg border-2 overflow-hidden text-left transition-all",
                  source.selected
                    ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-400 bg-white dark:bg-gray-700"
                )}
              >
                {/* Thumbnail preview */}
                <div className="w-full h-28 bg-gray-900 dark:bg-gray-900 overflow-hidden flex items-center justify-center">
                  {source.thumbnail ? (
                    <img src={source.thumbnail} alt={source.name} className="w-full h-full object-contain" />
                  ) : (
                    <Monitor className="w-8 h-8 text-gray-500" />
                  )}
                </div>
                {/* Source name + badge */}
                <div className="px-2.5 py-2 flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{source.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{source.type === 'screen' ? t('source.screen') : t('source.window')}</p>
                  </div>
                  {source.selected && (
                    <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Capture Mode Toggle */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('captureMode.heading')}</h3>
          <div ref={assignCaptureModeRef} className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => setCaptureMode('manual')}
              disabled={isCapturing}
              className={cn(
                "flex-1 py-1.5 px-2 text-xs font-medium transition-colors",
                captureMode === 'manual' ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300",
                isCapturing && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center justify-center gap-1">
                <Keyboard className="w-3 h-3" />
                {t('captureMode.hotkeys')}
              </div>
            </button>
            {!isStoreVersion && (
              <button
                onClick={() => setCaptureMode('auto')}
                disabled={isCapturing}
                className={cn(
                  "flex-1 py-1.5 px-2 text-xs font-medium transition-colors",
                  captureMode === 'auto' ? "bg-amber-600 text-white" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300",
                  isCapturing && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-center gap-1">
                  <Camera className="w-3 h-3" />
                  {t('captureMode.auto')}
                </div>
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
            {captureMode === 'auto' ? t('captureMode.hintAuto') : t('captureMode.hintManual', { hotkey: hotkeyConfig.primary })}
          </p>

          {/* Auto-capture right-click option */}
          {captureMode === 'auto' && !isCapturing && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCaptureConfig.captureRightClicks}
                onChange={(e) => setAutoCaptureConfig(prev => ({ ...prev, captureRightClicks: e.target.checked }))}
                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">{t('captureMode.captureRightClicks')}</span>
            </label>
          )}
        </div>

        {/* Capture Controls */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
          {!isCapturing ? (
            <button
              ref={assignStartCaptureRef}
              onClick={handleStartCapture}
              disabled={!selectedSource || !currentProject}
              className={cn(
                "w-full py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2",
                captureMode === 'auto'
                  ? "bg-amber-600 hover:bg-amber-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
              )}
            >
              <Play className="w-4 h-4" />
              {captureMode === 'auto' ? t('controls.startAutoCapture') : t('controls.startCapturing')}
            </button>
          ) : (
            <div className="space-y-2">
              {/* Status indicator */}
              <div className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                isPaused
                  ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300"
                  : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
              )}>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", isPaused ? "bg-yellow-500" : "bg-green-500 animate-pulse")} />
                  <span className="font-medium">{isPaused ? t('controls.paused') : t('controls.capturing')}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3 h-3" />
                  {captureStats.duration}
                </div>
              </div>

              {/* Pause / Resume + Stop buttons */}
              <div className="flex gap-2">
                <button
                  onClick={isPaused ? handleResumeCapture : handlePauseCapture}
                  className={cn(
                    "flex-1 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-1.5",
                    isPaused
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-yellow-500 hover:bg-yellow-600 text-white"
                  )}
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {isPaused ? t('controls.resume') : t('controls.pause')}
                </button>
                <button
                  ref={assignStopCaptureRef}
                  onClick={handleStopCapture}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5" />
                  {t('controls.stop')}
                </button>
              </div>
            </div>
          )}

          {/* Go to Edit */}
          {screenshots.length > 0 && !isCapturing && (
            <button
              ref={assignGoToEditRef}
              onClick={handleGoToEdit}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4 rotate-180" />
              {t('controls.goToEdit', { count: screenshots.length })}
            </button>
          )}
        </div>

        {/* Live Click Feed (auto-capture) */}
        {captureMode === 'auto' && isCapturing && recentAutoClicks.length > 0 && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              {t('liveClicks.heading')}
            </h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {recentAutoClicks.slice(-5).reverse().map((click, i) => (
                <div key={`${click.timestamp}-${i}`} className="flex items-center gap-1.5 p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded text-[10px]">
                  <div className={cn(
                    "px-1 py-0.5 rounded text-white font-medium",
                    click.clickType === 'rightclick' ? 'bg-purple-500' :
                    click.clickType === 'doubleclick' ? 'bg-orange-500' : 'bg-blue-500'
                  )}>
                    {click.clickType === 'rightclick' ? 'R' : click.clickType === 'doubleclick' ? 'D' : 'L'}
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 truncate">{click.stepDescription}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats summary */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{screenshots.length}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('stats.screenshots')}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{captureStats.duration}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('stats.duration')}</p>
            </div>
          </div>
        </div>

        {/* Settings (collapsible) */}
        <div className="p-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-full hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            {t('settings.heading')}
            <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", showSettings && "rotate-180")} />
          </button>

          {showSettings && (
            <div className="mt-3 space-y-3">
              {/* Hotkey config (manual mode only) */}
              {captureMode === 'manual' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">{t('settings.primaryHotkey')}</label>
                    {isEditingHotkey ? (
                      <input
                        type="text"
                        value={hotkeyConfig.primary}
                        onChange={(e) => setHotkeyConfig(prev => ({ ...prev, primary: e.target.value }))}
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    ) : (
                      <kbd className="inline-block px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">
                        {hotkeyConfig.primary}
                      </kbd>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">{t('settings.secondaryHotkey')}</label>
                    {isEditingHotkey ? (
                      <input
                        type="text"
                        value={hotkeyConfig.secondary || ''}
                        onChange={(e) => setHotkeyConfig(prev => ({ ...prev, secondary: e.target.value }))}
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    ) : (
                      <kbd className="inline-block px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">
                        {hotkeyConfig.secondary || t('settings.notSet')}
                      </kbd>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isEditingHotkey ? (
                      <>
                        <button onClick={() => { setIsEditingHotkey(false); if (window.electronAPI?.getHotkeyConfig) { window.electronAPI.getHotkeyConfig().then(r => { if (r.success && r.config) setHotkeyConfig(r.config); }); } }} className="flex-1 text-xs py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500">{t('settings.cancel')}</button>
                        <button onClick={handleSaveHotkeys} className="flex-1 text-xs py-1.5 bg-green-600 text-white rounded hover:bg-green-700">{t('settings.save')}</button>
                      </>
                    ) : (
                      <button onClick={() => setIsEditingHotkey(true)} disabled={isCapturing} className="text-xs py-1.5 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{t('settings.editHotkeys')}</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== MAIN CONTENT: Screenshot Feed ========== */}
      <div className="flex-1 overflow-y-auto p-6">
        {screenshots.length > 0 ? (
          <div className="max-w-4xl mx-auto space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('feed.capturedSteps', { count: screenshots.length })}
              </h2>
              {isCapturing && !isPaused && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  {t('feed.liveNotice')}
                </div>
              )}
            </div>

            {/* Screenshot list (drag-reorderable) */}
            {screenshots.map((screenshot, index) => (
              <ScreenshotCard
                key={screenshot.id}
                screenshot={screenshot}
                index={index}
                onPreview={() => setPreviewScreenshot(screenshot)}
                onDelete={() => handleDeleteScreenshot(screenshot.id)}
                getScreenshotImageUrl={getScreenshotImageUrl}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                isDragOver={dragOverId === screenshot.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Camera className="w-10 h-10 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {isCapturing ? t('feed.waitingTitle') : t('feed.readyTitle')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
                {isCapturing
                  ? captureMode === 'auto'
                    ? t('feed.capturingAutoDesc')
                    : t('feed.capturingManualDesc', { hotkey: hotkeyConfig.primary })
                  : t('feed.readyDesc')}
              </p>
              {isCapturing && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('feed.realtimeNote')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

    </div>

    {/* Preview Modal */}
    {previewScreenshot && (
      <PreviewModal
        screenshot={previewScreenshot}
        onClose={() => setPreviewScreenshot(null)}
        getScreenshotImageUrl={getScreenshotImageUrl}
      />
    )}

    {/* New Project Modal */}
    {showNewProjectModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('modal.title')}</h3>
            <button onClick={() => { setShowNewProjectModal(false); setNewProjectName(''); setNewProjectDescription(''); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('modal.projectName')}</label>
              <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder={t('modal.projectNamePlaceholder')} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('modal.description')}</label>
              <textarea value={newProjectDescription} onChange={(e) => setNewProjectDescription(e.target.value)} placeholder={t('modal.descriptionPlaceholder')} rows={3} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button onClick={() => { setShowNewProjectModal(false); setNewProjectName(''); setNewProjectDescription(''); }} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">{t('modal.cancel')}</button>
            <button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{t('modal.create')}</button>
          </div>
        </div>
      </div>
    )}

    {/* Onboarding coach marks */}
    {sourceHint.visible && sourceGridReady && (
      <CoachMark
        anchorRef={sourceGridRef}
        title={t('coach.sourceTitle')}
        description={t('coach.sourceDesc')}
        placement="right"
        onDismiss={sourceHint.dismiss}
      />
    )}
    {modeHint.visible && captureModeReady && (
      <CoachMark
        anchorRef={captureModeRef}
        title={t('coach.modeTitle')}
        description={t('coach.modeDesc')}
        placement="right"
        onDismiss={modeHint.dismiss}
      />
    )}
    {startHint.visible && startCaptureReady && (
      <CoachMark
        anchorRef={startCaptureBtnRef}
        title={t('coach.startTitle')}
        description={t('coach.startDesc')}
        placement="right"
        onDismiss={startHint.dismiss}
      />
    )}
    {stopHint.visible && stopCaptureReady && (
      <CoachMark
        anchorRef={stopCaptureBtnRef}
        title={t('coach.stopTitle')}
        description={t('coach.stopDesc')}
        placement="right"
        onDismiss={stopHint.dismiss}
      />
    )}
    {goToEditHint.visible && goToEditReady && (
      <CoachMark
        anchorRef={goToEditBtnRef}
        title={t('coach.editTitle')}
        description={t('coach.editDesc')}
        placement="top"
        onDismiss={goToEditHint.dismiss}
      />
    )}
    </div>
  );
};

export default InteractiveScreenshots;
