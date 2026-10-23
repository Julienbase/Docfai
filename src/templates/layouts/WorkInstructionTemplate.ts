import { DocumentTemplate } from '../types';

/**
 * Work Instruction Template
 *
 * Detailed task guidance template for precise operational procedures.
 * Features clean numbered steps with prominent images, clear action items.
 * Common in: Manufacturing, Operations, Assembly, Maintenance
 */
export const WorkInstructionTemplate: DocumentTemplate = {
  id: 'work-instruction',
  name: 'Work Instruction',
  description: 'Clean, action-oriented documentation with numbered steps and prominent visuals. Ideal for detailed task guidance and operational procedures.',
  icon: 'ListChecks',
  category: 'operations',

  layout: {
    pageSize: 'A4',
    orientation: 'portrait',
    margins: {
      top: 15,
      right: 15,
      bottom: 15,
      left: 15
    },
    columns: 1
  },

  header: {
    show: true,
    includeDocId: true,
    includeRevision: true,
    includeLogo: true,
    includeDate: true,
    logoPosition: 'left',
    style: 'standard'
  },

  footer: {
    show: true,
    includePageNumbers: true,
    includeDate: true,
    includeConfidentiality: false,
    includeDocumentName: true
  },

  sections: [
    { id: 'header', name: 'Document Header', required: true, order: 1 },
    { id: 'task_info', name: 'Task Information', required: true, order: 2 },
    { id: 'safety', name: 'Safety Information', required: false, order: 3, placeholder: 'Important safety warnings and precautions.' },
    { id: 'tools', name: 'Tools & Materials', required: false, order: 4, placeholder: 'List required tools and materials.' },
    { id: 'instructions', name: 'Instructions', required: true, order: 5 },
    { id: 'quality_check', name: 'Quality Check', required: false, order: 6, placeholder: 'Verification steps and acceptance criteria.' },
    { id: 'troubleshooting', name: 'Troubleshooting', required: false, order: 7, placeholder: 'Common issues and solutions.' }
  ],

  stepLayout: {
    imagePosition: 'right',
    imageSize: 'medium',
    showStepNumbers: true,
    numberingStyle: 'decimal',
    showTimestamps: false,
    calloutStyle: 'inline',
    showActionType: true,
    borderStyle: 'solid',
    stepSpacing: 'compact'
  },

  typography: {
    headingFont: 'Calibri',
    bodyFont: 'Calibri',
    fontSize: {
      title: 16,
      heading1: 14,
      heading2: 12,
      heading3: 12,
      body: 11,
      caption: 10,
      small: 9
    },
    lineSpacing: 1.15
  },

  colors: {
    primary: '#2980b9',       // Professional blue
    secondary: '#7f8c8d',     // Gray
    accent: '#e74c3c',        // Red for warnings/important
    text: '#2c3e50',          // Dark gray text
    background: '#ffffff',    // White background
    border: '#bdc3c7',        // Light gray borders
    headerBg: '#2980b9',      // Blue header
    headerText: '#ffffff',    // White header text
    success: '#27ae60',       // Green for success
    warning: '#e74c3c',       // Red for safety warnings
    info: '#3498db'           // Blue for info
  },

  options: {
    showTableOfContents: false,
    showDocumentSummary: false,
    showApprovalSection: false,
    showRevisionHistory: false,
    showGlossary: false,
    showCheckpoints: false
  }
};
