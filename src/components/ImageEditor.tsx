import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Download, Undo, Redo, Square, Eye, EyeOff, Zap, ZoomIn, ZoomOut, Move, RotateCcw, Maximize, Minimize, ArrowUpRight, Hash, Type, Crop, MousePointer2, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import debounce from 'lodash.debounce';
import DOMPurify from 'dompurify';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { CoachMark } from './CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';

// Register custom fonts with Quill
const Font = Quill.import('formats/font') as any;
Font.whitelist = ['sans-serif', 'arial', 'times-new-roman', 'courier', 'georgia', 'verdana', 'helvetica', 'calibri'];
Quill.register(Font, true);

// Register Size
const Size = Quill.import('formats/size') as any;
Size.whitelist = ['small', 'normal', 'large', 'huge'];
Quill.register(Size, true);

interface ImageEditorProps {
  imageData: string;
  onSave: (editedImageData: string, stepInfo?: { title: string; description: string; actionType: string }, keepOpen?: boolean) => void | Promise<void>;
  onClose: () => void;
  stepInfo?: {
    title: string;
    description: string;
    actionType: string;
  };
  onStepInfoChange?: (stepInfo: { title: string; description: string; actionType: string }) => void;
  stepId?: string;
  currentStepIndex?: number;
  totalSteps?: number;
  onNavigateStep?: (direction: 'prev' | 'next') => void;
}

