// Template type definitions for industry-standard documentation templates

export type TemplateCategory = 'compliance' | 'operations' | 'training' | 'technical';
export type ImagePosition = 'above' | 'below' | 'left' | 'right' | 'inline';
export type ImageSize = 'small' | 'medium' | 'large' | 'full-width';
export type NumberingStyle = 'decimal' | 'roman' | 'alpha' | 'bullet' | 'none';
export type CalloutStyle = 'box' | 'sidebar' | 'inline' | 'banner' | 'none';
export type PageSize = 'A4' | 'Letter' | 'Legal';
export type Orientation = 'portrait' | 'landscape';

export interface TemplateColors {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
  border: string;
  headerBg: string;
  headerText: string;
  success: string;
  warning: string;
  info: string;
}

export interface TemplateTypography {
  headingFont: string;
  bodyFont: string;
  fontSize: {
    title: number;
    heading1: number;
    heading2: number;
    heading3: number;
    body: number;
    caption: number;
    small: number;
  };
  lineSpacing: number;
}

export interface TemplateHeader {
  show: boolean;
  includeDocId: boolean;
  includeRevision: boolean;
  includeLogo: boolean;
  includeDate: boolean;
  logoPosition: 'left' | 'center' | 'right';
  style: 'minimal' | 'standard' | 'detailed';
}

export interface TemplateFooter {
  show: boolean;
  includePageNumbers: boolean;
  includeDate: boolean;
  includeConfidentiality: boolean;
  includeDocumentName: boolean;
  confidentialityText?: string;
}

export interface TemplateSection {
  id: string;
  name: string;
  required: boolean;
  order: number;
  placeholder?: string;
}

export interface StepLayout {
  imagePosition: ImagePosition;
  imageSize: ImageSize;
  showStepNumbers: boolean;
  numberingStyle: NumberingStyle;
  showTimestamps: boolean;
  calloutStyle: CalloutStyle;
  showActionType: boolean;
  borderStyle: 'none' | 'solid' | 'dashed' | 'double';
  stepSpacing: 'compact' | 'normal' | 'spacious';
}

export interface PageLayout {
  pageSize: PageSize;
  orientation: Orientation;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  columns: 1 | 2;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: TemplateCategory;
  previewImage?: string;

  // Layout configuration
  layout: PageLayout;

  // Header/Footer
  header: TemplateHeader;
  footer: TemplateFooter;

  // Content sections
  sections: TemplateSection[];

  // Step rendering
  stepLayout: StepLayout;

  // Typography
  typography: TemplateTypography;

  // Colors
  colors: TemplateColors;

  // Additional options
  options: {
    showTableOfContents: boolean;
    showDocumentSummary: boolean;
    showApprovalSection: boolean;
    showRevisionHistory: boolean;
    showGlossary: boolean;
    showCheckpoints: boolean;
    watermarkText?: string;
  };
}

// User customization options
export interface TemplateCustomization {
  colors?: Partial<TemplateColors>;
  typography?: Partial<TemplateTypography>;
  companyLogo?: string | null;
  companyName?: string;
  documentId?: string;
  revision?: string;
  confidentialityLevel?: 'public' | 'internal' | 'confidential' | 'restricted';
  customSections?: {
    purpose?: string;
    scope?: string;
    prerequisites?: string;
    notes?: string;
  };
}

// Combined template with user customizations
export interface AppliedTemplate extends DocumentTemplate {
  customization: TemplateCustomization;
}

// Template presets for quick selection
export interface TemplatePreset {
  id: string;
  name: string;
  templateId: string;
  customization: TemplateCustomization;
}

// Export configuration that combines template + options
export interface TemplateExportConfig {
  template: DocumentTemplate;
  customization: TemplateCustomization;
  exportOptions: {
    includeScreenshots: boolean;
    includeTimestamps: boolean;
    includeActions: boolean;
    translateTo: 'none' | 'EN' | 'DE';
  };
}
