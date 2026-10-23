/**
 * Template PDF Configuration
 *
 * This module provides configuration formatting for PDF exports using templates.
 * The actual PDF generation happens in the Electron main process (PDFService.ts).
 * This utility formats the template settings for passing to the main process.
 */

import { DocumentTemplate, TemplateCustomization, AppliedTemplate } from '../templates/types';
import { applyCustomization } from '../templates/registry';

export interface PdfTemplateConfig {
  // Layout
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  // Typography
  headingFont: string;
  bodyFont: string;
  fontSize: {
    title: number;
    heading1: number;
    heading2: number;
    body: number;
    caption: number;
  };

  // Colors (hex without #)
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
    headerBg: string;
    headerText: string;
    border: string;
  };

  // Header
  header: {
    show: boolean;
    companyLogo: string | null;
    companyName: string;
    documentId: string;
    revision: string;
    includeDate: boolean;
  };

  // Footer
  footer: {
    show: boolean;
    includePageNumbers: boolean;
    confidentialityText: string;
    includeDocumentName: boolean;
  };

  // Step layout
  stepLayout: {
    imagePosition: 'above' | 'below' | 'left' | 'right' | 'inline';
    imageSize: 'small' | 'medium' | 'large' | 'full-width';
    showStepNumbers: boolean;
    numberingStyle: 'decimal' | 'roman' | 'alpha' | 'bullet' | 'none';
    borderStyle: 'none' | 'solid' | 'dashed' | 'double';
    stepSpacing: 'compact' | 'normal' | 'spacious';
  };

  // Template-specific options
  options: {
    showDocumentSummary: boolean;
    showTableOfContents: boolean;
    showApprovalSection: boolean;
    templateId: string;
    templateName: string;
  };

  // Custom sections
  customSections: {
    purpose?: string;
    scope?: string;
    prerequisites?: string;
  };
}

// Helper to remove # from hex color
function hexWithoutHash(hex: string): string {
  return hex.replace('#', '');
}

// Get confidentiality text based on level
function getConfidentialityText(
  level: 'public' | 'internal' | 'confidential' | 'restricted' | undefined,
  footerText?: string
): string {
  if (footerText) return footerText;

  switch (level) {
    case 'public': return 'PUBLIC';
    case 'confidential': return 'CONFIDENTIAL';
    case 'restricted': return 'RESTRICTED';
    case 'internal':
    default: return 'INTERNAL USE ONLY';
  }
}

/**
 * Convert template and customization to PDF configuration
 */
export function createPdfTemplateConfig(
  template: DocumentTemplate,
  customization: TemplateCustomization
): PdfTemplateConfig {
  const applied = applyCustomization(template, customization);

  return {
    pageSize: applied.layout.pageSize,
    orientation: applied.layout.orientation,
    margins: applied.layout.margins,

    headingFont: applied.typography.headingFont,
    bodyFont: applied.typography.bodyFont,
    fontSize: {
      title: applied.typography.fontSize.title,
      heading1: applied.typography.fontSize.heading1,
      heading2: applied.typography.fontSize.heading2,
      body: applied.typography.fontSize.body,
      caption: applied.typography.fontSize.caption,
    },

    colors: {
      primary: hexWithoutHash(applied.colors.primary),
      secondary: hexWithoutHash(applied.colors.secondary),
      accent: hexWithoutHash(applied.colors.accent),
      text: hexWithoutHash(applied.colors.text),
      background: hexWithoutHash(applied.colors.background),
      headerBg: hexWithoutHash(applied.colors.headerBg),
      headerText: hexWithoutHash(applied.colors.headerText),
      border: hexWithoutHash(applied.colors.border),
    },

    header: {
      show: applied.header.show,
      companyLogo: customization.companyLogo || null,
      companyName: customization.companyName || '',
      documentId: customization.documentId || '',
      revision: customization.revision || '1.0',
      includeDate: applied.header.includeDate,
    },

    footer: {
      show: applied.footer.show,
      includePageNumbers: applied.footer.includePageNumbers,
      confidentialityText: getConfidentialityText(
        customization.confidentialityLevel,
        applied.footer.confidentialityText
      ),
      includeDocumentName: applied.footer.includeDocumentName,
    },

    stepLayout: {
      imagePosition: applied.stepLayout.imagePosition,
      imageSize: applied.stepLayout.imageSize,
      showStepNumbers: applied.stepLayout.showStepNumbers,
      numberingStyle: applied.stepLayout.numberingStyle,
      borderStyle: applied.stepLayout.borderStyle,
      stepSpacing: applied.stepLayout.stepSpacing,
    },

    options: {
      showDocumentSummary: applied.options.showDocumentSummary,
      showTableOfContents: applied.options.showTableOfContents,
      showApprovalSection: applied.options.showApprovalSection,
      templateId: applied.id,
      templateName: applied.name,
    },

    customSections: {
      purpose: customization.customSections?.purpose,
      scope: customization.customSections?.scope,
      prerequisites: customization.customSections?.prerequisites,
    },
  };
}

/**
 * Get image dimensions based on template size setting
 */
export function getImageDimensions(size: 'small' | 'medium' | 'large' | 'full-width'): { width: number; height: number } {
  switch (size) {
    case 'small': return { width: 120, height: 80 };
    case 'medium': return { width: 150, height: 100 };
    case 'large': return { width: 170, height: 113 };
    case 'full-width': return { width: 190, height: 127 };
    default: return { width: 170, height: 113 };
  }
}

/**
 * Format step number based on style
 */
export function formatStepNumber(index: number, style: 'decimal' | 'roman' | 'alpha' | 'bullet'): string {
  switch (style) {
    case 'roman':
      const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
        'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
      return romanNumerals[index] || String(index + 1);
    case 'alpha':
      return String.fromCharCode(65 + index);
    case 'bullet':
      return '•';
    case 'decimal':
    default:
      return String(index + 1);
  }
}
