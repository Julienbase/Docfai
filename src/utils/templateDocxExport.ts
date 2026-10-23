import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  PageBreak,
  TextRun,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
  ShadingType
} from 'docx';
import DOMPurify from 'dompurify';
import { DocumentTemplate, TemplateCustomization, AppliedTemplate } from '../templates/types';
import { applyCustomization, getTemplate } from '../templates/registry';
import { formatEuropeanDateTime } from './dateFormat';
import { normalizeDescription } from './normalizeDescription';

interface ScreenshotData {
  id: string;
  imageData?: string;
  filePath?: string;
  description?: string;
  title?: string;
  actionType?: string;
  timestamp?: number;
}

interface ExportData {
  name: string;
  projectName: string;
  screenshots: ScreenshotData[];
  isInteractiveScreenshots: boolean;
  documentationSteps?: any[];
}

interface TemplateExportOptions {
  includeScreenshots: boolean;
  includeTimestamps: boolean;
  includeActions: boolean;
  translateTo?: 'none' | 'EN' | 'DE';
  template: DocumentTemplate;
  customization: TemplateCustomization;
}

// Translation map for DOCX headers and labels
const TRANSLATIONS = {
  EN: {
    overview: 'Overview',
    documentSummary: 'Document Summary',
    projectName: 'Project Name',
    documentationTitle: 'Documentation Title',
    totalSteps: 'Total Steps',
    source: 'Source',
    generatedDate: 'Generated Date',
    stepByStepGuide: 'Step-by-Step Guide',
    step: 'Step',
    purpose: 'Purpose',
    scope: 'Scope',
    prerequisites: 'Prerequisites',
    procedure: 'Procedure',
    approvals: 'Approvals',
    preparedBy: 'Prepared By',
    approvedBy: 'Approved By',
    name: 'Name',
    date: 'Date',
    signature: 'Signature',
    page: 'Page',
    confidential: 'CONFIDENTIAL',
    restricted: 'RESTRICTED',
    public: 'PUBLIC',
    internal: 'INTERNAL USE ONLY',
    revisionHistory: 'Revision History',
    learningObjectives: 'Learning Objectives',
    checkpoint: 'Checkpoint',
    tip: 'Tip',
    warning: 'Warning',
    note: 'Note',
    tableOfContents: 'Table of Contents'
  },
  DE: {
    overview: 'Übersicht',
    documentSummary: 'Dokumentzusammenfassung',
    projectName: 'Projektname',
    documentationTitle: 'Dokumentationstitel',
    totalSteps: 'Gesamtschritte',
    source: 'Quelle',
    generatedDate: 'Erstellungsdatum',
    stepByStepGuide: 'Schritt-für-Schritt-Anleitung',
    step: 'Schritt',
    purpose: 'Zweck',
    scope: 'Geltungsbereich',
    prerequisites: 'Voraussetzungen',
    procedure: 'Verfahren',
    approvals: 'Genehmigungen',
    preparedBy: 'Erstellt von',
    approvedBy: 'Genehmigt von',
    name: 'Name',
    date: 'Datum',
    signature: 'Unterschrift',
    page: 'Seite',
    confidential: 'VERTRAULICH',
    restricted: 'EINGESCHRÄNKT',
    public: 'ÖFFENTLICH',
    internal: 'NUR FÜR INTERNEN GEBRAUCH',
    revisionHistory: 'Revisionshistorie',
    learningObjectives: 'Lernziele',
    checkpoint: 'Prüfpunkt',
    tip: 'Tipp',
    warning: 'Warnung',
    note: 'Hinweis',
    tableOfContents: 'Inhaltsverzeichnis'
  }
};

// Helper to convert hex color to DOCX color (without #)
function hexToDocxColor(hex: string): string {
  return hex.replace('#', '');
}

// Helper to convert mm to twips (1 mm = 56.7 twips approximately)
function mmToTwips(mm: number): number {
  return Math.round(mm * 56.7);
}

export class TemplateDocxExporter {
  private template: AppliedTemplate;
  private translations: typeof TRANSLATIONS['EN'];

