import DOMPurify from 'dompurify';
import { DocumentTemplate, TemplateCustomization, AppliedTemplate } from '../templates/types';
import { applyCustomization, templateToCSSVariables } from '../templates/registry';
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
  mediaType?: 'image' | 'video';
  videoClipPath?: string;
  videoClipMimeType?: string;
  videoBase64?: string; // Populated during export for embedding
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
  renderVideoAsThumbnail?: boolean; // When true (PDF), render thumbnail image instead of <video> tag
}

// Translation map
const TRANSLATIONS = {
  EN: {
    overview: 'Overview',
    documentSummary: 'Document Summary',
    projectName: 'Project Name',
    documentationTitle: 'Documentation Title',
    totalSteps: 'Total Steps',
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
    revisionHistory: 'Revision History',
    learningObjectives: 'Learning Objectives',
    checkpoint: 'Checkpoint',
    tip: 'Tip',
    warning: 'Warning',
    note: 'Note',
    tableOfContents: 'Table of Contents',
    confidential: 'CONFIDENTIAL',
    internal: 'INTERNAL USE ONLY',
    public: 'PUBLIC',
    restricted: 'RESTRICTED'
  },
  DE: {
    overview: 'Übersicht',
    documentSummary: 'Dokumentzusammenfassung',
    projectName: 'Projektname',
    documentationTitle: 'Dokumentationstitel',
    totalSteps: 'Gesamtschritte',
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
    revisionHistory: 'Revisionshistorie',
    learningObjectives: 'Lernziele',
    checkpoint: 'Prüfpunkt',
    tip: 'Tipp',
    warning: 'Warnung',
    note: 'Hinweis',
    tableOfContents: 'Inhaltsverzeichnis',
    confidential: 'VERTRAULICH',
    internal: 'NUR FÜR INTERNEN GEBRAUCH',
    public: 'ÖFFENTLICH',
    restricted: 'EINGESCHRÄNKT'
  }
};

export class TemplateHtmlExporter {
  private template!: AppliedTemplate;
  private translations: typeof TRANSLATIONS['EN'] = TRANSLATIONS.EN;

