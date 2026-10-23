import { DocumentTemplate } from '../types';

/**
 * Technical Specification Template
 *
 * Professional technical documentation for APIs, systems, and software.
 * Features structured sections, code-friendly layout, and detailed specifications.
 * Common in: Software Development, API Documentation, System Architecture, Engineering
 */
export const TechnicalSpecTemplate: DocumentTemplate = {
  id: 'technical-spec',
  name: 'Technical Specification',
  description: 'Structured technical documentation with detailed specifications, diagrams support, and professional formatting. Ideal for API docs and system documentation.',
  icon: 'FileCode',
  category: 'technical',

  layout: {
    pageSize: 'A4',
    orientation: 'portrait',
    margins: {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20
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
    includeConfidentiality: true,
    includeDocumentName: true,
    confidentialityText: 'Technical Documentation - Internal'
  },

  sections: [
    { id: 'cover', name: 'Cover Page', required: true, order: 1 },
    { id: 'toc', name: 'Table of Contents', required: true, order: 2 },
    { id: 'overview', name: 'Overview', required: true, order: 3, placeholder: 'High-level description of the system or feature.' },
    { id: 'architecture', name: 'Architecture', required: false, order: 4, placeholder: 'System architecture and design decisions.' },
    { id: 'specifications', name: 'Specifications', required: true, order: 5 },
    { id: 'interfaces', name: 'Interfaces', required: false, order: 6, placeholder: 'API endpoints, data formats, and integration points.' },
    { id: 'data_model', name: 'Data Model', required: false, order: 7, placeholder: 'Database schemas and data structures.' },
    { id: 'security', name: 'Security Considerations', required: false, order: 8, placeholder: 'Security requirements and considerations.' },
    { id: 'appendix', name: 'Appendix', required: false, order: 9 }
  ],

  stepLayout: {
    imagePosition: 'below',
    imageSize: 'large',
    showStepNumbers: true,
    numberingStyle: 'decimal',
    showTimestamps: false,
    calloutStyle: 'box',
    showActionType: false,
    borderStyle: 'solid',
    stepSpacing: 'normal'
  },

  typography: {
    headingFont: 'Consolas',
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
    lineSpacing: 1.25
  },

  colors: {
    primary: '#1a1a2e',       // Dark navy
    secondary: '#16213e',     // Darker blue
    accent: '#0f3460',        // Deep blue
    text: '#333333',          // Dark gray text
    background: '#ffffff',    // White background
    border: '#e0e0e0',        // Light gray borders
    headerBg: '#1a1a2e',      // Dark navy header
    headerText: '#ffffff',    // White header text
    success: '#00b894',       // Teal green
    warning: '#fdcb6e',       // Yellow
    info: '#74b9ff'           // Light blue
  },

  options: {
    showTableOfContents: true,
    showDocumentSummary: false,
    showApprovalSection: false,
    showRevisionHistory: true,
    showGlossary: true,
    showCheckpoints: false
  }
};