interface DrawingAction {
  type: 'draw' | 'erase' | 'blur' | 'pixelate' | 'blackout' | 'arrow' | 'counter' | 'textbox';
  points: { x: number; y: number }[];
  color: string;
  lineWidth: number;
  tool: 'rectangle' | 'circle' | 'blur' | 'pixelate' | 'blackout' | 'arrow' | 'counter' | 'textbox' | 'crop';
  blurIntensity?: number;
  // New properties for enhanced tools
  text?: string; // For textbox tool
  counterNumber?: number; // For counter tool
  fontSize?: number; // For textbox tool
  isDraggable?: boolean; // For textbox tool
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageData, onSave, onClose, stepInfo, onStepInfoChange, stepId, currentStepIndex, totalSteps, onNavigateStep }) => {
  const { t } = useTranslation('imageEditor');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache the loaded base image element to avoid async reloads during redraws (prevents flicker)
  const baseImageElRef = useRef<HTMLImageElement | null>(null);
  const [baseImageData, setBaseImageData] = useState<string>(imageData);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'select' | 'rectangle' | 'circle' | 'blur' | 'pixelate' | 'blackout' | 'arrow' | 'counter' | 'textbox' | 'crop'>('select');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(6);
  const [actions, setActions] = useState<DrawingAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingAction[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [blurIntensity, setBlurIntensity] = useState(10);
  
  // Zoom and Pan state
  const [zoomLevel, setZoomLevel] = useState(0.1); // Start with minimal zoom to prevent flicker
  const [initialFitZoom, setInitialFitZoom] = useState(0.1); // Store the initial fit zoom level
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(true);

  // Resizable step info panel
  const [stepPanelWidth, setStepPanelWidth] = useState(320);
  const isResizingPanel = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(320);
  
  // Step information state
  const [stepTitle, setStepTitle] = useState(stepInfo?.title || '');
  const [stepDescription, setStepDescription] = useState(stepInfo?.description || '');
  const [stepActionType, setStepActionType] = useState(stepInfo?.actionType || 'click');

  // Ref for Quill editor instance
  const quillRef = useRef<ReactQuill>(null);

  // Memoize Quill config — inline objects cause Quill to reinitialize on every render
  const quillModules = useMemo(() => ({
    toolbar: [
      [{ 'font': ['sans-serif', 'arial', 'times-new-roman', 'courier', 'georgia', 'verdana', 'helvetica', 'calibri'] }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline'],
      [{ 'color': [] }],
      [{ 'align': [] }],
      ['clean']
    ],
    // Disable Quill's auto-list keyboard binding so typing "1. " (or "- ", "* ") at the
    // start of a line does not convert the line into a list.
    keyboard: {
      bindings: {
        'list autofill': {
          key: ' ',
          collapsed: true,
          format: { list: false },
          prefix: /^\s*?(\d+\.|-|\*|\[ ?\]|\[x\])$/,
          handler: () => true,
        },
      },
    },
  }), []);

  const quillFormats = useMemo(() => [
    'font', 'size',
    'bold', 'italic', 'underline',
    'color',
    'align'
  ], []);

  // Ref to store last mouse coordinates for drag/resize operations
  const lastMouseCoordsRef = useRef<{ x: number; y: number } | null>(null);

  // Sync step info when stepId changes (for title/actionType state)
  const prevStepIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!stepId || !stepInfo) return;

    if (stepId !== prevStepIdRef.current) {
      prevStepIdRef.current = stepId;
      setStepTitle(stepInfo.title || '');
      setStepDescription(stepInfo.description || '');
      setStepActionType(stepInfo.actionType || 'click');
    }
  }, [stepId, stepInfo]);

  // Force Quill content via API after mount — bypasses value/defaultValue issues
  // Uses requestAnimationFrame to ensure Quill's DOM is ready
  useEffect(() => {
    const desc = stepInfo?.description || '';
    if (!desc) return;

    const raf = requestAnimationFrame(() => {
      if (quillRef.current) {
        const editor = quillRef.current.getEditor();
        editor.root.innerHTML = DOMPurify.sanitize(desc);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [stepId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStepDescriptionChange = useCallback((content: string) => {
    setStepDescription(content);
  }, []);
  
  // Canvas state for preview without flickering
  const [canvasStateBeforePreview, setCanvasStateBeforePreview] = useState<ImageData | null>(null);

  // Canvas intrinsic dimensions (used to align overlay container exactly to canvas)
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number } | null>(null);

  // Canvas ready state - controls visibility to prevent flicker
  const [canvasReady, setCanvasReady] = useState(false);

  // New tool states
  const [counterValue, setCounterValue] = useState(1);
  const [fontSize, setFontSize] = useState(45);
  const [textBoxes, setTextBoxes] = useState<{id: string, x: number, y: number, width?: number, height?: number, text: string, isEditing: boolean}[]>([]);
  const [activeTextBoxId, setActiveTextBoxId] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropPending, setCropPending] = useState(false); // selection drawn, waiting for confirm
  const cropCleanStateRef = useRef<ImageData | null>(null); // clean canvas before crop overlay
  const [cropResizeHandle, setCropResizeHandle] = useState<string | null>(null);
  const [cropDragging, setCropDragging] = useState(false);
  const cropInteractStartRef = useRef<{x: number, y: number, area: {x: number, y: number, width: number, height: number}} | null>(null);

  // Selection and editing state for Greenshot-like behavior
  const [selectedActionIndex, setSelectedActionIndex] = useState<number | null>(null);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r' | 't' | 'b' | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const colors = [
    '#ef4444', // red
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // yellow
    '#8b5cf6', // purple
    '#f97316', // orange
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#ec4899', // pink
    '#000000', // black
  ];

  // Helper functions for Greenshot-like editing
  const renderSingleAction = useCallback((ctx: CanvasRenderingContext2D, action: DrawingAction) => {
    ctx.strokeStyle = action.color;
    ctx.lineWidth = action.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';

    if (action.tool === 'rectangle') {
      if (action.points.length >= 2) {
        const start = action.points[0];
        const end = action.points[action.points.length - 1];
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      }
    } else if (action.tool === 'circle') {
      if (action.points.length >= 2) {
        const start = action.points[0];
        const end = action.points[action.points.length - 1];
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        ctx.beginPath();
        ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    } else if (action.tool === 'arrow') {
      if (action.points.length >= 2) {
        const start = action.points[0];
        const end = action.points[action.points.length - 1];

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - arrowLength * Math.cos(angle - arrowAngle),
          end.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - arrowLength * Math.cos(angle + arrowAngle),
          end.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.stroke();
      }
    } else if (action.tool === 'counter') {
      if (action.points.length >= 1) {
        const point = action.points[0];
        const radius = Math.max(15, action.lineWidth * 3);

        ctx.fillStyle = action.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(14, radius * 0.7)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(action.counterNumber?.toString() || '1', point.x, point.y);
      }
    } else if (action.tool === 'textbox') {
      if (action.points.length >= 1 && action.text) {
        const point = action.points[0];

        ctx.font = `${action.fontSize || 45}px Arial`;
        const textMetrics = ctx.measureText(action.text);
        const padding = 4;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(
          point.x - textMetrics.width / 2 - padding,
          point.y - (action.fontSize || 45) / 2 - padding,
          textMetrics.width + padding * 2,
          (action.fontSize || 45) + padding * 2
        );

        ctx.fillStyle = action.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(action.text, point.x, point.y);
      }
    } else if (action.tool === 'blur' || action.tool === 'pixelate' || action.tool === 'blackout') {
      if (action.points.length >= 2) {
        const start = action.points[0];
        const end = action.points[action.points.length - 1];
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        ctx.setLineDash([]);
      }
    }
  }, []);

  const getBoundsForAction = useCallback((action: DrawingAction): { x: number; y: number; width: number; height: number } | null => {
    if (action.points.length === 0) return null;

    if (action.tool === 'counter') {
      const point = action.points[0];
      const radius = Math.max(15, action.lineWidth * 3);
      return { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 };
    }

    if (action.tool === 'textbox' && action.text) {
      const point = action.points[0];
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.font = `${action.fontSize || 45}px Arial`;
      const textMetrics = ctx.measureText(action.text);
      const padding = 4;
      return {
        x: point.x - textMetrics.width / 2 - padding,
        y: point.y - (action.fontSize || 45) / 2 - padding,
        width: textMetrics.width + padding * 2,
        height: (action.fontSize || 45) + padding * 2
      };
    }

    if (action.points.length >= 2) {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];

      if (action.tool === 'rectangle' || action.tool === 'blur' || action.tool === 'pixelate' || action.tool === 'blackout') {
        return {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y)
        };
      }

      if (action.tool === 'circle') {
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        return {
          x: start.x - radius,
          y: start.y - radius,
          width: radius * 2,
          height: radius * 2
        };
      }

      if (action.tool === 'arrow') {
        return {
          x: Math.min(start.x, end.x) - 20,
          y: Math.min(start.y, end.y) - 20,
          width: Math.abs(end.x - start.x) + 40,
          height: Math.abs(end.y - start.y) + 40
        };
      }
    }

    return null;
  }, []);

  const isPointInBounds = useCallback((x: number, y: number, bounds: { x: number; y: number; width: number; height: number }): boolean => {
    return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
  }, []);

  const findActionAtPoint = useCallback((x: number, y: number): number | null => {
    // Search in reverse order (top to bottom in render stack)
    for (let i = actions.length - 1; i >= 0; i--) {
      const bounds = getBoundsForAction(actions[i]);
      if (bounds && isPointInBounds(x, y, bounds)) {
        return i;
      }
    }
    return null;
  }, [actions, getBoundsForAction, isPointInBounds]);

  const getResizeHandle = useCallback((x: number, y: number, bounds: { x: number; y: number; width: number; height: number }): 'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r' | 't' | 'b' | null => {
    const handleSize = 12;
    const tolerance = 6;

    // Corner handles
    if (Math.abs(x - bounds.x) <= handleSize + tolerance && Math.abs(y - bounds.y) <= handleSize + tolerance) return 'tl';
    if (Math.abs(x - (bounds.x + bounds.width)) <= handleSize + tolerance && Math.abs(y - bounds.y) <= handleSize + tolerance) return 'tr';
    if (Math.abs(x - bounds.x) <= handleSize + tolerance && Math.abs(y - (bounds.y + bounds.height)) <= handleSize + tolerance) return 'bl';
    if (Math.abs(x - (bounds.x + bounds.width)) <= handleSize + tolerance && Math.abs(y - (bounds.y + bounds.height)) <= handleSize + tolerance) return 'br';

    // Edge handles
    if (Math.abs(x - bounds.x) <= handleSize + tolerance && y >= bounds.y && y <= bounds.y + bounds.height) return 'l';
    if (Math.abs(x - (bounds.x + bounds.width)) <= handleSize + tolerance && y >= bounds.y && y <= bounds.y + bounds.height) return 'r';
    if (Math.abs(y - bounds.y) <= handleSize + tolerance && x >= bounds.x && x <= bounds.x + bounds.width) return 't';
    if (Math.abs(y - (bounds.y + bounds.height)) <= handleSize + tolerance && x >= bounds.x && x <= bounds.x + bounds.width) return 'b';

    return null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Clear canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Calculate initial zoom to fit immediately (before showing)
      const container = canvas.parentElement;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        let availableWidth = containerRect.width - 32;
        let availableHeight = containerRect.height - 32;

        // In non-fullscreen mode, use conservative height
        const viewportHeight = window.innerHeight;
        availableHeight = Math.min(availableHeight, viewportHeight * 0.6 - 32);

        const scaleX = availableWidth / canvas.width;
        const scaleY = availableHeight / canvas.height;
        const scale = Math.min(scaleX, scaleY, 1);

        // Set zoom immediately before showing
        setZoomLevel(scale);
        setPanOffset({ x: 0, y: 0 });
      }

      // Store intrinsic canvas size for overlay alignment
      setCanvasDims({ width: img.width, height: img.height });
      // Cache the loaded image element for instant redraws without waiting for onload
      baseImageElRef.current = img;

      // Mark canvas as ready to show (prevents flicker)
      setCanvasReady(true);
    };
    img.onerror = () => {
      console.error('Failed to load image');
    };
    
    // Handle both data URLs and file URLs
    if (baseImageData.startsWith('data:') || baseImageData.startsWith('http') || baseImageData.startsWith('file://')) {
      img.src = baseImageData;
    } else {
      console.error('Invalid image data format');
    }
  }, [baseImageData]);

  // Sync base image when prop changes (step navigation or new editor session)
  const prevImageRef = useRef(imageData);
  useEffect(() => {
    if (imageData !== prevImageRef.current) {
      prevImageRef.current = imageData;
      // Clear drawing actions from previous step
      setActions([]);
      setRedoStack([]);
      // Keep canvasReady true to avoid flash — canvas will update in-place
    }
    setBaseImageData(imageData);
  }, [imageData]);

  // Note: Initial zoom fit is now calculated immediately in img.onload above
  // This prevents any visual flicker from showing the image at wrong zoom first

  // Keyboard event listeners for space bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only prevent spacebar default behavior if not typing in input fields or Quill editor
      const target = e.target as HTMLElement;
      const isTypingInInput = target instanceof HTMLInputElement ||
                             target instanceof HTMLTextAreaElement ||
                             target instanceof HTMLSelectElement ||
                             target.classList.contains('ql-editor') || // Quill editor
                             target.closest('.ql-editor') !== null; // Inside Quill editor

      if (e.code === 'Space' && !isSpacePressed && !isTypingInInput) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Only prevent spacebar default behavior if not typing in input fields or Quill editor
      const target = e.target as HTMLElement;
      const isTypingInInput = target instanceof HTMLInputElement ||
                             target instanceof HTMLTextAreaElement ||
                             target instanceof HTMLSelectElement ||
                             target.classList.contains('ql-editor') || // Quill editor
                             target.closest('.ql-editor') !== null; // Inside Quill editor

      if (e.code === 'Space' && !isTypingInInput) {
        e.preventDefault();
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed]);

  // Mouse wheel zoom with native event listener (to prevent passive event warning)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();

        // Get mouse position in canvas coordinates
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const canvasX = (mouseX / rect.width) * canvas.width;
        const canvasY = (mouseY / rect.height) * canvas.height;

        const oldZoom = zoomLevel;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(oldZoom * delta, 0.1), 5);

        // If zooming out to or below the initial fit zoom, reset pan to center
        if (newZoom <= initialFitZoom && oldZoom > initialFitZoom) {
          setPanOffset({ x: 0, y: 0 });
          setZoomLevel(newZoom);
          return;
        }

        // Distance from canvas center
        const fromCenterX = canvasX - canvas.width / 2;
        const fromCenterY = canvasY - canvas.height / 2;

        // Calculate shift to keep mouse point stationary
        const shiftX = fromCenterX * (newZoom - oldZoom);
        const shiftY = fromCenterY * (newZoom - oldZoom);

        setPanOffset(prev => ({
          x: prev.x - shiftX,
          y: prev.y - shiftY
        }));

        setZoomLevel(newZoom);
      }
    };

    // Add with { passive: false } to allow preventDefault
    canvas.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheelNative);
    };
  }, [zoomLevel, panOffset, initialFitZoom]);

  // Fullscreen functionality
  const toggleFullscreen = () => {
    const newFullscreenState = !isFullscreen;
    setIsFullscreen(newFullscreenState);
    
    // Set 40% zoom when entering fullscreen mode (user manual toggle)
    if (newFullscreenState) {
      setZoomLevel(0.4);
      setPanOffset({ x: 0, y: 0 });
    }
  };

  // Escape key handler for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Keyboard shortcuts for shape editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input fields or Quill editor
      const target = e.target as HTMLElement;
      const isTypingInInput = target instanceof HTMLInputElement ||
                             target instanceof HTMLTextAreaElement ||
                             target instanceof HTMLSelectElement ||
                             target.classList.contains('ql-editor') ||
                             target.closest('.ql-editor') !== null;

      if (isTypingInInput) return;

      // Delete selected shape
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedActionIndex !== null) {
        e.preventDefault();
        const updatedActions = actions.filter((_, index) => index !== selectedActionIndex);
        setActions(updatedActions);
        setSelectedActionIndex(null);
      }

      // Deselect with Escape
      if (e.key === 'Escape' && selectedActionIndex !== null) {
        e.preventDefault();
        setSelectedActionIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedActionIndex, actions]);

  // Update selected shape's properties when sliders/color change
  useEffect(() => {
    if (selectedActionIndex !== null && currentTool === 'select' && actions[selectedActionIndex]) {
      const updatedActions = [...actions];
      const selectedAction = updatedActions[selectedActionIndex];
      let hasChanges = false;

      // Update line width
      if (selectedAction.lineWidth !== lineWidth) {
        updatedActions[selectedActionIndex] = {
          ...updatedActions[selectedActionIndex],
          lineWidth: lineWidth
        };
        hasChanges = true;
      }

      // Update color
      if (selectedAction.color !== currentColor) {
        updatedActions[selectedActionIndex] = {
          ...updatedActions[selectedActionIndex],
          color: currentColor
        };
        hasChanges = true;
      }

      if (hasChanges) {
        setActions(updatedActions);
      }
    }
  }, [lineWidth, currentColor, selectedActionIndex, currentTool, actions]);

  const getCropHandles = (area: {x: number, y: number, width: number, height: number}) => [
    { id: 'tl', x: area.x,                      y: area.y },
    { id: 'tm', x: area.x + area.width / 2,      y: area.y },
    { id: 'tr', x: area.x + area.width,           y: area.y },
    { id: 'ml', x: area.x,                        y: area.y + area.height / 2 },
    { id: 'mr', x: area.x + area.width,           y: area.y + area.height / 2 },
    { id: 'bl', x: area.x,                        y: area.y + area.height },
    { id: 'bm', x: area.x + area.width / 2,       y: area.y + area.height },
    { id: 'br', x: area.x + area.width,           y: area.y + area.height },
  ];

  // Draw the persistent crop selection overlay (Greenshot-style darkened background + handles)
  const drawCropOverlay = useCallback((area: {x: number, y: number, width: number, height: number}) => {
    const canvas = canvasRef.current;
    if (!canvas || !cropCleanStateRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Restore the clean canvas state (no overlay)
    ctx.putImageData(cropCleanStateRef.current, 0, 0);

    ctx.save();
    // Darken the area outside the selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, area.y);
    ctx.fillRect(0, area.y + area.height, canvas.width, canvas.height - area.y - area.height);
    ctx.fillRect(0, area.y, area.x, area.height);
    ctx.fillRect(area.x + area.width, area.y, canvas.width - area.x - area.width, area.height);

    // Draw selection border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(area.x, area.y, area.width, area.height);
    ctx.setLineDash([]);

    // Draw resize handles (white squares with dark border)
    const handleSize = 8;
    const handles = [
      { x: area.x, y: area.y },
      { x: area.x + area.width / 2, y: area.y },
      { x: area.x + area.width, y: area.y },
      { x: area.x, y: area.y + area.height / 2 },
      { x: area.x + area.width, y: area.y + area.height / 2 },
      { x: area.x, y: area.y + area.height },
      { x: area.x + area.width / 2, y: area.y + area.height },
      { x: area.x + area.width, y: area.y + area.height },
    ];
    handles.forEach(h => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeStyle = '#555555';
      ctx.lineWidth = 1;
      ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    });
    ctx.restore();
  }, []);

  const applyCrop = useCallback(() => {
    if (!cropArea || !cropCleanStateRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Restore clean canvas (no overlay), then extract crop
    ctx.putImageData(cropCleanStateRef.current, 0, 0);
    const imageData = ctx.getImageData(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
    const newCanvas = document.createElement('canvas');
    newCanvas.width = cropArea.width;
    newCanvas.height = cropArea.height;
    const newCtx = newCanvas.getContext('2d');
    if (newCtx) {
      newCtx.putImageData(imageData, 0, 0);
      setBaseImageData(newCanvas.toDataURL());
    }

    cropCleanStateRef.current = null;
    setIsCropping(false);
    setCropPending(false);
    setCropArea(null);
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPath([]);
    setCanvasStateBeforePreview(null);
  }, [cropArea, setBaseImageData]);

  const cancelCrop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && cropCleanStateRef.current) {
      ctx.putImageData(cropCleanStateRef.current, 0, 0);
    }
    cropCleanStateRef.current = null;
    setIsCropping(false);
    setCropPending(false);
    setCropArea(null);
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPath([]);
    setCanvasStateBeforePreview(null);
  }, []);

  // Keyboard handler for crop confirm/cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!cropPending || !cropArea) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCrop();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCrop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cropPending, cropArea, applyCrop, cancelCrop]);

  // Redraw persistent crop overlay whenever cropArea changes (while pending)
  useEffect(() => {
    if (cropPending && cropArea) {
      drawCropOverlay(cropArea);
    }
  }, [cropPending, cropArea, drawCropOverlay]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fast path: draw using cached base image synchronously to prevent flicker
    if (baseImageElRef.current) {
      // Clear and redraw base
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImageElRef.current, 0, 0);
      
      // Redraw actions
      actions.forEach(action => {
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.globalCompositeOperation = 'source-over';

        // Handle obfuscation tools
        if (action.type === 'blur' || action.type === 'pixelate' || action.type === 'blackout') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            
            if (action.type === 'blur') {
              // Apply optimized blur effect using CSS filter for better performance with timeout protection
              try {
                const startTime = Date.now();
                ctx.save();
                
                // Create a temporary canvas for the blur effect
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                  tempCanvas.width = width;
                  tempCanvas.height = height;
                  
                  // Copy the area to blur
                  const imageData = ctx.getImageData(x, y, width, height);
                  tempCtx.putImageData(imageData, 0, 0);
                  
                  // Check if operation is taking too long
                  if (Date.now() - startTime > 1000) {
                    console.warn('Blur operation timeout - skipping');
                    ctx.restore();
                    return;
                  }
                  
                  // Apply blur and draw back
                  ctx.filter = `blur(${Math.min(action.blurIntensity || 10, 8)}px)`;
                  ctx.drawImage(tempCanvas, x, y);
                }
                
                ctx.restore();
              } catch (error) {
                console.error('Blur operation failed');
                ctx.restore();
              }
            } else if (action.type === 'pixelate') {
              // Create highly optimized pixelated effect with timeout protection
              try {
                const startTime = Date.now();
                const pixelSize = Math.max(8, Math.min(20, Math.floor(Math.min(width, height) / 15))); // Larger pixel size for better performance
                
                // Use batch processing for better performance
                const imageData = ctx.getImageData(x, y, width, height);
                const data = imageData.data;
                
                let iterations = 0;
                const maxIterations = Math.floor((width * height) / (pixelSize * pixelSize));
                
                for (let py = 0; py < height; py += pixelSize) {
                  for (let px = 0; px < width; px += pixelSize) {
                    iterations++;
                    
                    // Check timeout every 100 iterations
                    if (iterations % 100 === 0 && Date.now() - startTime > 1000) {
                      console.warn('Pixelate operation timeout - partial completion');
                      return;
                    }
                    
                    // Sample from center of pixel block
                    const sampleX = Math.min(px + Math.floor(pixelSize / 2), width - 1);
                    const sampleY = Math.min(py + Math.floor(pixelSize / 2), height - 1);
                    const sampleIndex = (sampleY * width + sampleX) * 4;
                    
                    const r = data[sampleIndex];
                    const g = data[sampleIndex + 1];
                    const b = data[sampleIndex + 2];
                    
                    // Fill the pixel block
                    const blockWidth = Math.min(pixelSize, width - px);
                    const blockHeight = Math.min(pixelSize, height - py);
                    
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    ctx.fillRect(x + px, y + py, blockWidth, blockHeight);
                  }
                }
              } catch (error) {
                console.error('Pixelate operation failed');
              }
            } else if (action.type === 'blackout') {
              // Fill the area with black - simple and fast operation
              try {
                ctx.fillStyle = '#000000';
                ctx.fillRect(x, y, width, height);
              } catch (error) {
                console.error('Blackout operation failed');
              }
            }
          }
          return;
        }

        if (action.tool === 'rectangle') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
          }
        } else if (action.tool === 'circle') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            ctx.beginPath();
            ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
          }
        } else if (action.tool === 'arrow') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            
            // Draw arrow line
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            
            // Draw arrowhead
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const arrowLength = 15;
            const arrowAngle = Math.PI / 6;
            
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
              end.x - arrowLength * Math.cos(angle - arrowAngle),
              end.y - arrowLength * Math.sin(angle - arrowAngle)
            );
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
              end.x - arrowLength * Math.cos(angle + arrowAngle),
              end.y - arrowLength * Math.sin(angle + arrowAngle)
            );
            ctx.stroke();
          }
        } else if (action.tool === 'counter') {
          if (action.points.length >= 1) {
            const point = action.points[0];
            const radius = Math.max(15, action.lineWidth * 3);

            // Draw circle background
            ctx.fillStyle = action.color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
            ctx.fill();

            // Draw number
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(14, radius * 0.7)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(action.counterNumber?.toString() || '1', point.x, point.y);
          }
        } else if (action.tool === 'textbox') {
          if (action.points.length >= 1 && action.text) {
            const point = action.points[0];

            // Draw text background
            ctx.font = `${action.fontSize || 45}px Arial`;
            const textMetrics = ctx.measureText(action.text);
            const padding = 4;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(
              point.x - textMetrics.width / 2 - padding,
              point.y - (action.fontSize || 45) / 2 - padding,
              textMetrics.width + padding * 2,
              (action.fontSize || 45) + padding * 2
            );

            // Draw text
            ctx.fillStyle = action.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(action.text, point.x, point.y);
          }
        }
      });

      // Draw selection handles for selected shape
      if (selectedActionIndex !== null && actions[selectedActionIndex]) {
        const selectedAction = actions[selectedActionIndex];
        const handleSize = 12;

        // Special handling for arrows - show only 2 draggable points
        if (selectedAction.tool === 'arrow' && selectedAction.points.length >= 2) {
          const start = selectedAction.points[0];
          const end = selectedAction.points[selectedAction.points.length - 1];

          // Draw dashed line connecting the two points
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw only 2 handles - at start and end
          const handles = [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y }
          ];

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          handles.forEach(handle => {
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
          });
        } else {
          // Normal bounding box for other shapes
          const bounds = getBoundsForAction(selectedAction);
          if (bounds) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.setLineDash([]);

            // Draw resize handles
            const handles = [
              { x: bounds.x, y: bounds.y }, // tl
              { x: bounds.x + bounds.width, y: bounds.y }, // tr
              { x: bounds.x, y: bounds.y + bounds.height }, // bl
              { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, // br
              { x: bounds.x, y: bounds.y + bounds.height / 2 }, // l
              { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }, // r
              { x: bounds.x + bounds.width / 2, y: bounds.y }, // t
              { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }, // b
            ];

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            handles.forEach(handle => {
              ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
              ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            });
          }
        }
      }

      ctx.globalCompositeOperation = 'source-over';
      return; // Skip async image load fallback
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraw original image
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      
      // Redraw all actions
      actions.forEach(action => {
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.globalCompositeOperation = 'source-over';

        // Handle obfuscation tools
        if (action.type === 'blur' || action.type === 'pixelate' || action.type === 'blackout') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            
            if (action.type === 'blur') {
              // Apply optimized blur effect using CSS filter for better performance with timeout protection
              try {
                const startTime = Date.now();
                ctx.save();
                
                // Create a temporary canvas for the blur effect
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                  tempCanvas.width = width;
                  tempCanvas.height = height;
                  
                  // Copy the area to blur
                  const imageData = ctx.getImageData(x, y, width, height);
                  tempCtx.putImageData(imageData, 0, 0);
                  
                  // Check if operation is taking too long
                  if (Date.now() - startTime > 1000) {
                    console.warn('Blur operation timeout - skipping');
                    ctx.restore();
                    return;
                  }
                  
                  // Apply blur and draw back
                  ctx.filter = `blur(${Math.min(action.blurIntensity || 10, 8)}px)`;
                  ctx.drawImage(tempCanvas, x, y);
                }
                
                ctx.restore();
              } catch (error) {
                console.error('Blur operation failed');
                ctx.restore();
              }
            } else if (action.type === 'pixelate') {
              // Create highly optimized pixelated effect with timeout protection
              try {
                const startTime = Date.now();
                const pixelSize = Math.max(8, Math.min(20, Math.floor(Math.min(width, height) / 15))); // Larger pixel size for better performance
                
                // Use batch processing for better performance
                const imageData = ctx.getImageData(x, y, width, height);
                const data = imageData.data;
                
                let iterations = 0;
                const maxIterations = Math.floor((width * height) / (pixelSize * pixelSize));
                
                for (let py = 0; py < height; py += pixelSize) {
                  for (let px = 0; px < width; px += pixelSize) {
                    iterations++;
                    
                    // Check timeout every 100 iterations
                    if (iterations % 100 === 0 && Date.now() - startTime > 1000) {
                      console.warn('Pixelate operation timeout - partial completion');
                      return;
                    }
                    
                    // Sample from center of pixel block
                    const sampleX = Math.min(px + Math.floor(pixelSize / 2), width - 1);
                    const sampleY = Math.min(py + Math.floor(pixelSize / 2), height - 1);
                    const sampleIndex = (sampleY * width + sampleX) * 4;
                    
                    const r = data[sampleIndex];
                    const g = data[sampleIndex + 1];
                    const b = data[sampleIndex + 2];
                    
                    // Fill the pixel block
                    const blockWidth = Math.min(pixelSize, width - px);
                    const blockHeight = Math.min(pixelSize, height - py);
                    
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    ctx.fillRect(x + px, y + py, blockWidth, blockHeight);
                  }
                }
              } catch (error) {
                console.error('Pixelate operation failed');
              }
            } else if (action.type === 'blackout') {
              // Fill the area with black - simple and fast operation
              try {
                ctx.fillStyle = '#000000';
                ctx.fillRect(x, y, width, height);
              } catch (error) {
                console.error('Blackout operation failed');
              }
            }
          }
          return;
        }

        if (action.tool === 'rectangle') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
          }
        } else if (action.tool === 'circle') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            ctx.beginPath();
            ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
          }
        } else if (action.tool === 'arrow') {
          if (action.points.length >= 2) {
            const start = action.points[0];
            const end = action.points[action.points.length - 1];
            
            // Draw arrow line
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            
            // Draw arrowhead
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const arrowLength = 15;
            const arrowAngle = Math.PI / 6;
            
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
              end.x - arrowLength * Math.cos(angle - arrowAngle),
              end.y - arrowLength * Math.sin(angle - arrowAngle)
            );
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
              end.x - arrowLength * Math.cos(angle + arrowAngle),
              end.y - arrowLength * Math.sin(angle + arrowAngle)
            );
            ctx.stroke();
          }
        } else if (action.tool === 'counter') {
          if (action.points.length >= 1) {
            const point = action.points[0];
            const radius = Math.max(15, action.lineWidth * 3);

            // Draw circle background
            ctx.fillStyle = action.color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
            ctx.fill();

            // Draw number
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(14, radius * 0.7)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(action.counterNumber?.toString() || '1', point.x, point.y);
          }
        } else if (action.tool === 'textbox') {
          if (action.points.length >= 1 && action.text) {
            const point = action.points[0];

            // Draw text background
            ctx.font = `${action.fontSize || 45}px Arial`;
            const textMetrics = ctx.measureText(action.text);
            const padding = 4;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(
              point.x - textMetrics.width / 2 - padding,
              point.y - (action.fontSize || 45) / 2 - padding,
              textMetrics.width + padding * 2,
              (action.fontSize || 45) + padding * 2
            );

            // Draw text
            ctx.fillStyle = action.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(action.text, point.x, point.y);
          }
        }
      });

      // Draw selection handles for selected shape
      if (selectedActionIndex !== null && actions[selectedActionIndex]) {
        const selectedAction = actions[selectedActionIndex];
        const handleSize = 12;

        // Special handling for arrows - show only 2 draggable points
        if (selectedAction.tool === 'arrow' && selectedAction.points.length >= 2) {
          const start = selectedAction.points[0];
          const end = selectedAction.points[selectedAction.points.length - 1];

          // Draw dashed line connecting the two points
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw only 2 handles - at start and end
          const handles = [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y }
          ];

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          handles.forEach(handle => {
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
          });
        } else {
          // Normal bounding box for other shapes
          const bounds = getBoundsForAction(selectedAction);
          if (bounds) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.setLineDash([]);

            // Draw resize handles
            const handles = [
              { x: bounds.x, y: bounds.y }, // tl
              { x: bounds.x + bounds.width, y: bounds.y }, // tr
              { x: bounds.x, y: bounds.y + bounds.height }, // bl
              { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, // br
              { x: bounds.x, y: bounds.y + bounds.height / 2 }, // l
              { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }, // r
              { x: bounds.x + bounds.width / 2, y: bounds.y }, // t
              { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }, // b
            ];

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            handles.forEach(handle => {
              ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
              ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            });
          }
        }
      }

      ctx.globalCompositeOperation = 'source-over';
    };
    img.src = baseImageData;
  }, [actions, baseImageData, selectedActionIndex, getBoundsForAction]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // CSS transform: translate(panOffset.x, panOffset.y) scale(zoomLevel)
    // Executes RIGHT-TO-LEFT: scale first, then translate

    // Mouse position relative to the transformed canvas bounding box
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // The rect already includes both transforms
    // Simply scale the mouse position back to canvas coordinates
    const x = (mouseX / rect.width) * canvasWidth;
    const y = (mouseY / rect.height) * canvasHeight;

    return { x, y };
  };

  // Zoom toward cursor position
  const handleZoomIn = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mousePos = lastMouseCoordsRef.current;

    // If no mouse position, zoom from center
    if (!mousePos) {
      setZoomLevel(prev => Math.min(prev * 1.2, 5));
      return;
    }

    const oldZoom = zoomLevel;
    const newZoom = Math.min(oldZoom * 1.2, 5);

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Distance from canvas center
    const fromCenterX = mousePos.x - canvasWidth / 2;
    const fromCenterY = mousePos.y - canvasHeight / 2;

    // After zoom, this point would move. We need to adjust panOffset to compensate
    const shiftX = fromCenterX * (newZoom - oldZoom);
    const shiftY = fromCenterY * (newZoom - oldZoom);

    setPanOffset(prev => ({
      x: prev.x - shiftX,
      y: prev.y - shiftY
    }));

    setZoomLevel(newZoom);
  };

  const handleZoomOut = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mousePos = lastMouseCoordsRef.current;

    // If no mouse position, zoom from center
    if (!mousePos) {
      setZoomLevel(prev => Math.max(prev / 1.2, 0.1));
      return;
    }

    const oldZoom = zoomLevel;
    const newZoom = Math.max(oldZoom / 1.2, 0.1);

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Distance from canvas center
    const fromCenterX = mousePos.x - canvasWidth / 2;
    const fromCenterY = mousePos.y - canvasHeight / 2;

    // Calculate shift
    const shiftX = fromCenterX * (newZoom - oldZoom);
    const shiftY = fromCenterY * (newZoom - oldZoom);

    setPanOffset(prev => ({
      x: prev.x - shiftX,
      y: prev.y - shiftY
    }));

    setZoomLevel(newZoom);
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleZoomFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    // Get the actual available space
    const containerRect = container.getBoundingClientRect();
    let availableWidth = containerRect.width - 32; // Account for padding
    let availableHeight = containerRect.height - 32;

    // In non-fullscreen mode, use a more conservative height calculation
    if (!isFullscreen) {
      // Calculate available height based on viewport minus header/toolbar space
      const viewportHeight = window.innerHeight;
      const estimatedToolbarHeight = 200; // Approximate height of header + toolbar
      availableHeight = Math.min(availableHeight, viewportHeight * 0.6 - 32);
    }

    const scaleX = availableWidth / canvas.width;
    const scaleY = availableHeight / canvas.height;
    const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

    setInitialFitZoom(scale); // Store the fit zoom level
    setZoomLevel(scale);
    setPanOffset({ x: 0, y: 0 });
  }, [isFullscreen]);

  // Auto-fit image to screen after canvas is ready
  useEffect(() => {
    if (!canvasReady) return;

    // Use setTimeout to ensure layout is complete
    const timer = setTimeout(() => {
      handleZoomFit();
    }, 100);

    return () => clearTimeout(timer);
  }, [canvasReady, handleZoomFit]);

  // Re-fit image when step panel is resized
  useEffect(() => {
    if (!canvasReady) return;
    // Small delay to let the layout reflow after panel resize
    const timer = setTimeout(() => {
      handleZoomFit();
    }, 16);
    return () => clearTimeout(timer);
  }, [stepPanelWidth, canvasReady, handleZoomFit]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // TEMPORARILY DISABLED PANNING
    // if (isSpacePressed) {
    //   // Start panning
    //   setIsPanning(true);
    //   setPanStart({
    //     x: e.clientX - panOffset.x,
    //     y: e.clientY - panOffset.y
    //   });
    //   return;
    // }

    const coords = getCanvasCoordinates(e);

    // Selection tool mode - only allow selecting, moving, and resizing
    if (currentTool === 'select') {
      // Find which action was clicked
      const clickedActionIndex = findActionAtPoint(coords.x, coords.y);

      // Check if clicking on a selected shape's resize handle
      if (selectedActionIndex !== null && actions[selectedActionIndex]) {
        const selectedAction = actions[selectedActionIndex];

        // Special handling for arrows - check if clicking on start or end point
        if (selectedAction.tool === 'arrow' && selectedAction.points.length >= 2) {
          const start = selectedAction.points[0];
          const end = selectedAction.points[selectedAction.points.length - 1];
          const handleSize = 12;
          const tolerance = 6;

          // Check if clicking on start point
          if (Math.abs(coords.x - start.x) <= handleSize + tolerance && Math.abs(coords.y - start.y) <= handleSize + tolerance) {
            setResizeHandle('tl'); // Use 'tl' to represent start point
            setIsResizing(true);
            setStartPoint(coords);
            // Save canvas state for preview
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx && canvas) {
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              setCanvasStateBeforePreview(imageData);
            }
            return;
          }

          // Check if clicking on end point
          if (Math.abs(coords.x - end.x) <= handleSize + tolerance && Math.abs(coords.y - end.y) <= handleSize + tolerance) {
            setResizeHandle('br'); // Use 'br' to represent end point
            setIsResizing(true);
            setStartPoint(coords);
            // Save canvas state for preview
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx && canvas) {
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              setCanvasStateBeforePreview(imageData);
            }
            return;
          }
        } else {
          // Normal bounds-based resize handle detection for other shapes
          const bounds = getBoundsForAction(selectedAction);
          if (bounds) {
            const handle = getResizeHandle(coords.x, coords.y, bounds);
            if (handle) {
              setResizeHandle(handle);
              setIsResizing(true);
              setStartPoint(coords);
              // Save canvas state for preview
              const canvas = canvasRef.current;
              const ctx = canvas?.getContext('2d');
              if (ctx && canvas) {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                setCanvasStateBeforePreview(imageData);
              }
              return;
            }
          }
        }
      }

      // Check if clicking on an existing shape (for selection or dragging)
      if (clickedActionIndex !== null) {
        // Select the shape (if not already selected)
        if (clickedActionIndex !== selectedActionIndex) {
          setSelectedActionIndex(clickedActionIndex);
        }

        // Always start dragging when clicking on a shape (Greenshot behavior)
        setIsDraggingShape(true);
        const bounds = getBoundsForAction(actions[clickedActionIndex]);
        if (bounds) {
          setDragOffset({ x: coords.x - bounds.x, y: coords.y - bounds.y });
        }
        setStartPoint(coords);
        // Save canvas state for preview
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setCanvasStateBeforePreview(imageData);
        }
        return;
      }

      // Clicking on empty space - deselect
      setSelectedActionIndex(null);
      return;
    }

    // When using drawing tools, deselect any selected shape and draw new shape
    setSelectedActionIndex(null);

    // Handle counter tool - single click
    if (currentTool === 'counter') {
      const newAction: DrawingAction = {
        type: 'counter',
        points: [coords],
        color: currentColor,
        lineWidth,
        tool: 'counter',
        counterNumber: counterValue
      };

      setActions(prev => {
        const updatedActions = [...prev, newAction];
        // Auto-select the newly created counter
        setSelectedActionIndex(updatedActions.length - 1);
        return updatedActions;
      });
      setCounterValue(prev => prev + 1);
      setRedoStack([]);

      // Auto-switch to select mode after drawing
      setCurrentTool('select');
      return;
    }
    
    // Handle textbox tool - click-drag to define a text box area
    if (currentTool === 'textbox') {
      setIsDrawing(true);
      setStartPoint(coords);
      setCurrentPath([coords]);
      setRedoStack([]);
      // Save canvas state for preview to avoid flickering
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setCanvasStateBeforePreview(imageData);
      }
      return;
    }
    
    // Handle crop tool
    if (currentTool === 'crop') {
      // If a selection is pending, check if clicking a handle or inside to resize/move
      if (cropPending && cropArea) {
        const hitRadius = 10;
        const handles = getCropHandles(cropArea);
        const hit = handles.find(h => Math.abs(coords.x - h.x) <= hitRadius && Math.abs(coords.y - h.y) <= hitRadius);
        if (hit) {
          setCropResizeHandle(hit.id);
          cropInteractStartRef.current = { x: coords.x, y: coords.y, area: { ...cropArea } };
          return;
        }
        const insideCrop =
          coords.x >= cropArea.x && coords.x <= cropArea.x + cropArea.width &&
          coords.y >= cropArea.y && coords.y <= cropArea.y + cropArea.height;
        if (insideCrop) {
          setCropDragging(true);
          cropInteractStartRef.current = { x: coords.x, y: coords.y, area: { ...cropArea } };
          return;
        }
        // Click outside: cancel old selection, restore canvas, start a new one
        if (cropCleanStateRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (ctx) ctx.putImageData(cropCleanStateRef.current, 0, 0);
        }
        cropCleanStateRef.current = null;
        setCropPending(false);
        setCropArea(null);
      }
      setIsCropping(true);
    }

    setIsDrawing(true);
    setStartPoint(coords);
    setCurrentPath([coords]);
    setRedoStack([]); // Clear redo stack when starting new action

    // Save canvas state for shape and obfuscation tools to avoid flickering
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setCanvasStateBeforePreview(imageData);
      // For crop, also save as the permanent clean reference
      if (currentTool === 'crop') {
        cropCleanStateRef.current = imageData;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning && isSpacePressed) {
      // Handle panning
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    const coords = getCanvasCoordinates(e);
    lastMouseCoordsRef.current = coords; // Store for use in mouseUp

    // Handle dragging a selected shape (only in select mode)
    if (currentTool === 'select' && isDraggingShape && selectedActionIndex !== null && startPoint && dragOffset) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !canvasStateBeforePreview) return;

      const action = actions[selectedActionIndex];
      const dx = coords.x - startPoint.x;
      const dy = coords.y - startPoint.y;

      // Create a preview by moving all points
      const movedAction = {
        ...action,
        points: action.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
      };

      // Restore canvas and redraw with moved shape
      ctx.putImageData(canvasStateBeforePreview, 0, 0);

      // Temporarily update action for preview
      const tempActions = [...actions];
      tempActions[selectedActionIndex] = movedAction;

      // Redraw moved shape
      ctx.strokeStyle = movedAction.color;
      ctx.lineWidth = movedAction.lineWidth;
      renderSingleAction(ctx, movedAction);

      return;
    }

    // Handle resizing a selected shape (only in select mode)
    if (currentTool === 'select' && isResizing && selectedActionIndex !== null && resizeHandle && startPoint) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !canvasStateBeforePreview) return;

      const action = actions[selectedActionIndex];
      const dx = coords.x - startPoint.x;
      const dy = coords.y - startPoint.y;

      // Calculate new bounds based on resize handle
      let resizedAction = { ...action };

      // Special handling for arrows - move endpoints directly
      if (action.tool === 'arrow' && action.points.length >= 2) {
        const start = { ...action.points[0] };
        const end = { ...action.points[action.points.length - 1] };

        // 'tl' represents start point, 'br' represents end point
        if (resizeHandle === 'tl') {
          // Move start point to cursor position
          start.x = coords.x;
          start.y = coords.y;
        } else if (resizeHandle === 'br') {
          // Move end point to cursor position
          end.x = coords.x;
          end.y = coords.y;
        }

        resizedAction.points = [start, end];
      }
      // Handle text box resizing (change font size)
      else if (action.tool === 'textbox') {
        const originalFontSize = action.fontSize || 45;
        // Use the larger of dx or dy to determine size change
        const delta = Math.max(Math.abs(dx), Math.abs(dy));
        const direction = (dx > 0 || dy > 0) ? 1 : -1;
        const newFontSize = Math.max(12, Math.min(120, originalFontSize + (delta * direction * 0.2)));
        resizedAction.fontSize = Math.round(newFontSize);
      }
      // Handle counter resizing: scale radius proportionally based on drag distance ratio
      else if (action.tool === 'counter') {
        const center = action.points[0];
        const originalRadius = Math.max(15, action.lineWidth * 3);
        const distAtStart = Math.sqrt(Math.pow(startPoint.x - center.x, 2) + Math.pow(startPoint.y - center.y, 2));
        const distNow = Math.sqrt(Math.pow(coords.x - center.x, 2) + Math.pow(coords.y - center.y, 2));
        if (distAtStart > 0) {
          const newRadius = Math.max(15, originalRadius * (distNow / distAtStart));
          resizedAction.lineWidth = Math.max(1, Math.min(30, newRadius / 3));
        }
      }
      // Handle other shapes with 2 points
      else if (action.points.length >= 2 && (action.tool === 'rectangle' || action.tool === 'circle' || action.tool === 'blur' || action.tool === 'pixelate' || action.tool === 'blackout')) {
        const start = { ...action.points[0] };
        const end = { ...action.points[1] };

        // Adjust points based on which handle is being dragged
        if (resizeHandle.includes('l')) start.x += dx;
        if (resizeHandle.includes('r')) end.x += dx;
        if (resizeHandle.includes('t')) start.y += dy;
        if (resizeHandle.includes('b')) end.y += dy;

        if (resizeHandle === 'l' || resizeHandle === 'r') {
          if (resizeHandle === 'l') start.x += dx;
          else end.x += dx;
        }
        if (resizeHandle === 't' || resizeHandle === 'b') {
          if (resizeHandle === 't') start.y += dy;
          else end.y += dy;
        }

        resizedAction.points = [start, end];
      }

      // Restore canvas and redraw with resized shape
      ctx.putImageData(canvasStateBeforePreview, 0, 0);

      // Redraw resized shape
      ctx.strokeStyle = resizedAction.color;
      ctx.lineWidth = resizedAction.lineWidth;
      renderSingleAction(ctx, resizedAction);

      return;
    }

    // Handle crop resize/move while pending
    if (cropPending && cropArea && cropInteractStartRef.current) {
      const { x: startX, y: startY, area: origArea } = cropInteractStartRef.current;
      const dx = coords.x - startX;
      const dy = coords.y - startY;

      if (cropResizeHandle) {
        let { x, y, width, height } = origArea;
        switch (cropResizeHandle) {
          case 'tl': x += dx; y += dy; width -= dx; height -= dy; break;
          case 'tm':           y += dy;              height -= dy; break;
          case 'tr':           y += dy; width += dx; height -= dy; break;
          case 'ml': x += dx;           width -= dx;               break;
          case 'mr':                    width += dx;               break;
          case 'bl': x += dx; width -= dx; height += dy;           break;
          case 'bm':                    height += dy;              break;
          case 'br':           width += dx; height += dy;          break;
        }
        if (width < 5) { width = 5; }
        if (height < 5) { height = 5; }
        const newArea = { x, y, width, height };
        setCropArea(newArea);
        drawCropOverlay(newArea);
        return;
      }

      if (cropDragging) {
        const newArea = { x: origArea.x + dx, y: origArea.y + dy, width: origArea.width, height: origArea.height };
        setCropArea(newArea);
        drawCropOverlay(newArea);
        return;
      }
    }

    if (!isDrawing) return;

    // For shapes and obfuscation tools, update the current path with start and current point
    setCurrentPath([startPoint!, coords]);
    
    // Use saved canvas state for preview to avoid flickering
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !startPoint || !canvasStateBeforePreview) return;

    // Restore the saved canvas state
    ctx.putImageData(canvasStateBeforePreview, 0, 0);
    
    // Draw preview shape on top
    ctx.save();
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = lineWidth;
    ctx.globalCompositeOperation = 'source-over';

    switch (currentTool) {
      case 'rectangle':
        ctx.strokeRect(startPoint.x, startPoint.y, coords.x - startPoint.x, coords.y - startPoint.y);
        break;
      case 'circle': {
        const radius = Math.sqrt(Math.pow(coords.x - startPoint.x, 2) + Math.pow(coords.y - startPoint.y, 2));
        ctx.beginPath();
        ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        // Draw arrow line preview
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        
        // Draw arrowhead preview
        const angle = Math.atan2(coords.y - startPoint.y, coords.x - startPoint.x);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;
        
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
        ctx.lineTo(
          coords.x - arrowLength * Math.cos(angle - arrowAngle),
          coords.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.moveTo(coords.x, coords.y);
        ctx.lineTo(
          coords.x - arrowLength * Math.cos(angle + arrowAngle),
          coords.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.stroke();
        break;
      }
      case 'crop': {
        // Draw crop selection rectangle
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(startPoint.x, startPoint.y, coords.x - startPoint.x, coords.y - startPoint.y);
        ctx.setLineDash([]);
        
        // Update crop area
        setCropArea({
          x: Math.min(startPoint.x, coords.x),
          y: Math.min(startPoint.y, coords.y),
          width: Math.abs(coords.x - startPoint.x),
          height: Math.abs(coords.y - startPoint.y)
        });
        break;
      }
      case 'textbox': {
        // Draw textbox selection rectangle preview
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(startPoint.x, startPoint.y, coords.x - startPoint.x, coords.y - startPoint.y);
        ctx.setLineDash([]);
        break;
      }
      case 'blur':
      case 'pixelate':
      case 'blackout':
        // Draw preview rectangle for obfuscation tools
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(startPoint.x, startPoint.y, coords.x - startPoint.x, coords.y - startPoint.y);
        ctx.setLineDash([]);
        break;
    }
    ctx.restore();
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    // Handle end of crop resize/move
    if (cropPending && (cropResizeHandle || cropDragging)) {
      setCropResizeHandle(null);
      setCropDragging(false);
      cropInteractStartRef.current = null;
      return;
    }

    // Handle end of dragging a shape
    if (isDraggingShape && selectedActionIndex !== null && startPoint && lastMouseCoordsRef.current) {
      const coords = lastMouseCoordsRef.current;
      const dx = coords.x - startPoint.x;
      const dy = coords.y - startPoint.y;

      // Update the action with new positions
      const updatedActions = [...actions];
      const action = updatedActions[selectedActionIndex];
      updatedActions[selectedActionIndex] = {
        ...action,
        points: action.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
      };

      setActions(updatedActions);
      setIsDraggingShape(false);
      setDragOffset(null);
      setStartPoint(null);
      setCanvasStateBeforePreview(null);
      return;
    }

    // Handle end of resizing a shape
    if (isResizing && selectedActionIndex !== null && resizeHandle && startPoint && lastMouseCoordsRef.current) {
      const coords = lastMouseCoordsRef.current;
      const dx = coords.x - startPoint.x;
      const dy = coords.y - startPoint.y;

      const updatedActions = [...actions];
      const action = updatedActions[selectedActionIndex];

      // Special handling for arrows - move endpoints directly
      if (action.tool === 'arrow' && action.points.length >= 2) {
        const start = { ...action.points[0] };
        const end = { ...action.points[action.points.length - 1] };

        // 'tl' represents start point, 'br' represents end point
        if (resizeHandle === 'tl') {
          // Move start point to cursor position
          start.x = coords.x;
          start.y = coords.y;
        } else if (resizeHandle === 'br') {
          // Move end point to cursor position
          end.x = coords.x;
          end.y = coords.y;
        }

        updatedActions[selectedActionIndex] = {
          ...action,
          points: [start, end]
        };
      }
      // Handle text box resizing (change font size)
      else if (action.tool === 'textbox' && action.fontSize) {
        const originalFontSize = action.fontSize;
        const delta = Math.max(Math.abs(dx), Math.abs(dy));
        const direction = (dx > 0 || dy > 0) ? 1 : -1;
        const newFontSize = Math.max(12, Math.min(120, originalFontSize + (delta * direction * 0.2)));
        updatedActions[selectedActionIndex] = {
          ...action,
          fontSize: Math.round(newFontSize)
        };
      }
      // Handle counter resizing: scale radius proportionally based on drag distance ratio
      else if (action.tool === 'counter') {
        const center = action.points[0];
        const originalRadius = Math.max(15, action.lineWidth * 3);
        const distAtStart = Math.sqrt(Math.pow(startPoint.x - center.x, 2) + Math.pow(startPoint.y - center.y, 2));
        const distNow = Math.sqrt(Math.pow(coords.x - center.x, 2) + Math.pow(coords.y - center.y, 2));
        if (distAtStart > 0) {
          const newRadius = Math.max(15, originalRadius * (distNow / distAtStart));
          const newLineWidth = Math.max(1, Math.min(20, newRadius / 3));
          updatedActions[selectedActionIndex] = {
            ...action,
            lineWidth: newLineWidth
          };
          // Sync slider state so the useEffect that watches [lineWidth, actions]
          // does not immediately overwrite the resized value back to the old slider position
          setLineWidth(Math.round(newLineWidth));
        }
      }
      // Handle other shapes with 2 points
      else if (action.points.length >= 2 && (action.tool === 'rectangle' || action.tool === 'circle' || action.tool === 'blur' || action.tool === 'pixelate' || action.tool === 'blackout')) {
        const start = { ...action.points[0] };
        const end = { ...action.points[1] };

        // Adjust points based on which handle was dragged
        if (resizeHandle.includes('l')) start.x += dx;
        if (resizeHandle.includes('r')) end.x += dx;
        if (resizeHandle.includes('t')) start.y += dy;
        if (resizeHandle.includes('b')) end.y += dy;

        if (resizeHandle === 'l' || resizeHandle === 'r') {
          if (resizeHandle === 'l') start.x += dx;
          else end.x += dx;
        }
        if (resizeHandle === 't' || resizeHandle === 'b') {
          if (resizeHandle === 't') start.y += dy;
          else end.y += dy;
        }

        updatedActions[selectedActionIndex] = {
          ...action,
          points: [start, end]
        };
      }

      setActions(updatedActions);
      setIsResizing(false);
      setResizeHandle(null);
      setStartPoint(null);
      setCanvasStateBeforePreview(null);
      return;
    }

    if (!isDrawing || currentPath.length === 0) return;

    // Handle crop tool: selection drawn — enter pending state, wait for Enter/button to confirm
    if (currentTool === 'crop' && cropArea) {
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPath([]);
      setCanvasStateBeforePreview(null);
      setCropPending(true);
      // Draw Greenshot-style persistent overlay
      drawCropOverlay(cropArea);
      return;
    }
    
    // Handle textbox tool completion: create overlay input, do not add canvas action yet
    if (currentTool === 'textbox' && currentPath.length >= 2) {
      const start = currentPath[0];
      const end = currentPath[currentPath.length - 1];

      // Calculate center point since text is now centered
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y) || (fontSize + 8);

      // Restore canvas to state before preview so dashed box isn't left behind
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas && canvasStateBeforePreview) {
        ctx.putImageData(canvasStateBeforePreview, 0, 0);
      }

      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setTextBoxes(prev => [...prev, { id, x: centerX, y: centerY, width, height, text: '', isEditing: true }]);
      setActiveTextBoxId(id);

      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPath([]);
      setCanvasStateBeforePreview(null);
      return;
    }

    let actionType: 'draw' | 'erase' | 'blur' | 'pixelate' | 'blackout' | 'arrow' | 'counter' | 'textbox' = 'draw';
    if (currentTool === 'blur') actionType = 'blur';
    else if (currentTool === 'pixelate') actionType = 'pixelate';
    else if (currentTool === 'blackout') actionType = 'blackout';
    else if (currentTool === 'arrow') actionType = 'arrow';
    else if (currentTool === 'counter') actionType = 'counter';
    else if (currentTool === 'textbox') actionType = 'textbox';
    // For rectangle, circle, and line tools, use 'draw' type

    // Add performance safeguards for obfuscation tools
    if (actionType === 'blur' || actionType === 'pixelate') {
      const start = currentPath[0];
      const end = currentPath[currentPath.length - 1];
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      const area = width * height;
      
      // Prevent processing extremely large areas that could freeze the app
      if (area > 500000) { // Limit to ~700x700 pixel areas
        console.warn('Selected area too large for obfuscation. Please select a smaller area.');
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPath([]);
        setCanvasStateBeforePreview(null); // Clear saved state
        return;
      }
    }

    const newAction: DrawingAction = {
      type: actionType,
      points: [...currentPath],
      color: currentColor,
      lineWidth,
      tool: currentTool as 'rectangle' | 'circle' | 'blur' | 'pixelate' | 'blackout' | 'arrow' | 'counter' | 'textbox' | 'crop',
      blurIntensity: currentTool === 'blur' ? blurIntensity : undefined,
    };

    setActions(prev => {
      const updatedActions = [...prev, newAction];
      // Auto-select the newly created shape (Greenshot behavior)
      setSelectedActionIndex(updatedActions.length - 1);
      return updatedActions;
    });

    // Auto-switch to select mode after drawing (Greenshot behavior)
    setCurrentTool('select');

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPath([]);
    setCanvasStateBeforePreview(null); // Clear saved state
  };

  // When the mouse leaves the canvas, stop drag without applying crop
  const handleMouseLeave = () => {
    // Stop crop resize/move
    if (cropPending && (cropResizeHandle || cropDragging)) {
      setCropResizeHandle(null);
      setCropDragging(false);
      cropInteractStartRef.current = null;
      return;
    }
    if (currentTool === 'crop' && isDrawing && cropArea) {
      // Stop dragging — enter pending state so selection stays visible
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPath([]);
      setCanvasStateBeforePreview(null);
      setCropPending(true);
      drawCropOverlay(cropArea);
      return;
    }
    handleMouseUp();
  };

  // Revert to original image (use initial prop value)
  const originalImageDataRef = useRef<string>(imageData);
  const handleRevertToOriginal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // Clear any editor state
      setActions([]);
      setRedoStack([]);
      setCropArea(null);
      setIsCropping(false);
      setCanvasStateBeforePreview(null);
      // Update base image locally (do not save/close editor)
      setBaseImageData(originalImageDataRef.current);
    };
    img.src = originalImageDataRef.current;
  };

  const handleUndo = () => {
    if (actions.length === 0) return;
    
    const lastAction = actions[actions.length - 1];
    setRedoStack(prev => [...prev, lastAction]);
    setActions(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    
    const actionToRedo = redoStack[redoStack.length - 1];
    setActions(prev => [...prev, actionToRedo]);
    setRedoStack(prev => prev.slice(0, -1));
  };

  // Commit an editable textbox overlay into canvas actions
  const commitTextBox = (tb: {id: string, x: number, y: number, text: string}) => {
    const trimmed = tb.text.trim();
    if (!trimmed) {
      // Remove empty overlays
      setTextBoxes(prev => prev.filter(x => x.id !== tb.id));
      setActiveTextBoxId(null);
      return;
    }
    const newAction: DrawingAction = {
      type: 'textbox',
      points: [{ x: tb.x, y: tb.y }],
      color: currentColor,
      lineWidth,
      tool: 'textbox',
      text: trimmed,
      fontSize
    };
    setActions(prev => {
      const updatedActions = [...prev, newAction];
      // Auto-select the newly created text box
      setSelectedActionIndex(updatedActions.length - 1);
      return updatedActions;
    });
    setRedoStack([]);
    // Remove overlay after committing
    setTextBoxes(prev => prev.filter(x => x.id !== tb.id));
    setActiveTextBoxId(null);

    // Auto-switch to select mode after creating text
    setCurrentTool('select');
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Force redraw before saving to ensure all actions are applied
      redrawCanvas();

      // Wait a bit for redraw to complete, then capture
      setTimeout(() => {
        const editedImageData = canvas.toDataURL('image/jpeg', 0.9);

        const updatedStepInfo = {
          title: stepTitle,
          description: stepDescription,
          actionType: stepActionType
        };

        onSave(editedImageData, updatedStepInfo);
      }, 100);
    }
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!onNavigateStep) return;
    // Auto-save current work before navigating
    const canvas = canvasRef.current;
    if (canvas) {
      redrawCanvas();
      setTimeout(async () => {
        const editedImageData = canvas.toDataURL('image/jpeg', 0.9);
        const updatedStepInfo = {
          title: stepTitle,
          description: stepDescription,
          actionType: stepActionType
        };
        // Wait for save to complete before navigating
        await onSave(editedImageData, updatedStepInfo, true);
        onNavigateStep(direction);
      }, 100);
    } else {
      onNavigateStep(direction);
    }
  };

  // Resizable panel drag handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingPanel.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = stepPanelWidth;

    const handleResizeMove = (moveEvent: MouseEvent) => {
      if (!isResizingPanel.current) return;
      // Dragging left = making panel wider (clientX decreases)
      const delta = resizeStartX.current - moveEvent.clientX;
      const newWidth = Math.min(Math.max(resizeStartWidth.current + delta, 250), 700);
      setStepPanelWidth(newWidth);
    };

    const handleResizeEnd = () => {
      isResizingPanel.current = false;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [stepPanelWidth]);

  // Onboarding: coach marks for key editor controls (one at a time, highest priority first)
  const hintsSuppressed = useHintsSuppressed();

  const stepNavRef = useRef<HTMLDivElement | null>(null);
  const [stepNavReady, setStepNavReady] = useState(false);
  const assignStepNavRef = useCallback((el: HTMLDivElement | null) => {
    stepNavRef.current = el;
    if (el) setStepNavReady(true);
  }, []);
  const stepNavHint = useOnboardingHint('editor.stepNav', {
    priority: 100,
    when: totalSteps != null && totalSteps > 1 && currentStepIndex != null,
  });

  const drawingToolsRef = useRef<HTMLDivElement | null>(null);
  const [drawingToolsReady, setDrawingToolsReady] = useState(false);
  const assignDrawingToolsRef = useCallback((el: HTMLDivElement | null) => {
    drawingToolsRef.current = el;
    if (el) setDrawingToolsReady(true);
  }, []);
  const drawingToolsHint = useOnboardingHint('editor.drawingTools', { priority: 90 });

  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const [colorPickerReady, setColorPickerReady] = useState(false);
  const assignColorPickerRef = useCallback((el: HTMLDivElement | null) => {
    colorPickerRef.current = el;
    if (el) setColorPickerReady(true);
  }, []);
  const colorPickerHint = useOnboardingHint('editor.colorPicker', { priority: 80 });

  const privacyToolsRef = useRef<HTMLDivElement | null>(null);
  const [privacyToolsReady, setPrivacyToolsReady] = useState(false);
  const assignPrivacyToolsRef = useCallback((el: HTMLDivElement | null) => {
    privacyToolsRef.current = el;
    if (el) setPrivacyToolsReady(true);
  }, []);
  const privacyToolsHint = useOnboardingHint('editor.privacyTools', { priority: 70 });

  const stepInfoPanelRef = useRef<HTMLDivElement | null>(null);
  const [stepInfoPanelReady, setStepInfoPanelReady] = useState(false);
  const assignStepInfoPanelRef = useCallback((el: HTMLDivElement | null) => {
    stepInfoPanelRef.current = el;
    if (el) setStepInfoPanelReady(true);
  }, []);
  const stepInfoPanelHint = useOnboardingHint('editor.stepInfoPanel', { priority: 60 });

  const revertCropRef = useRef<HTMLButtonElement | null>(null);
  const [revertCropReady, setRevertCropReady] = useState(false);
  const assignRevertCropRef = useCallback((el: HTMLButtonElement | null) => {
    revertCropRef.current = el;
    if (el) setRevertCropReady(true);
  }, []);
  const revertCropHint = useOnboardingHint('editor.revertCrop', { priority: 50 });

  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [saveButtonReady, setSaveButtonReady] = useState(false);
  const assignSaveButtonRef = useCallback((el: HTMLButtonElement | null) => {
    saveButtonRef.current = el;
    if (el) setSaveButtonReady(true);
  }, []);
  const saveButtonHint = useOnboardingHint('editor.save', { priority: 40 });

  return (
    <div className={cn(
      "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50",
      isFullscreen && "bg-opacity-100"
    )}>
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg p-6 flex flex-col overflow-hidden",
        isFullscreen
          ? "w-full h-full max-w-none max-h-none rounded-none pt-12"
          : "max-w-[95vw] w-[1400px] max-h-[90vh]"
      )}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('title')}
            </h3>
            {totalSteps != null && totalSteps > 1 && currentStepIndex != null && (
              <div ref={assignStepNavRef} className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => handleNavigate('prev')}
                  disabled={currentStepIndex === 0}
                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
                  title={t('nav.prevStep')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[5rem] text-center">
                  {t('nav.stepOf', { current: currentStepIndex + 1, total: totalSteps })}
                </span>
                <button
                  onClick={() => handleNavigate('next')}
                  disabled={currentStepIndex === totalSteps - 1}
                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
                  title={t('nav.nextStep')}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAllOnboardingHints}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                hintsSuppressed
                  ? "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
              title={hintsSuppressed ? t('hints.show') : t('hints.hide')}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ×
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg shrink-0">
          {/* Tools */}
          <div ref={assignDrawingToolsRef} className="flex items-center gap-2">
            <button
              onClick={() => setCurrentTool('select')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'select' ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.select')}
            >
              <MousePointer2 className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
            <button
              onClick={() => setCurrentTool('rectangle')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'rectangle' ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('arrow')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'arrow' ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.arrow')}
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('counter')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'counter' ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.counter')}
            >
              <Hash className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('textbox')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'textbox' ? "bg-purple-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.text')}
            >
              <Type className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCurrentTool('crop')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'crop' ? "bg-orange-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.crop')}
            >
              <Crop className="w-4 h-4" />
            </button>
          </div>

          {/* Color Picker */}
          <div ref={assignColorPickerRef} className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('toolbar.colorLabel')}</span>
            <div className="flex items-center gap-1">
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setCurrentColor(color)}
                  className={cn(
                    "w-6 h-6 rounded border-2 transition-all",
                    currentColor === color 
                      ? "border-gray-800 dark:border-white scale-110" 
                      : "border-gray-300 dark:border-gray-600 hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                  title={t('toolbar.colorSelect', { color })}
                />
              ))}
            </div>
          </div>

          {/* Privacy Tools */}
          <div ref={assignPrivacyToolsRef} className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('toolbar.privacyLabel')}</span>
            <button
              onClick={() => setCurrentTool('blur')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'blur' ? "bg-red-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.blur')}
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('pixelate')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'pixelate' ? "bg-red-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.pixelate')}
            >
              <Zap className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('blackout')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                currentTool === 'blackout' ? "bg-red-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
              )}
              title={t('tools.blackout')}
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>



          {/* Line Width */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 dark:text-gray-300">{t('toolbar.sizeLabel')}</label>
            <input
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 w-6">{lineWidth}</span>
          </div>

          {/* Blur Intensity (only show when blur tool is selected) */}
          {currentTool === 'blur' && (
            <div className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
              <label className="text-sm text-gray-700 dark:text-gray-300">{t('toolbar.blurLabel')}</label>
              <input
                type="range"
                min="5"
                max="30"
                value={blurIntensity}
                onChange={(e) => setBlurIntensity(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 w-6">{blurIntensity}</span>
            </div>
          )}
          
          {/* Font Size (only show when textbox tool is selected) */}
          {currentTool === 'textbox' && (
            <div className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
              <label className="text-sm text-gray-700 dark:text-gray-300">{t('toolbar.fontLabel')}</label>
              <input
                type="range"
                min="12"
                max="48"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 w-8">{t('toolbar.fontSizePx', { size: fontSize })}</span>
            </div>
          )}
          
          {/* Counter Reset (only show when counter tool is selected) */}
          {currentTool === 'counter' && (
            <div className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
              <button
                onClick={() => setCounterValue(1)}
                className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                title={t('toolbar.resetCounterTitle')}
              >
                {t('toolbar.resetCounter')}
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('toolbar.counterNext', { value: counterValue })}</span>
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('toolbar.viewLabel')}</span>
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
              title={t('toolbar.zoomOut')}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-700 dark:text-gray-300 min-w-[3rem] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
              title={t('toolbar.zoomIn')}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomReset}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
              title={t('toolbar.resetZoom')}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomFit}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
              title={t('toolbar.fitToScreen')}
            >
              <Move className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
              title={isFullscreen ? t('toolbar.exitFullscreen') : t('toolbar.enterFullscreen')}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleUndo}
              disabled={actions.length === 0}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Redo className="w-4 h-4" />
            </button>
            <button
              ref={assignRevertCropRef}
              onClick={handleRevertToOriginal}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              title={t('toolbar.revertCropTitle')}
            >
              {t('toolbar.revertCrop')}
            </button>
            <button
              ref={assignSaveButtonRef}
              onClick={handleSave}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {t('toolbar.save')}
            </button>
          </div>
        </div>

        {/* Side-by-side: Canvas + Step Information */}
        <div className="flex flex-row gap-4 mt-3 flex-1 min-h-0">
          {/* Canvas Container */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 relative flex-1 min-w-0">
            <div className="overflow-hidden flex items-center justify-center p-4 h-full">
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                className={cn(
                  "border border-gray-200 dark:border-gray-700 shadow-lg",
                  isSpacePressed && !isDrawing ? "cursor-grab" :
                  isPanning ? "cursor-grabbing" :
                  currentTool === 'select' ? "cursor-default" :
                  "cursor-crosshair"
                )}
                style={{
                  display: 'block',
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                  transformOrigin: 'center',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  opacity: canvasReady ? 1 : 0,
                  transition: 'opacity 0.15s ease-in-out'
                }}
              />
              {/* Editable Text Overlays - match canvas box and transform for pixel-perfect alignment */}
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: canvasDims?.width || 0,
                  height: canvasDims?.height || 0,
                  transform: `translate(-50%, -50%) scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                  transformOrigin: 'center',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                {textBoxes.map(tb => (
                  <input
                    key={tb.id}
                    type="text"
                    value={tb.text}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTextBoxes(prev => prev.map(x => x.id === tb.id ? { ...x, text: v } : x));
                    }}
                    onBlur={() => commitTextBox(tb)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitTextBox(tb);
                      }
                      if (e.key === 'Escape') {
                        // Cancel overlay
                        setTextBoxes(prev => prev.filter(x => x.id !== tb.id));
                        setActiveTextBoxId(null);
                      }
                    }}
                    autoFocus={activeTextBoxId === tb.id}
                    className="absolute text-gray-900 dark:text-white outline-none"
                    style={{
                      left: tb.x,
                      top: tb.y,
                      transform: 'translate(-50%, -50%)',
                      minWidth: '150px',
                      maxWidth: '800px',
                      boxSizing: 'border-box',
                      padding: '8px 12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: `2px dashed ${currentColor}`,
                      borderRadius: '2px',
                      lineHeight: `${fontSize}px`,
                      color: currentColor,
                      fontSize: `${fontSize}px`,
                      textAlign: 'center',
                      pointerEvents: 'auto',
                    }}
                    placeholder={t('canvas.textPlaceholder')}
                  />
                ))}

              </div>
            </div>

            {/* Crop confirm/cancel buttons — outside the scaled overlay so they stay full-size */}
            {cropPending && cropArea && canvasDims && (
              <div
                className="absolute flex gap-3 pointer-events-none"
                style={{
                  left: `calc(50% + ${panOffset.x + (cropArea.x + cropArea.width / 2 - canvasDims.width / 2) * zoomLevel}px)`,
                  top: `calc(50% + ${panOffset.y + (cropArea.y + cropArea.height + 14 - canvasDims.height / 2) * zoomLevel}px)`,
                  transform: 'translateX(-50%)',
                  zIndex: 30,
                }}
              >
                <button
                  onClick={applyCrop}
                  className="pointer-events-auto flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg shadow-2xl"
                  title={t('canvas.applyCropTitle')}
                >
                  {t('canvas.applyCrop')}
                </button>
                <button
                  onClick={cancelCrop}
                  className="pointer-events-auto flex items-center gap-2 px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-lg shadow-2xl"
                  title={t('canvas.cancelCropTitle')}
                >
                  {t('canvas.cancelCrop')}
                </button>
              </div>
            )}

            {/* Instructions */}
            <div className="absolute bottom-2 left-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded shadow">
              <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl</kbd> + scroll to zoom • <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Esc</kbd> to exit fullscreen
            </div>
          </div>

          {/* Resize Handle */}
          <div
            onMouseDown={handleResizeStart}
            className="w-2 shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
            title={t('canvas.resizeHandle')}
          >
            <div className="w-0.5 h-8 bg-gray-300 dark:bg-gray-500 rounded-full group-hover:bg-blue-400 transition-colors" />
          </div>

          {/* Step Information Panel - Side by side with canvas */}
          <div
            ref={assignStepInfoPanelRef}
            className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 flex flex-col shrink-0 overflow-hidden"
            style={{ width: stepPanelWidth }}
          >
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('stepInfo.heading')}</h4>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('stepInfo.titleLabel')}
              </label>
              <input
                type="text"
                value={stepTitle}
                onChange={(e) => setStepTitle(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder={t('stepInfo.titlePlaceholder')}
              />
            </div>
            <div className="mt-3 flex-1 flex flex-col min-h-0">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('stepInfo.descriptionLabel')}
              </label>
              <div className="flex-1 min-h-0 [&_.quill]:!h-full [&_.quill]:!flex [&_.quill]:!flex-col [&_.ql-toolbar]:!shrink-0 [&_.ql-toolbar]:!flex [&_.ql-toolbar]:!flex-wrap [&_.ql-container]:!flex-1 [&_.ql-container]:!min-h-0 [&_.ql-editor]:!overflow-y-auto">
                <ReactQuill
                  ref={quillRef}
                  key={`quill-${stepId || 'empty'}`}
                  onChange={handleStepDescriptionChange}
                  modules={quillModules}
                  formats={quillFormats}
                  className="bg-white dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600 h-full"
                  theme="snow"
                  placeholder={t('stepInfo.descriptionPlaceholder')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding coach marks — one shown at a time (highest priority first) */}
      {stepNavHint.visible && stepNavReady && (
        <CoachMark
          anchorRef={stepNavRef}
          title={t('coach.navTitle')}
          description={t('coach.navDesc')}
          placement="bottom"
          onDismiss={stepNavHint.dismiss}
        />
      )}
      {drawingToolsHint.visible && drawingToolsReady && (
        <CoachMark
          anchorRef={drawingToolsRef}
          title={t('coach.drawingTitle')}
          description={t('coach.drawingDesc')}
          placement="bottom"
          onDismiss={drawingToolsHint.dismiss}
        />
      )}
      {colorPickerHint.visible && colorPickerReady && (
        <CoachMark
          anchorRef={colorPickerRef}
          title={t('coach.colorTitle')}
          description={t('coach.colorDesc')}
          placement="bottom"
          onDismiss={colorPickerHint.dismiss}
        />
      )}
      {privacyToolsHint.visible && privacyToolsReady && (
        <CoachMark
          anchorRef={privacyToolsRef}
          title={t('coach.privacyTitle')}
          description={t('coach.privacyDesc')}
          placement="bottom"
          onDismiss={privacyToolsHint.dismiss}
        />
      )}
      {stepInfoPanelHint.visible && stepInfoPanelReady && (
        <CoachMark
          anchorRef={stepInfoPanelRef}
          title={t('coach.stepInfoTitle')}
          description={t('coach.stepInfoDesc')}
          placement="left"
          onDismiss={stepInfoPanelHint.dismiss}
        />
      )}
      {revertCropHint.visible && revertCropReady && (
        <CoachMark
          anchorRef={revertCropRef}
          title={t('coach.revertTitle')}
          description={t('coach.revertDesc')}
          placement="bottom"
          onDismiss={revertCropHint.dismiss}
        />
      )}
      {saveButtonHint.visible && saveButtonReady && (
        <CoachMark
          anchorRef={saveButtonRef}
          title={t('coach.saveTitle')}
          description={t('coach.saveDesc')}
          placement="bottom"
          onDismiss={saveButtonHint.dismiss}
        />
      )}
    </div>
  );
};

export default ImageEditor;
