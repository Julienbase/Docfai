import { DocumentTemplate } from '../types';

/**
 * Standard Operating Procedure (SOP) Template
 *
 * Industry-standard template for compliance-ready process documentation.
 * Features document ID, revision tracking, approval sections, and structured layout.
 * Common in: Healthcare, Manufacturing, Quality Assurance, Regulatory Compliance
 */
export const SOPTemplate: DocumentTemplate = {
  id: 'sop',
  name: 'Standard Operating Procedure (SOP)',
  description: 'Compliance-ready process documentation with revision tracking, approval sections, and structured layout. Ideal for regulated industries.',
  icon: 'ClipboardCheck',
  category: 'compliance',

  layout: {
    pageSize: 'A4',
    orientation: 'portrait',
    margins: {
      top: 25,
      right: 20,
      bottom: 25,
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
    style: 'detailed'
  },

  footer: {
    show: true,
    includePageNumbers: true,
    includeDate: true,
    includeConfidentiality: true,
    includeDocumentName: true,
    confidentialityText: 'CONFIDENTIAL - Internal Use Only'
  },

  sections: [
    { id: 'header', name: 'Document Header', required: true, order: 1 },
    { id: 'purpose', name: 'Purpose', required: true, order: 2, placeholder: 'Describe the purpose of this procedure and why it exists.' },
    { id: 'scope', name: 'Scope', required: true, order: 3, placeholder: 'Define who and what this procedure applies to.' },
    { id: 'responsibilities', name: 'Responsibilities', required: false, order: 4, placeholder: 'List roles and their responsibilities.' },
    { id: 'prerequisites', name: 'Prerequisites', required: false, order: 5, placeholder: 'List any required materials, access, or preparations.' },
    { id: 'procedure', name: 'Procedure', required: true, order: 6 },
    { id: 'references', name: 'References', required: false, order: 7, placeholder: 'List related documents and references.' },
    { id: 'revision_history', name: 'Revision History', required: true, order: 8 },
    { id: 'approvals', name: 'Approvals', required: true, order: 9 }
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
    headingFont: 'Arial',
    bodyFont: 'Arial',
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
    primary: '#1e3a5f',      // Dark navy blue
    secondary: '#4a6fa5',     // Medium blue
    accent: '#e67e22',        // Orange for warnings/highlights
    text: '#2c3e50',          // Dark gray text
    background: '#ffffff',    // White background
    border: '#bdc3c7',        // Light gray borders
    headerBg: '#1e3a5f',      // Navy header
    headerText: '#ffffff',    // White header text
    success: '#27ae60',       // Green for success
    warning: '#f39c12',       // Yellow for warnings
    info: '#3498db'           // Blue for info
  },

  options: {
    showTableOfContents: true,
    showDocumentSummary: false,
    showApprovalSection: true,
    showRevisionHistory: true,
    showGlossary: false,
    showCheckpoints: false
  }
};
