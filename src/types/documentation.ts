// TypeScript interfaces for the video tutorial documentation system

export interface VideoFrame {
  timestamp: number; // Time in seconds
  frameNumber: number;
  imagePath: string; // Path to extracted frame image
  width: number;
  height: number;
}



export interface UserAction {
  id?: string;
  type: 'click' | 'keyboard' | 'navigation' | 'scroll' | 'drag' | 'other';
  description: string;
  timestamp: number;
  coordinates?: {
    x: number;
    y: number;
  };
  element?: string; // Description of UI element interacted with
  value?: string; // For keyboard input or form values
  confidence?: number; // Confidence score for the action detection
  context?: string; // Additional context information
}

export interface DocumentationStep {
  stepNumber: number;
  title: string;
  description: string;
  screenshot?: string; // Path to screenshot
  actions: UserAction[];
  timestamp: number;
  duration: number; // Duration of this step in seconds
  notes?: string[];
}

export interface DocumentationSection {
  title: string;
  description?: string;
  steps: DocumentationStep[];
  startTime: number;
  endTime: number;
}

export interface VideoDocumentation {
  id: string;
  title: string;
  description?: string;
  videoPath: string;
  videoDuration: number;
  createdAt: Date;
  updatedAt: Date;
  sections: DocumentationSection[];
  metadata: {
    videoResolution: {
      width: number;
      height: number;
    };
    frameRate: number;
    totalFrames: number;
    extractedFrames: number;

    processingTime: number; // Time taken to process in seconds
  };
}

export interface FrameExtractionOptions {
  interval: number; // Extract frame every N seconds
  quality: 'low' | 'medium' | 'high';
  maxFrames?: number;
  startTime?: number; // Start extraction from this time
  endTime?: number; // End extraction at this time
}



export interface GPTAnalysisOptions {
  model: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo';
  maxTokens: number;
  temperature: number;
  contextWindow: number; // Number of previous steps to include for context
}

export interface PDFGenerationOptions {
  template: 'standard' | 'detailed' | 'minimal';
  includeScreenshots: boolean;
  includeTimestamps: boolean;
  includeTableOfContents: boolean;
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
}

export interface DocumentationGenerationConfig {
  frameExtraction: FrameExtractionOptions;

  gptAnalysis: GPTAnalysisOptions;
  pdfGeneration: PDFGenerationOptions;
  outputPath: string;
}

export interface ProcessingProgress {
  stage: 'extracting' | 'analyzing' | 'generating' | 'complete' | 'error';
  progress: number; // 0-100
  currentStep: string;
  estimatedTimeRemaining?: number; // in seconds
  error?: string;
}

export interface DocumentationGenerationResult {
  success: boolean;
  documentation?: VideoDocumentation;
  pdfPath?: string;
  error?: string;
  processingTime: number;
  warnings?: string[];
}

// Event types for progress tracking
export type DocumentationEvent = 
  | { type: 'progress'; data: ProcessingProgress }
  | { type: 'frame_extracted'; data: { frameNumber: number; timestamp: number } }

  | { type: 'analysis_completed'; data: { stepsIdentified: number; actionsDetected: number } }
  | { type: 'pdf_generated'; data: { path: string; pages: number } }
  | { type: 'error'; data: { stage: string; error: string } };

// Utility types
export type DocumentationEventCallback = (event: DocumentationEvent) => void;

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  format: string;
  size: number; // File size in bytes
}