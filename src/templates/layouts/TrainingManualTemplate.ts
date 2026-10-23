import { DocumentTemplate } from '../types';

/**
 * Training Manual Template
 *
 * Educational template designed for onboarding and training materials.
 * Features learning objectives, large images with annotations, checkpoints, and exercises.
 * Common in: Corporate Training, Onboarding, E-learning, Educational Content
 */
export const TrainingManualTemplate: DocumentTemplate = {
  id: 'training-manual',
  name: 'Training Manual',
  description: 'Educational documentation with learning objectives, visual-focused layout, checkpoints, and exercises. Perfect for onboarding and training.',
  icon: 'GraduationCap',
  category: 'training',

  layout: {
    pageSize: 'A4',
    orientation: 'portrait',
    margins: {
      top: 15,
      right: 15,
      bottom: 15,
      left: 10
    },
    columns: 1
  },

  header: {
    show: true,
    includeDocId: false,
    includeRevision: false,
    includeLogo: true,
    includeDate: true,
    logoPosition: 'center',
    style: 'minimal'
  },

  footer: {
    show: true,
    includePageNumbers: true,
    includeDate: true,
    includeConfidentiality: false,
    includeDocumentName: true
  },

  sections: [
    { id: 'cover', name: 'Cover Page', required: true, order: 1 },
    { id: 'objectives', name: 'Learning Objectives', required: true, order: 2, placeholder: 'By the end of this training, you will be able to:' },
    { id: 'prerequisites', name: 'Prerequisites', required: false, order: 3, placeholder: 'Before starting, ensure you have:' },
    { id: 'introduction', name: 'Introduction', required: false, order: 4, placeholder: 'Brief overview of what you will learn.' },
    { id: 'modules', name: 'Training Modules', required: true, order: 5 },
    { id: 'summary', name: 'Summary', required: false, order: 6, placeholder: 'Key takeaways from this training.' },
    { id: 'quiz', name: 'Knowledge Check', required: false, order: 7, placeholder: 'Test your understanding.' },
    { id: 'resources', name: 'Additional Resources', required: false, order: 8 }
  ],

  stepLayout: {
    imagePosition: 'above',
    imageSize: 'full-width',
    showStepNumbers: true,
    numberingStyle: 'decimal',
    showTimestamps: false,
    calloutStyle: 'banner',
    showActionType: false,
    borderStyle: 'none',
    stepSpacing: 'spacious'
  },

  typography: {
    headingFont: 'Segoe UI',
    bodyFont: 'Segoe UI',
    fontSize: {
      title: 16,
      heading1: 14,
      heading2: 12,
      heading3: 12,
      body: 11,
      caption: 10,
      small: 9
    },
    lineSpacing: 1.5
  },

  colors: {
    primary: '#2c3e50',       // Dark blue-gray
    secondary: '#3498db',     // Bright blue
    accent: '#9b59b6',        // Purple for highlights
    text: '#34495e',          // Medium gray text
    background: '#ffffff',    // White background
    border: '#ecf0f1',        // Very light gray borders
    headerBg: '#3498db',      // Blue header
    headerText: '#ffffff',    // White header text
    success: '#2ecc71',       // Bright green for success/checkpoints
    warning: '#f1c40f',       // Yellow for tips
    info: '#1abc9c'           // Teal for info boxes
  },

  options: {
    showTableOfContents: true,
    showDocumentSummary: false,
    showApprovalSection: false,
    showRevisionHistory: false,
    showGlossary: false,
    showCheckpoints: true
  }
};
