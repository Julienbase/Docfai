import { DocumentTemplate } from '../types';

/**
 * User Manual/Guide Template
 *
 * End-user documentation with friendly layout, annotated screenshots, and clear navigation.
 * Features chapter-based organization, TOC, and user-friendly formatting.
 * Common in: Software Manuals, Product Documentation, Help Documentation, End-User Guides
 */
export const UserGuideTemplate: DocumentTemplate = {
  id: 'user-guide',
  name: 'User Manual / Guide',
  description: 'User-friendly documentation with clear navigation, annotated screenshots, and chapter-based organization. Perfect for end-user software manuals.',
  icon: 'BookOpen',
  category: 'operations',

  layout: {
    pageSize: 'A4',
    orientation: 'portrait',
    margins: {
      top: 20,
      right: 25,
      bottom: 20,
      left: 25
    },
    columns: 1
  },

  header: {
    show: true,
    includeDocId: false,
    includeRevision: true,
    includeLogo: true,
    includeDate: true,
    logoPosition: 'left',
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
    { id: 'toc', name: 'Table of Contents', required: true, order: 2 },
    { id: 'introduction', name: 'Introduction', required: true, order: 3, placeholder: 'Welcome and overview of the application.' },
    { id: 'getting_started', name: 'Getting Started', required: true, order: 4, placeholder: 'Quick start guide and initial setup.' },
    { id: 'features', name: 'Features & Functions', required: true, order: 5 },
    { id: 'faq', name: 'Frequently Asked Questions', required: false, order: 6, placeholder: 'Common questions and answers.' },
    { id: 'troubleshooting', name: 'Troubleshooting', required: false, order: 7, placeholder: 'Common issues and how to resolve them.' },
    { id: 'glossary', name: 'Glossary', required: false, order: 8, placeholder: 'Definitions of key terms.' },
    { id: 'support', name: 'Support & Contact', required: false, order: 9, placeholder: 'How to get help and contact information.' }
  ],

  stepLayout: {
    imagePosition: 'below',
    imageSize: 'large',
    showStepNumbers: true,
    numberingStyle: 'decimal',
    showTimestamps: false,
    calloutStyle: 'sidebar',
    showActionType: false,
    borderStyle: 'none',
    stepSpacing: 'normal'
  },

  typography: {
    headingFont: 'Georgia',
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
    lineSpacing: 1.4
  },

  colors: {
    primary: '#2c3e50',       // Dark slate
    secondary: '#34495e',     // Slate gray
    accent: '#3498db',        // Friendly blue
    text: '#333333',          // Dark gray text
    background: '#ffffff',    // White background
    border: '#dfe6e9',        // Soft gray borders
    headerBg: '#2c3e50',      // Dark slate header
    headerText: '#ffffff',    // White header text
    success: '#00b894',       // Mint green
    warning: '#ffeaa7',       // Soft yellow
    info: '#81ecec'           // Light cyan
  },

  options: {
    showTableOfContents: true,
    showDocumentSummary: false,
    showApprovalSection: false,
    showRevisionHistory: false,
    showGlossary: true,
    showCheckpoints: false
  }
};