  // Helper: escape HTML special characters
  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Strip HTML tags
  private stripHtmlTags(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  // Render description with HTML support
  private renderDescription(desc: string): string {
    if (!desc) return '';

    const normalized = normalizeDescription(desc);
    if (!normalized) return '';

    const hasHtmlTags = /<[^>]+>/.test(normalized);
    if (hasHtmlTags) {
      // Sanitize but preserve formatting
      const sanitized = DOMPurify.sanitize(normalized);
      return `<div class="step-description">${sanitized}</div>`;
    }

    // Plain text - convert to HTML
    const lines = normalized.split('\n');
    return `<p class="step-description-text">${this.escapeHtml(lines.join('\n'))}</p>`;
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

  // Get image size CSS - maintains aspect ratio (no distortion)
  private getImageSizeStyles(): string {
    const { stepLayout } = this.template;
    switch (stepLayout.imageSize) {
      case 'small': return 'max-width: 450px; width: auto; height: auto; max-height: 260px;';
      case 'medium': return 'max-width: 600px; width: auto; height: auto; max-height: 340px;';
      case 'large': return 'max-width: 750px; width: auto; height: auto; max-height: 420px;';
      case 'full-width': return 'max-width: 100%; width: auto; height: auto; max-height: 480px;';
      default: return 'max-width: 100%; width: auto; height: auto; max-height: 360px;';
    }
  }

  // Create callout HTML
  private createCallout(text: string, type: 'tip' | 'warning' | 'note' | 'checkpoint'): string {
    const { colors, stepLayout } = this.template;

    let bgColor: string;
    let borderColor: string;
    let icon: string;
    let label: string;

    switch (type) {
      case 'tip':
        bgColor = colors.info + '20';
        borderColor = colors.info;
        icon = '💡';
        label = this.translations.tip;
        break;
      case 'warning':
        bgColor = colors.warning + '20';
        borderColor = colors.warning;
        icon = '⚠️';
        label = this.translations.warning;
        break;
      case 'checkpoint':
        bgColor = colors.success + '20';
        borderColor = colors.success;
        icon = '✓';
        label = this.translations.checkpoint;
        break;
      case 'note':
      default:
        bgColor = colors.info + '20';
        borderColor = colors.info;
        icon = '📝';
        label = this.translations.note;
        break;
    }

    const calloutClass = stepLayout.calloutStyle === 'sidebar' ? 'callout-sidebar' :
      stepLayout.calloutStyle === 'banner' ? 'callout-banner' :
        stepLayout.calloutStyle === 'box' ? 'callout-box' : 'callout-inline';

    return `
      <div class="callout ${calloutClass}" style="
        background-color: ${bgColor};
        border-color: ${borderColor};
        ${stepLayout.calloutStyle === 'sidebar' ? `border-left: 4px solid ${borderColor};` : ''}
        ${stepLayout.calloutStyle === 'box' ? `border: 1px solid ${borderColor};` : ''}
      ">
        <span class="callout-icon">${icon}</span>
        <span class="callout-label">${label}:</span>
        <span class="callout-text">${this.escapeHtml(text)}</span>
      </div>
    `;
  }

  // Generate step HTML
  private generateStepHtml(
    step: ScreenshotData,
    index: number,
    options: TemplateExportOptions
  ): string {
    const { colors, typography, stepLayout } = this.template;
    const stepNumber = index + 1;

    const stepPrefix = stepLayout.showStepNumbers ?
      `${this.translations.step} ${this.formatStepNumber(index)}: ` : '';
    const cleanTitle = this.stripHtmlTags(step.title || step.description || `Action ${stepNumber}`);

    const isVideoStep = step.mediaType === 'video' && (step.videoBase64 || step.imageData);
    const hasImage = options.includeScreenshots && step.imageData && !isVideoStep;

    let mediaHtml = '';
    if (isVideoStep && options.includeScreenshots) {
      if (options.renderVideoAsThumbnail && step.imageData) {
        // PDF mode: render thumbnail image with video label (PDF viewers can't play video)
        mediaHtml = `<div class="step-image" style="text-align: center; margin: 16px 0; display: flex; flex-direction: column; align-items: center;">
          <img src="${step.imageData}" alt="Video: ${this.escapeHtml(cleanTitle)}"
               style="${this.getImageSizeStyles()} object-fit: contain; border-radius: 8px; border: 1px solid ${colors.border}; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: block; margin: 0 auto;" />
          <div style="margin-top: 8px; font-size: 11pt; color: ${colors.secondary};">&#9654; Video Step &mdash; view in HTML or PowerPoint format for playback</div>
        </div>`;
      } else if (step.videoBase64) {
        // HTML mode: embed actual video with playback controls
        const mimeType = step.videoClipMimeType || 'video/mp4';
        mediaHtml = `<div class="step-image" style="text-align: center; margin: 16px 0; display: flex; justify-content: center;">
          <video controls style="${this.getImageSizeStyles()} border-radius: 8px; border: 1px solid ${colors.border}; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: block; margin: 0 auto;">
            <source src="data:${mimeType};base64,${step.videoBase64}" type="${mimeType}" />
            Your browser does not support the video tag.
          </video>
        </div>`;
      }
    } else if (hasImage) {
      mediaHtml = `<div class="step-image" style="text-align: center; margin: 16px 0; display: flex; justify-content: center;">
        <img src="${step.imageData}" alt="${this.escapeHtml(cleanTitle)}"
             style="${this.getImageSizeStyles()} object-fit: contain; border-radius: 8px; border: 1px solid ${colors.border}; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: block; margin: 0 auto;" />
      </div>`;
    }
    const imageHtml = mediaHtml;

    const descriptionHtml = step.description && step.description !== step.title ?
      this.renderDescription(step.description) : '';

    // Determine if content is long (more than 300 characters or multiple paragraphs)
    const descriptionLength = this.stripHtmlTags(step.description || '').length;
    const hasLongContent = descriptionLength > 300 || (step.description || '').includes('</p><p>');

    const timestampHtml = step.timestamp ?
      (() => {
        const ts = typeof step.timestamp === 'number' ? step.timestamp : parseInt(step.timestamp as any);
        const ms = ts > 1000000000000 ? ts : ts * 1000;
        return `<div class="step-timestamp" style="font-size: ${typography.fontSize.caption}pt; color: ${colors.secondary}; margin-top: 8px; font-style: italic;">
          Captured: ${formatEuropeanDateTime(new Date(ms))}
        </div>`;
      })() : '';

    const borderStyle = stepLayout.borderStyle !== 'none' ?
      `border-bottom: 1px ${stepLayout.borderStyle} ${colors.border};` : '';

    const spacingClass = stepLayout.stepSpacing === 'compact' ? 'step-compact' :
      stepLayout.stepSpacing === 'spacious' ? 'step-spacious' : 'step-normal';

    // Build CSS classes for print layout optimization
    const stepClasses = [
      'step',
      spacingClass,
      hasImage ? 'has-image' : '',
      hasLongContent ? 'has-long-content' : ''
    ].filter(Boolean).join(' ');

    // Handle image position
    let contentHtml = '';
    switch (stepLayout.imagePosition) {
      case 'above':
        contentHtml = `${imageHtml}${descriptionHtml}`;
        break;
      case 'below':
        contentHtml = `${descriptionHtml}${imageHtml}`;
        break;
      case 'left':
        contentHtml = `
          <div style="display: flex; gap: 20px; align-items: flex-start;">
            <div style="flex-shrink: 0;">${imageHtml}</div>
            <div style="flex: 1;">${descriptionHtml}</div>
          </div>`;
        break;
      case 'right':
        contentHtml = `
          <div style="display: flex; gap: 20px; align-items: flex-start;">
            <div style="flex: 1;">${descriptionHtml}</div>
            <div style="flex-shrink: 0;">${imageHtml}</div>
          </div>`;
        break;
      default:
        contentHtml = `${descriptionHtml}${imageHtml}`;
    }

    return `
      <div class="${stepClasses}" style="${borderStyle}">
        <h3 class="step-title" style="
          color: ${colors.primary};
          font-family: ${typography.headingFont}, sans-serif;
          font-size: ${typography.fontSize.heading2}pt;
          margin: 0 0 12px 0;
        ">
          ${this.escapeHtml(stepPrefix + cleanTitle)}
        </h3>
        <div class="step-content">
          ${contentHtml}
          ${timestampHtml}
        </div>
      </div>
    `;
  }

  // Main export method
  async exportToHtml(exportData: ExportData, options: TemplateExportOptions): Promise<string> {
    const { name, projectName, screenshots, documentationSteps } = exportData;

    // Apply template and customization
    this.template = applyCustomization(options.template, options.customization);
    const { colors, typography, layout, header, footer, options: templateOptions } = this.template;
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
        timestamp: step.timestamp,
        mediaType: step.mediaType,
        videoClipPath: step.videoClipPath,
        videoClipMimeType: step.videoClipMimeType,
        videoBase64: step.videoBase64,
      }));
    }

    // Pre-process: load media data (video clips and screenshot images from file paths)
    if (window.electronAPI) {
      for (const step of steps) {
        if (step.mediaType === 'video' && step.videoClipPath) {
          try {
            if (options.renderVideoAsThumbnail) {
              // PDF mode: generate thumbnail instead of loading full video
              if (!step.imageData) {
                step.imageData = await window.electronAPI.generateVideoThumbnail(projectName, step.videoClipPath);
              }
            } else if (!step.videoBase64) {
              // HTML mode: load full video as base64 for playback
              let absPath: string | null = null;
              const isAbsolute = /^[a-zA-Z]:/.test(step.videoClipPath) || step.videoClipPath.startsWith('/');
              if (isAbsolute) {
                absPath = step.videoClipPath;
              } else {
                absPath = await window.electronAPI.getProjectFilePath(projectName, step.videoClipPath);
              }
              if (absPath) {
                // getFileUrl returns data:{mime};base64,{data} — extract just the base64 portion
                const dataUrl = await window.electronAPI.getFileUrl(absPath);
                if (dataUrl) {
                  const commaIdx = dataUrl.indexOf(',');
                  if (commaIdx !== -1) {
                    step.videoBase64 = dataUrl.substring(commaIdx + 1);
                    // Also extract the MIME type if not already set
                    if (!step.videoClipMimeType) {
                      const mimeMatch = dataUrl.match(/^data:([^;]+)/);
                      if (mimeMatch) step.videoClipMimeType = mimeMatch[1];
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to process video for step ${step.id}:`, err);
          }
        } else if (!step.imageData && step.filePath && step.filePath.startsWith('data:')) {
          // filePath is already a data URL (e.g., uploaded screenshot stored as base64) — promote to imageData
          step.imageData = step.filePath;
        } else if (!step.imageData && step.filePath && !step.filePath.startsWith('data:')) {
          // Load screenshot/diagram image data from file path
          try {
            // Strip cache buster query params (e.g., "diagrams/stepId.png?t=123" → "diagrams/stepId.png")
            const cleanFilePath = step.filePath.split('?')[0];
            const absPath = await window.electronAPI.getProjectFilePath(projectName, cleanFilePath);
            if (absPath) {
              const dataUrl = await window.electronAPI.getFileUrl(absPath);
              if (dataUrl) {
                step.imageData = dataUrl;
              }
            }
          } catch (err) {
            console.warn(`Failed to load screenshot for step ${step.id}:`, err);
          }
        }
      }

      if (!options.renderVideoAsThumbnail) {
        // Size warning for large embedded videos (only relevant for HTML mode)
        const totalVideoSize = steps.reduce((sum, s) => sum + (s.videoBase64?.length || 0), 0);
        if (totalVideoSize > 50 * 1024 * 1024) {
          console.warn('HTML export will be very large due to embedded video data (~' +
            Math.round(totalVideoSize / (1024 * 1024)) + 'MB of base64 video)');
        }
      }
    }

    // Get confidentiality text
    const confidentialityText = customization.confidentialityLevel === 'confidential' ? this.translations.confidential :
      customization.confidentialityLevel === 'restricted' ? this.translations.restricted :
        customization.confidentialityLevel === 'public' ? this.translations.public : this.translations.internal;

    // Generate CSS variables
    const cssVariables = templateToCSSVariables(this.template);

    // Generate steps HTML
    let stepsHtml = '';
    if (steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        stepsHtml += this.generateStepHtml(steps[i], i, options);

        // Add checkpoint for training manual
        if (options.template.id === 'training-manual' && templateOptions.showCheckpoints && (i + 1) % 3 === 0) {
          stepsHtml += this.createCallout(
            `Verify you have successfully completed steps ${Math.max(1, i - 1)} through ${i + 1} before continuing.`,
            'checkpoint'
          );
        }
      }
    }

    // Build the full HTML document
    return `
<!DOCTYPE html>
<html lang="${lang.toLowerCase()}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(name)} - ${this.escapeHtml(projectName)}</title>
  <style>
    ${cssVariables}

    * {
      box-sizing: border-box;
    }

    body {
      font-family: ${typography.bodyFont}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: ${typography.fontSize.body}pt;
      line-height: ${typography.lineSpacing};
      color: ${colors.text};
      background-color: ${colors.background};
      margin: 0;
      padding: 0;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: ${layout.margins.top}mm ${layout.margins.right}mm ${layout.margins.bottom}mm ${layout.margins.left}mm;
    }

    /* Header */
    .document-header {
      background-color: ${colors.headerBg};
      color: ${colors.headerText};
      padding: 16px 24px;
      margin: -${layout.margins.top}mm -${layout.margins.right}mm 24px -${layout.margins.left}mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .company-logo {
      max-width: 60px;
      max-height: 45px;
      object-fit: contain;
    }

    .company-name {
      font-weight: bold;
      font-size: ${typography.fontSize.heading3}pt;
    }

    .header-right {
      text-align: right;
      font-size: ${typography.fontSize.small}pt;
    }

    /* Title section */
    .title-section {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid ${colors.border};
    }

    .document-title {
      font-family: ${typography.headingFont}, sans-serif;
      font-size: ${typography.fontSize.title}pt;
      color: ${colors.primary};
      margin: 0 0 8px 0;
    }

    .document-subtitle {
      font-size: ${typography.fontSize.heading1}pt;
      color: ${colors.secondary};
      margin: 0 0 16px 0;
    }

    .document-meta {
      font-size: ${typography.fontSize.body}pt;
      color: ${colors.text};
    }

    /* Section headers */
    .section-header {
      font-family: ${typography.headingFont}, sans-serif;
      font-size: ${typography.fontSize.heading1}pt;
      color: ${colors.primary};
      margin: 32px 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid ${colors.border};
    }

    /* Summary table */
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 32px 0;
    }

    .summary-table th,
    .summary-table td {
      padding: 10px 16px;
      text-align: left;
      border: 1px solid ${colors.border};
    }

    .summary-table th {
      background-color: ${colors.headerBg}20;
      font-weight: bold;
      width: 40%;
    }

    /* Steps */
    .steps-container {
      margin-top: 24px;
    }

    .step {
      margin-bottom: 32px;
      padding-bottom: 24px;
    }

    .step-compact {
      margin-bottom: 16px;
      padding-bottom: 12px;
    }

    .step-spacious {
      margin-bottom: 48px;
      padding-bottom: 32px;
    }

    .step-title {
      font-weight: bold;
    }

    .step-content {
      margin-top: 12px;
      width: 100%;
    }

    .step-description {
      margin: 8px 0;
      line-height: 1.6;
    }

    .step-description-text {
      white-space: pre-line;
      margin: 8px 0;
    }

    .step-image {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .step-image img {
      display: block;
      margin: 0 auto;
      max-width: 100%;
    }

    .step-image video {
      display: block;
      margin: 0 auto;
      max-width: 100%;
    }

    /* Callouts */
    .callout {
      padding: 12px 16px;
      margin: 16px 0;
      border-radius: 4px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .callout-sidebar {
      background-color: transparent;
      padding-left: 16px;
    }

    .callout-box {
      border-radius: 8px;
    }

    .callout-banner {
      border-radius: 0;
      margin-left: -${layout.margins.left}mm;
      margin-right: -${layout.margins.right}mm;
      padding-left: ${layout.margins.left}mm;
      padding-right: ${layout.margins.right}mm;
    }

    .callout-icon {
      font-size: 1.2em;
    }

    .callout-label {
      font-weight: bold;
    }

    /* Approval section */
    .approval-section {
      margin-top: 48px;
      page-break-before: always;
    }

    .approval-table {
      width: 100%;
      border-collapse: collapse;
    }

    .approval-table td {
      padding: 16px;
      border: 1px solid ${colors.border};
      width: 50%;
      vertical-align: top;
    }

    .approval-table .signature-line {
      border-bottom: 1px solid ${colors.text};
      height: 60px;
      margin: 16px 0 8px 0;
    }

    /* Footer */
    .document-footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid ${colors.border};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: ${typography.fontSize.small}pt;
      color: ${colors.secondary};
    }

    /* Quill editor styles support */
    .ql-align-center { text-align: center; }
    .ql-align-right { text-align: right; }
    .ql-align-justify { text-align: justify; }
    .ql-size-small { font-size: 0.75em; }
    .ql-size-large { font-size: 1.5em; }
    .ql-size-huge { font-size: 2em; }

    /* Print styles - Enforce one step per page when step has image */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: none;
        margin: 0 auto;
        padding: ${layout.margins.top}mm ${layout.margins.right}mm ${layout.margins.bottom}mm ${layout.margins.left}mm;
      }

      /* Let steps flow naturally across pages.
         Previously page-break-inside: avoid caused blank-page gutters when
         a step exceeded one page height — the browser pushed the entire
         step to the next page, leaving the prior page mostly blank. */
      .step {
        orphans: 3;
        widows: 3;
      }

      /* Avoid orphaning the title or splitting descriptions on a single line */
      .step-description,
      .step-description-text {
        orphans: 3;
        widows: 3;
      }

      /* Keep step title bound to the next element (description or image) */
      .step h3,
      .step h2,
      .step-title {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      /* First step should NEVER have page break before - highest priority */
      .steps-container > .step:first-child,
      .steps-container > .step.has-image:first-child {
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      /* Force every step (except the first) onto a new page so titles never
         get orphaned from their content and images never end up on a separate
         page from their step text. */
      .step + .step {
        page-break-before: always !important;
        break-before: always !important;
      }

      /* Step content allowed to flow — only the image itself is atomic */
      .step-image {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        width: 100% !important;
        display: flex !important;
        justify-content: center !important;
        text-align: center !important;
      }

      .step-image img {
        display: block !important;
        margin-left: auto !important;
        margin-right: auto !important;
        max-width: 100% !important;
      }

      /* Keep callouts with their step */
      .callout {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Section headers should not break from content */
      .section-header {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      /* Keep document header elements together */
      .document-header,
      .title-section,
      .summary-table {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Approval section on its own page */
      .approval-section {
        page-break-before: always !important;
        break-before: always !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${header.show ? `
    <div class="document-header">
      <div class="header-left">
        ${customization.companyLogo ? `<img src="${customization.companyLogo}" alt="Company Logo" class="company-logo" />` : ''}
        ${customization.companyName ? `<span class="company-name">${this.escapeHtml(customization.companyName)}</span>` : ''}
      </div>
      <div class="header-right">
        ${header.includeDocId && customization.documentId ? `<div>${this.escapeHtml(customization.documentId)}</div>` : ''}
        ${header.includeRevision && customization.revision ? `<div>Rev ${this.escapeHtml(customization.revision)}</div>` : ''}
        ${header.includeDate ? `<div>${formatEuropeanDateTime(new Date())}</div>` : ''}
      </div>
    </div>
    ` : ''}

    <div class="title-section">
      <h1 class="document-title">${this.escapeHtml(projectName)} - Documentation</h1>
      <h2 class="document-subtitle">${this.escapeHtml(name)}</h2>
      <div class="document-meta">
        ${this.translations.generatedDate}: ${formatEuropeanDateTime(new Date())}
        ${customization.documentId ? ` | ${customization.documentId}` : ''}
        ${customization.revision ? ` | Rev ${customization.revision}` : ''}
      </div>
    </div>

    ${options.template.id === 'sop' && customization.customSections?.purpose ? `
    <h2 class="section-header">${this.translations.purpose}</h2>
    <div class="section-content">${customization.customSections.purpose}</div>
    ` : ''}

    ${options.template.id === 'sop' && customization.customSections?.scope ? `
    <h2 class="section-header">${this.translations.scope}</h2>
    <div class="section-content">${customization.customSections.scope}</div>
    ` : ''}

    ${options.template.id === 'training-manual' ? `
    <h2 class="section-header">${this.translations.learningObjectives}</h2>
    ${this.createCallout(`By completing this guide, you will understand the ${steps.length} steps required to complete this process.`, 'checkpoint')}
    ` : ''}

    ${customization.customSections?.prerequisites ? `
    <h2 class="section-header">${this.translations.prerequisites}</h2>
    <div class="section-content">${customization.customSections.prerequisites}</div>
    ` : ''}

    ${templateOptions.showDocumentSummary ? `
    <h2 class="section-header">${this.translations.documentSummary}</h2>
    <table class="summary-table">
      <tr>
        <th>${this.translations.projectName}</th>
        <td>${this.escapeHtml(projectName)}</td>
      </tr>
      <tr>
        <th>${this.translations.documentationTitle}</th>
        <td>${this.escapeHtml(name)}</td>
      </tr>
      <tr>
        <th>${this.translations.totalSteps}</th>
        <td>${steps.length}</td>
      </tr>
      <tr>
        <th>${this.translations.generatedDate}</th>
        <td>${formatEuropeanDateTime(new Date())}</td>
      </tr>
    </table>
    ` : ''}

    <h2 class="section-header">${options.template.id === 'sop' ? this.translations.procedure : this.translations.stepByStepGuide}</h2>
    <div class="steps-container">
      ${stepsHtml || '<p>No steps available for this documentation.</p>'}
    </div>

    ${templateOptions.showApprovalSection ? `
    <div class="approval-section">
      <h2 class="section-header">${this.translations.approvals}</h2>
      <table class="approval-table">
        <tr>
          <td>
            <strong>${this.translations.preparedBy}</strong>
            <div class="signature-line"></div>
            <div>${this.translations.name}: _________________</div>
            <div>${this.translations.date}: _________________</div>
          </td>
          <td>
            <strong>${this.translations.approvedBy}</strong>
            <div class="signature-line"></div>
            <div>${this.translations.name}: _________________</div>
            <div>${this.translations.date}: _________________</div>
          </td>
        </tr>
      </table>
    </div>
    ` : ''}

    ${footer.show ? `
    <div class="document-footer">
      <div>${footer.includeDocumentName ? this.escapeHtml(name) : ''}</div>
      <div>
        ${footer.includeConfidentiality ? confidentialityText : ''}
        ${footer.includeDate ? ` | ${formatEuropeanDateTime(new Date())}` : ''}
      </div>
    </div>
    ` : ''}
  </div>
</body>
</html>
    `.trim();
  }
}

export const templateHtmlExporter = new TemplateHtmlExporter();