  constructor() {
    // Default template
    this.template = getTemplate('sop') as AppliedTemplate;
    this.translations = TRANSLATIONS.EN;
  }

  // Helper method to strip HTML tags from text
  private stripHtmlTags(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  private htmlToDocxParagraphs(html: string, color?: string): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const normalized = normalizeDescription(html);
    if (!normalized) return [];

    const hasHtmlTags = /<[^>]+>/.test(normalized);

    if (!hasHtmlTags) {
      return [new Paragraph({
        children: [new TextRun({ text: normalized, color: color ? hexToDocxColor(color) : undefined })],
        spacing: { after: 120 }
      })];
    }

    const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (tempDiv) {
      tempDiv.innerHTML = DOMPurify.sanitize(normalized);

      const elements = Array.from(tempDiv.children);
      for (const element of elements) {
        const tagName = element.tagName.toLowerCase();

        if (tagName === 'p') {
          const runs: TextRun[] = this.parseInlineFormatting(element, color);
          let alignment: typeof AlignmentType[keyof typeof AlignmentType] | undefined;
          const classList = Array.from(element.classList);
          if (classList.includes('ql-align-center')) alignment = AlignmentType.CENTER;
          else if (classList.includes('ql-align-right')) alignment = AlignmentType.RIGHT;
          else if (classList.includes('ql-align-justify')) alignment = AlignmentType.JUSTIFIED;

          paragraphs.push(new Paragraph({ children: runs, spacing: { after: 120 }, alignment }));
        } else if (tagName === 'ul' || tagName === 'ol') {
          const listItems = Array.from(element.querySelectorAll('li'));
          listItems.forEach((li, index) => {
            const bullet = tagName === 'ul' ? '• ' : `${index + 1}. `;
            const runs: TextRun[] = this.parseInlineFormatting(li, color);
            const bulletRun = new TextRun({ text: bullet, color: color ? hexToDocxColor(color) : undefined });
            paragraphs.push(new Paragraph({ children: [bulletRun, ...runs], spacing: { after: 60 } }));
          });
        } else {
          const runs: TextRun[] = this.parseInlineFormatting(element, color);
          paragraphs.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
        }
      }
    } else {
      const plainText = normalized.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: plainText, color: color ? hexToDocxColor(color) : undefined })],
        spacing: { after: 120 }
      }));
    }

    return paragraphs.length > 0 ? paragraphs : [new Paragraph({
      children: [new TextRun({ text: normalized, color: color ? hexToDocxColor(color) : undefined })],
      spacing: { after: 120 }
    })];
  }

  private parseInlineFormatting(element: Element, color?: string): TextRun[] {
    const runs: TextRun[] = [];

    const processNode = (node: Node, formatting: { bold?: boolean; italics?: boolean; underline?: boolean } = {}) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          runs.push(new TextRun({
            text,
            bold: formatting.bold,
            italics: formatting.italics,
            underline: formatting.underline ? {} : undefined,
            color: color ? hexToDocxColor(color) : undefined
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();
        const newFormatting = { ...formatting };

        if (tagName === 'strong' || tagName === 'b') newFormatting.bold = true;
        else if (tagName === 'em' || tagName === 'i') newFormatting.italics = true;
        else if (tagName === 'u') newFormatting.underline = true;
        else if (tagName === 'br') {
          runs.push(new TextRun({ text: '\n', break: 1 }));
          return;
        }

        Array.from(el.childNodes).forEach(child => processNode(child, newFormatting));
      }
    };

    Array.from(element.childNodes).forEach(child => processNode(child));
    return runs.length > 0 ? runs : [new TextRun({
      text: element.textContent || '',
      color: color ? hexToDocxColor(color) : undefined
    })];
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    try {
      if (!base64 || typeof base64 !== 'string') {
        throw new Error('Invalid base64 input');
      }

      let base64Data: string;
      if (base64.startsWith('data:')) {
        const commaIndex = base64.indexOf(',');
        if (commaIndex === -1) throw new Error('Invalid data URL format');
        base64Data = base64.substring(commaIndex + 1);
      } else {
        base64Data = base64;
      }

      base64Data = base64Data.trim().replace(/\s/g, '');
      const paddingNeeded = (4 - (base64Data.length % 4)) % 4;
      const paddedBase64 = base64Data + '='.repeat(paddingNeeded);

      const binaryString = window.atob(paddedBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes.buffer;
    } catch (error) {
      throw new Error(`Invalid image data format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createImageFromData(imageData: string, width: number = 700, height: number = 447): Promise<ImageRun> {
    if (!imageData || imageData.trim() === '') {
      return this.createPlaceholderImage(width, height);
    }

    try {
      if (imageData.startsWith('data:image')) {
        const imageBuffer = this.base64ToBuffer(imageData);
        return new ImageRun({ data: imageBuffer, transformation: { width, height } });
      } else {
        if (window.electronAPI) {
          let fileUrl: string;
          if (window.electronAPI.getFileUrl) {
            fileUrl = await window.electronAPI.getFileUrl(imageData);
          } else {
            const pathParts = imageData.split(/[/\\]/);
            const fileName = pathParts.pop();
            if (fileName) {
              let projectName = '';
              const projectIndex = pathParts.findIndex(part => part === 'projects');
              if (projectIndex !== -1 && projectIndex + 1 < pathParts.length) {
                projectName = pathParts[projectIndex + 1];
              }
              let fileType: 'screenshots' | 'recordings' | 'diagrams' = 'screenshots';
              if (imageData.includes('recordings')) fileType = 'recordings';
              else if (imageData.includes('diagrams')) fileType = 'diagrams';

              if (window.electronAPI.getProjectFilePath) {
                const relativePath = `${fileType}/${fileName}`;
                fileUrl = await window.electronAPI.getProjectFilePath(projectName, relativePath);
              } else {
                throw new Error('No Electron file access methods available');
              }
            } else {
              throw new Error('Invalid file path format');
            }
          }

          const response = await fetch(fileUrl);
          if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
          const imageBuffer = await response.arrayBuffer();
          return new ImageRun({ data: imageBuffer, transformation: { width, height } });
        } else {
          const response = await fetch(imageData);
          if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
          const imageBuffer = await response.arrayBuffer();
          return new ImageRun({ data: imageBuffer, transformation: { width, height } });
        }
      }
    } catch {
      return this.createPlaceholderImage(width, height);
    }
  }

  private createPlaceholderImage(width: number = 700, height: number = 447): ImageRun {
    const placeholderBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const placeholderBuffer = this.base64ToBuffer('data:image/png;base64,' + placeholderBase64);
    return new ImageRun({ data: placeholderBuffer, transformation: { width, height } });
  }

  // Get image dimensions based on template settings
  // Images maintain aspect ratio - these are max dimensions
  private getImageDimensions(): { width: number; height: number } {
    const { stepLayout } = this.template;
    switch (stepLayout.imageSize) {
      case 'small': return { width: 390, height: 260 };
      case 'medium': return { width: 510, height: 340 };
      case 'large': return { width: 630, height: 420 };
      case 'full-width': return { width: 720, height: 480 };
      default: return { width: 540, height: 360 };
    }
  }

  // Get step number formatting
  private formatStepNumber(index: number): string {
    const { stepLayout } = this.template;
    switch (stepLayout.numberingStyle) {
      case 'roman':
        const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
          'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
        return romanNumerals[index] || String(index + 1);
      case 'alpha':
        return String.fromCharCode(65 + index);
      case 'bullet':
        return '•';
      case 'none':
        return '';
      case 'decimal':
      default:
        return String(index + 1);
    }
  }

  // Create header for document
  private createHeader(): Header {
    const { header } = this.template;
    const { customization } = this.template as AppliedTemplate;
    const { colors, typography } = this.template;

    const headerChildren: Paragraph[] = [];

    if (header.show) {
      const runs: (TextRun | ImageRun)[] = [];

      // Add company name or document info
      if (customization?.companyName) {
        runs.push(new TextRun({
          text: customization.companyName,
          bold: true,
          size: typography.fontSize.small * 2,
          color: hexToDocxColor(colors.headerText)
        }));
      }

      if (header.includeDocId && customization?.documentId) {
        if (runs.length > 0) runs.push(new TextRun({ text: '  |  ' }));
        runs.push(new TextRun({
          text: customization.documentId,
          size: typography.fontSize.small * 2,
          color: hexToDocxColor(colors.headerText)
        }));
      }

      if (header.includeRevision && customization?.revision) {
        if (runs.length > 0) runs.push(new TextRun({ text: '  |  ' }));
        runs.push(new TextRun({
          text: `Rev ${customization.revision}`,
          size: typography.fontSize.small * 2,
          color: hexToDocxColor(colors.headerText)
        }));
      }

      if (runs.length > 0) {
        headerChildren.push(new Paragraph({
          children: runs,
          alignment: header.logoPosition === 'center' ? AlignmentType.CENTER :
            header.logoPosition === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT
        }));
      }
    }

    return new Header({ children: headerChildren });
  }

  // Create footer for document
  private createFooter(): Footer {
    const { footer } = this.template;
    const { customization } = this.template as AppliedTemplate;
    const { colors, typography } = this.template;

    const footerChildren: Paragraph[] = [];

    if (footer.show) {
      const runs: TextRun[] = [];

      if (footer.includeConfidentiality) {
        const confidentialityText = footer.confidentialityText ||
          (customization?.confidentialityLevel === 'confidential' ? this.translations.confidential :
            customization?.confidentialityLevel === 'restricted' ? this.translations.restricted :
              customization?.confidentialityLevel === 'public' ? this.translations.public : this.translations.internal);
        runs.push(new TextRun({
          text: confidentialityText,
          size: typography.fontSize.small * 2,
          color: hexToDocxColor(colors.text)
        }));
      }

      if (footer.includePageNumbers) {
        if (runs.length > 0) runs.push(new TextRun({ text: '  |  ' }));
        runs.push(new TextRun({
          text: `${this.translations.page} `,
          size: typography.fontSize.small * 2
        }));
        runs.push(new TextRun({
          children: [PageNumber.CURRENT],
          size: typography.fontSize.small * 2
        }));
      }

      if (runs.length > 0) {
        footerChildren.push(new Paragraph({
          children: runs,
          alignment: AlignmentType.CENTER
        }));
      }
    }

    return new Footer({ children: footerChildren });
  }

  // Create a callout/info box
  private createCallout(text: string, type: 'tip' | 'warning' | 'note' | 'checkpoint'): Paragraph {
    const { colors, typography, stepLayout } = this.template;

    let bgColor: string;
    let borderColor: string;
    let prefix: string;

    switch (type) {
      case 'tip':
        bgColor = colors.info;
        borderColor = colors.info;
        prefix = `💡 ${this.translations.tip}: `;
        break;
      case 'warning':
        bgColor = colors.warning;
        borderColor = colors.warning;
        prefix = `⚠️ ${this.translations.warning}: `;
        break;
      case 'checkpoint':
        bgColor = colors.success;
        borderColor = colors.success;
        prefix = `✓ ${this.translations.checkpoint}: `;
        break;
      case 'note':
      default:
        bgColor = colors.info;
        borderColor = colors.info;
        prefix = `📝 ${this.translations.note}: `;
        break;
    }

    const borderStyle = stepLayout.calloutStyle === 'sidebar' ? {
      left: { style: BorderStyle.SINGLE, size: 24, color: hexToDocxColor(borderColor) }
    } : stepLayout.calloutStyle === 'box' ? {
      top: { style: BorderStyle.SINGLE, size: 1, color: hexToDocxColor(borderColor) },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: hexToDocxColor(borderColor) },
      left: { style: BorderStyle.SINGLE, size: 1, color: hexToDocxColor(borderColor) },
      right: { style: BorderStyle.SINGLE, size: 1, color: hexToDocxColor(borderColor) }
    } : undefined;

    return new Paragraph({
      children: [
        new TextRun({ text: prefix, bold: true, size: typography.fontSize.body * 2 }),
        new TextRun({ text: text, size: typography.fontSize.body * 2 })
      ],
      border: borderStyle,
      shading: stepLayout.calloutStyle === 'box' || stepLayout.calloutStyle === 'banner' ? {
        type: ShadingType.SOLID,
        color: hexToDocxColor(bgColor)
      } : undefined,
      spacing: { before: 120, after: 120 }
    });
  }

  // Generate step content based on template
  private async generateStepContent(
    step: ScreenshotData,
    stepNumber: number,
    options: TemplateExportOptions,
    pageBreakBefore: boolean = false
  ): Promise<(Paragraph | Table)[]> {
    const content: (Paragraph | Table)[] = [];
    const { colors, typography, stepLayout } = this.template;
    const imageDimensions = this.getImageDimensions();

    // Step header
    const stepPrefix = stepLayout.showStepNumbers ?
      `${this.translations.step} ${this.formatStepNumber(stepNumber - 1)}: ` : '';
    const cleanTitle = this.stripHtmlTags(step.title || step.description || `Action ${stepNumber}`);

    content.push(new Paragraph({
      children: [
        new TextRun({
          text: stepPrefix + cleanTitle,
          bold: true,
          size: typography.fontSize.heading2 * 2,
          font: typography.headingFont,
          color: hexToDocxColor(colors.primary)
        })
      ],
      // Use pageBreakBefore property on the title paragraph itself instead of an
      // empty PageBreak paragraph, which otherwise renders as a phantom blank page.
      pageBreakBefore,
      spacing: {
        before: stepLayout.stepSpacing === 'spacious' ? 480 :
          stepLayout.stepSpacing === 'compact' ? 120 : 240,
        after: 120
      },
      border: stepLayout.borderStyle !== 'none' ? {
        bottom: {
          style: stepLayout.borderStyle === 'dashed' ? BorderStyle.DASHED :
            stepLayout.borderStyle === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
          size: 1,
          color: hexToDocxColor(colors.border)
        }
      } : undefined
    }));

    // Handle image position: above
    if (stepLayout.imagePosition === 'above' && options.includeScreenshots) {
      const imageSource = step.imageData || step.filePath;
      if (imageSource) {
        try {
          const imageRun = await this.createImageFromData(imageSource, imageDimensions.width, imageDimensions.height);
          content.push(new Paragraph({
            children: [imageRun],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 }
          }));
        } catch {
          content.push(new Paragraph({
            text: '[Screenshot not available]',
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 }
          }));
        }
      }
    }

    // Handle image position: left or right (side-by-side with text using table)
    if ((stepLayout.imagePosition === 'left' || stepLayout.imagePosition === 'right') && options.includeScreenshots) {
      const imageSource = step.imageData || step.filePath;
      if (imageSource) {
        try {
          const imageRun = await this.createImageFromData(imageSource, imageDimensions.width, imageDimensions.height);

          // Build description paragraphs
          const descParagraphs: Paragraph[] = [];
          if (step.description && step.description !== step.title) {
            descParagraphs.push(...this.htmlToDocxParagraphs(step.description, colors.text));
          }

          // Create table with image and text side-by-side
          const imageCellContent = [new Paragraph({ children: [imageRun], alignment: AlignmentType.CENTER })];
          const textCellContent = descParagraphs.length > 0 ? descParagraphs : [new Paragraph({ text: '' })];

          const table = new Table({
            rows: [
              new TableRow({
                children: stepLayout.imagePosition === 'left' ? [
                  new TableCell({
                    children: imageCellContent,
                    width: { size: 45, type: WidthType.PERCENTAGE },
                    margins: { top: 100, bottom: 100, left: 100, right: 100 }
                  }),
                  new TableCell({
                    children: textCellContent,
                    width: { size: 55, type: WidthType.PERCENTAGE },
                    margins: { top: 100, bottom: 100, left: 100, right: 100 }
                  })
                ] : [
                  new TableCell({
                    children: textCellContent,
                    width: { size: 55, type: WidthType.PERCENTAGE },
                    margins: { top: 100, bottom: 100, left: 100, right: 100 }
                  }),
                  new TableCell({
                    children: imageCellContent,
                    width: { size: 45, type: WidthType.PERCENTAGE },
                    margins: { top: 100, bottom: 100, left: 100, right: 100 }
                  })
                ]
              })
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          });

          // Add spacing before and after table
          content.push(new Paragraph({ spacing: { before: 120 } }));
          content.push(table);
          content.push(new Paragraph({ spacing: { after: 240 } }));
        } catch {
          content.push(new Paragraph({
            text: '[Screenshot not available]',
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 }
          }));

          // Add description below if no image
          if (step.description && step.description !== step.title) {
            const descParagraphs = this.htmlToDocxParagraphs(step.description, colors.text);
            content.push(...descParagraphs);
          }
        }
      } else {
        // No image - just add description
        if (step.description && step.description !== step.title) {
          const descParagraphs = this.htmlToDocxParagraphs(step.description, colors.text);
          content.push(...descParagraphs);
        }
      }
    } else if (stepLayout.imagePosition !== 'left' && stepLayout.imagePosition !== 'right') {
      // For non-side-by-side layouts, add description normally
      if (step.description && step.description !== step.title) {
        const descParagraphs = this.htmlToDocxParagraphs(step.description, colors.text);
        content.push(...descParagraphs);
      }
    }

    // Handle image position: below or inline
    if ((stepLayout.imagePosition === 'below' || stepLayout.imagePosition === 'inline') && options.includeScreenshots) {
      const imageSource = step.imageData || step.filePath;
      if (imageSource) {
        try {
          const imageRun = await this.createImageFromData(imageSource, imageDimensions.width, imageDimensions.height);
          content.push(new Paragraph({
            children: [imageRun],
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 240 }
          }));
        } catch {
          content.push(new Paragraph({
            text: '[Screenshot not available]',
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 }
          }));
        }
      }
    }

    // Timestamps — always show date+time on each step for audit trail
    if (step.timestamp) {
      const timestamp = typeof step.timestamp === 'number' ? step.timestamp : parseInt(step.timestamp as any);
      const ms = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
      const formattedDateTime = formatEuropeanDateTime(new Date(ms));

      content.push(new Paragraph({
        children: [new TextRun({
          text: `Captured: ${formattedDateTime}`,
          size: typography.fontSize.caption * 2,
          color: hexToDocxColor(colors.secondary),
          italics: true
        })],
        spacing: { after: 60 }
      }));
    }

    return content;
  }

  // Main export method
  async exportToDocx(exportData: ExportData, options: TemplateExportOptions): Promise<Blob> {
    const { name, projectName, screenshots, documentationSteps } = exportData;

    // Apply template and customization
    this.template = applyCustomization(options.template, options.customization);
    const { colors, typography, layout, options: templateOptions } = this.template;
    const customization = options.customization;

    // Set translations
    const lang = options.translateTo && options.translateTo !== 'none' ? options.translateTo : 'EN';
    this.translations = TRANSLATIONS[lang];

    // Determine steps
    let steps: ScreenshotData[] = [];
    if (screenshots && screenshots.length > 0) {
      steps = screenshots;
    } else if (documentationSteps) {
      steps = documentationSteps.map((step, index) => ({
        id: step.id || `step-${index + 1}`,
        imageData: step.imageData,
        filePath: step.type === 'diagram' ? step.diagramImagePath : (step.filePath || step.screenshot),
        description: step.description,
        title: step.title,
        actionType: step.actionType,
        timestamp: step.timestamp
      }));
    }

    const children: (Paragraph | Table)[] = [];

    // Company logo
    if (customization.companyLogo) {
      try {
        const logoImage = await this.createImageFromData(customization.companyLogo, 60, 60);
        children.push(new Paragraph({
          children: [logoImage],
          alignment: this.template.header.logoPosition === 'center' ? AlignmentType.CENTER :
            this.template.header.logoPosition === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { after: 380 }
        }));
      } catch {
        console.error('Error adding company logo');
      }
    }

    // Title
    children.push(new Paragraph({
      children: [new TextRun({
        text: `${projectName} - Documentation`,
        bold: true,
        size: typography.fontSize.title * 2,
        font: typography.headingFont,
        color: hexToDocxColor(colors.primary)
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 }
    }));

    children.push(new Paragraph({
      children: [new TextRun({
        text: name,
        size: typography.fontSize.heading1 * 2,
        font: typography.headingFont,
        color: hexToDocxColor(colors.secondary)
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 }
    }));

    // Document metadata line — always show generated date on every template
    {
      const docInfoRuns: TextRun[] = [];
      if (this.template.header.includeDocId && customization.documentId) {
        docInfoRuns.push(new TextRun({
          text: `Document ID: ${customization.documentId}`,
          size: typography.fontSize.body * 2
        }));
      }
      if (this.template.header.includeRevision && customization.revision) {
        if (docInfoRuns.length > 0) docInfoRuns.push(new TextRun({ text: '  |  ' }));
        docInfoRuns.push(new TextRun({
          text: `Revision: ${customization.revision}`,
          size: typography.fontSize.body * 2
        }));
      }
      if (docInfoRuns.length > 0) docInfoRuns.push(new TextRun({ text: '  |  ' }));
      docInfoRuns.push(new TextRun({
        text: `${this.translations.generatedDate}: ${formatEuropeanDateTime(new Date())}`,
        size: typography.fontSize.body * 2
      }));

      children.push(new Paragraph({
        children: docInfoRuns,
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }));
    }

    // Purpose section for SOP template
    if (options.template.id === 'sop' && customization.customSections?.purpose) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: this.translations.purpose,
          bold: true,
          size: typography.fontSize.heading1 * 2,
          font: typography.headingFont,
          color: hexToDocxColor(colors.primary)
        })],
        spacing: { before: 240, after: 120 }
      }));
      children.push(...this.htmlToDocxParagraphs(customization.customSections.purpose, colors.text));
    }

    // Scope section for SOP template
    if (options.template.id === 'sop' && customization.customSections?.scope) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: this.translations.scope,
          bold: true,
          size: typography.fontSize.heading1 * 2,
          font: typography.headingFont,
          color: hexToDocxColor(colors.primary)
        })],
        spacing: { before: 240, after: 120 }
      }));
      children.push(...this.htmlToDocxParagraphs(customization.customSections.scope, colors.text));
    }

    // Learning Objectives for Training Manual template
    if (options.template.id === 'training-manual') {
      children.push(new Paragraph({
        children: [new TextRun({
          text: this.translations.learningObjectives,
          bold: true,
          size: typography.fontSize.heading1 * 2,
          font: typography.headingFont,
          color: hexToDocxColor(colors.primary)
        })],
        spacing: { before: 240, after: 120 }
      }));
      children.push(this.createCallout(
        `By completing this guide, you will understand the ${steps.length} steps required to complete this process.`,
        'checkpoint'
      ));
    }

    // Prerequisites section
    if (customization.customSections?.prerequisites) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: this.translations.prerequisites,
          bold: true,
          size: typography.fontSize.heading1 * 2,
          font: typography.headingFont,
          color: hexToDocxColor(colors.primary)
        })],
        spacing: { before: 240, after: 120 }
      }));
      children.push(...this.htmlToDocxParagraphs(customization.customSections.prerequisites, colors.text));
    }

    // Document Summary
    if (templateOptions.showDocumentSummary) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: this.translations.documentSummary,
          bold: true,
          size: typography.fontSize.heading2 * 2,
          font: typography.headingFont,
          color: hexToDocxColor(colors.primary)
        })],
        spacing: { before: 240, after: 120 }
      }));

      children.push(new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: this.translations.projectName, bold: true })]
                })],
                shading: { type: ShadingType.SOLID, color: hexToDocxColor(colors.headerBg) }
              }),
              new TableCell({ children: [new Paragraph({ text: projectName })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: this.translations.documentationTitle, bold: true })]
                })],
                shading: { type: ShadingType.SOLID, color: hexToDocxColor(colors.headerBg) }
              }),
              new TableCell({ children: [new Paragraph({ text: name })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: this.translations.totalSteps, bold: true })]
                })],
                shading: { type: ShadingType.SOLID, color: hexToDocxColor(colors.headerBg) }
              }),
              new TableCell({ children: [new Paragraph({ text: steps.length.toString() })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: this.translations.generatedDate, bold: true })]
                })],
                shading: { type: ShadingType.SOLID, color: hexToDocxColor(colors.headerBg) }
              }),
              new TableCell({ children: [new Paragraph({ text: formatEuropeanDateTime(new Date()) })] })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      }));

      children.push(new Paragraph({ text: '', spacing: { after: 480 } }));
    }

    // Procedure / Step-by-Step Guide header
    children.push(new Paragraph({
      children: [new TextRun({
        text: options.template.id === 'sop' ? this.translations.procedure : this.translations.stepByStepGuide,
        bold: true,
        size: typography.fontSize.heading1 * 2,
        font: typography.headingFont,
        color: hexToDocxColor(colors.primary)
      })],
      spacing: { before: 480, after: 240 }
    }));

    // Generate steps with intelligent page breaks
    // Rule: Every step after the first starts on a new page. Page break is
    // applied via the step title paragraph's `pageBreakBefore` property rather
    // than an empty PageBreak paragraph, which would render as a blank page
    // when the prior step's content ends near the page bottom.
    if (steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const stepContent = await this.generateStepContent(steps[i], i + 1, options, i > 0);
        children.push(...stepContent);

        // Add checkpoint for training manual every few steps
        if (options.template.id === 'training-manual' && templateOptions.showCheckpoints && (i + 1) % 3 === 0) {
          children.push(this.createCallout(
            `Verify you have successfully completed steps ${Math.max(1, i - 1)} through ${i + 1} before continuing.`,
            'checkpoint'
          ));
        }
      }
    } else {
      children.push(new Paragraph({
        text: 'No steps available for this documentation.',
        spacing: { after: 120 }
      }));
    }

    // Approval section for SOP template
    if (templateOptions.showApprovalSection) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({
        children: [new TextRun({
          text: this.translations.approvals,
          bold: true,
          size: typography.fontSize.heading1 * 2,
          font: typography.headingFont,
          color: hexToDocxColor(colors.primary)
        })],
        spacing: { before: 240, after: 240 }
      }));

      children.push(new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: this.translations.preparedBy, alignment: AlignmentType.CENTER })],
                shading: { type: ShadingType.SOLID, color: hexToDocxColor(colors.headerBg) }
              }),
              new TableCell({
                children: [new Paragraph({ text: this.translations.approvedBy, alignment: AlignmentType.CENTER })],
                shading: { type: ShadingType.SOLID, color: hexToDocxColor(colors.headerBg) }
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: '\n\n\n' })] }),
              new TableCell({ children: [new Paragraph({ text: '\n\n\n' })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: `${this.translations.name}: _________________` })] }),
              new TableCell({ children: [new Paragraph({ text: `${this.translations.name}: _________________` })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: `${this.translations.date}: _________________` })] }),
              new TableCell({ children: [new Paragraph({ text: `${this.translations.date}: _________________` })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: `${this.translations.signature}: _____________` })] }),
              new TableCell({ children: [new Paragraph({ text: `${this.translations.signature}: _____________` })] })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      }));
    }

    // Create document with template styles
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: typography.bodyFont,
              size: typography.fontSize.body * 2
            },
            paragraph: {
              indent: { left: 0, right: 0 }
            }
          },
          heading1: {
            run: {
              font: typography.headingFont,
              size: typography.fontSize.heading1 * 2,
              bold: true,
              color: hexToDocxColor(colors.primary)
            },
            paragraph: {
              indent: { left: 0, right: 0 }
            }
          },
          heading2: {
            run: {
              font: typography.headingFont,
              size: typography.fontSize.heading2 * 2,
              bold: true,
              color: hexToDocxColor(colors.primary)
            },
            paragraph: {
              indent: { left: 0, right: 0 }
            }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: mmToTwips(layout.margins.top),
              right: mmToTwips(layout.margins.right),
              bottom: mmToTwips(layout.margins.bottom),
              left: mmToTwips(layout.margins.left)
            },
            size: {
              orientation: layout.orientation === 'landscape' ? 'landscape' : 'portrait'
            }
          }
        },
        headers: {
          default: this.createHeader()
        },
        footers: {
          default: this.createFooter()
        },
        children
      }]
    });

    return await Packer.toBlob(doc);
  }
}

export const templateDocxExporter = new TemplateDocxExporter();
