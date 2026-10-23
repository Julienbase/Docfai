import { Document, Packer, Paragraph, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun, PageBreak, TextRun } from 'docx';
import DOMPurify from 'dompurify';
import { formatEuropeanDateTime } from './dateFormat';

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

interface ExportOptions {
  includeScreenshots: boolean;
  includeTimestamps: boolean;
  includeActions: boolean;
  theme: 'light' | 'dark' | 'auto';
  template: 'minimal' | 'detailed' | 'presentation';
  companyLogo?: string | null;
  translateTo?: 'none' | 'EN' | 'DE';
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
    step: 'Step'
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
    step: 'Schritt'
  }
};

export class DocxExporter {
  // Helper to convert HTML description to DOCX paragraphs
  // Helper method to strip HTML tags from text
  private stripHtmlTags(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  private htmlToDocxParagraphs(html: string): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // Check if content is HTML
    const hasHtmlTags = /<[^>]+>/.test(html);

    if (!hasHtmlTags) {
      // Plain text - return as simple paragraph
      return [new Paragraph({ text: html, spacing: { after: 120 } })];
    }

    // Simple HTML parser for common formatting
    // Remove HTML tags but preserve structure
    const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (tempDiv) {
      // Security: Sanitize HTML to prevent XSS attacks
      tempDiv.innerHTML = DOMPurify.sanitize(html);

      // Process each element
      const elements = Array.from(tempDiv.children);
      for (const element of elements) {
        const tagName = element.tagName.toLowerCase();
        const textContent = element.textContent || '';

        if (tagName === 'p') {
          // Paragraph
          const runs: TextRun[] = this.parseInlineFormatting(element);

          // Check for alignment classes from Quill editor
          let alignment: typeof AlignmentType[keyof typeof AlignmentType] | undefined;
          const classList = Array.from(element.classList);
          if (classList.includes('ql-align-center')) {
            alignment = AlignmentType.CENTER;
          } else if (classList.includes('ql-align-right')) {
            alignment = AlignmentType.RIGHT;
          } else if (classList.includes('ql-align-justify')) {
            alignment = AlignmentType.JUSTIFIED;
          } else if (classList.includes('ql-align-left')) {
            alignment = AlignmentType.LEFT;
          }

          paragraphs.push(new Paragraph({
            children: runs,
            spacing: { after: 120 },
            alignment
          }));
        } else if (tagName === 'ul' || tagName === 'ol') {
          // List
          const listItems = Array.from(element.querySelectorAll('li'));
          listItems.forEach((li, index) => {
            const bullet = tagName === 'ul' ? '• ' : `${index + 1}. `;
            // Parse formatting within list items
            const runs: TextRun[] = this.parseInlineFormatting(li);
            // Create bullet run and combine with other runs
            const bulletRun = new TextRun({ text: bullet });
            const allRuns = [bulletRun, ...runs];

            paragraphs.push(new Paragraph({
              children: allRuns,
              spacing: { after: 60 }
            }));
          });
        } else {
          // Fallback for other tags - try to parse formatting
          const runs: TextRun[] = this.parseInlineFormatting(element);
          paragraphs.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
        }
      }
    } else {
      // Server-side fallback: strip HTML tags
      const plainText = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      paragraphs.push(new Paragraph({ text: plainText, spacing: { after: 120 } }));
    }

    return paragraphs.length > 0 ? paragraphs : [new Paragraph({ text: html, spacing: { after: 120 } })];
  }

  // Helper to parse inline formatting (bold, italic, etc.)
  private parseInlineFormatting(element: Element): TextRun[] {
    const runs: TextRun[] = [];

    const processNode = (node: Node, formatting: { bold?: boolean; italics?: boolean; underline?: boolean } = {}) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          // Create a text run with the accumulated formatting
          runs.push(new TextRun({
            text,
            bold: formatting.bold,
            italics: formatting.italics,
            underline: formatting.underline ? {} : undefined
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        // Accumulate formatting from nested tags
        const newFormatting = { ...formatting };

        if (tagName === 'strong' || tagName === 'b') {
          newFormatting.bold = true;
        } else if (tagName === 'em' || tagName === 'i') {
          newFormatting.italics = true;
        } else if (tagName === 'u') {
          newFormatting.underline = true;
        } else if (tagName === 'br') {
          // Handle line breaks
          runs.push(new TextRun({ text: '\n', break: 1 }));
          return;
        }

        // Recursively process children with accumulated formatting
        Array.from(el.childNodes).forEach(child => processNode(child, newFormatting));
      }
    };

    Array.from(element.childNodes).forEach(child => processNode(child));
    return runs.length > 0 ? runs : [new TextRun({ text: element.textContent || '' })];
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    try {
      // Validate input
      if (!base64 || typeof base64 !== 'string') {
        throw new Error('Invalid base64 input: must be a non-empty string');
      }
      
      // Handle data URLs (data:image/png;base64,xxxxx)
      let base64Data: string;
      if (base64.startsWith('data:')) {
        const commaIndex = base64.indexOf(',');
        if (commaIndex === -1) {
          throw new Error('Invalid data URL format: missing comma separator');
        }
        base64Data = base64.substring(commaIndex + 1);
      } else {
        base64Data = base64;
      }
      
      // Clean and validate base64 string
      base64Data = base64Data.trim().replace(/\s/g, '');
      
      // Validate base64 characters
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(base64Data)) {
        throw new Error('Invalid base64 characters detected');
      }
      
      // Ensure proper padding
      const paddingNeeded = (4 - (base64Data.length % 4)) % 4;
      const paddedBase64 = base64Data + '='.repeat(paddingNeeded);
      
      const binaryString = window.atob(paddedBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return bytes.buffer;
    } catch (error) {
      console.error('[DocxExporter] Error converting base64 to buffer');
      throw new Error(`Invalid image data format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createImageFromData(imageData: string, width: number = 700, height: number = 447): Promise<ImageRun> {
    // Handle empty or undefined image data
    if (!imageData || imageData.trim() === '') {
      console.warn('Empty image data provided');
      return this.createPlaceholderImage();
    }

    try {
      if (imageData.startsWith('data:image')) {
        // Handle base64 data
        const imageBuffer = this.base64ToBuffer(imageData);
        return this.createImageRun(imageBuffer, width, height);
      } else {
        // Handle file path - use Electron APIs if available
        
        try {
          // Check if we're in Electron environment
          if (window.electronAPI) {
            let fileUrl: string;
            
            // Try getFileUrl first
            if (window.electronAPI.getFileUrl) {
              fileUrl = await window.electronAPI.getFileUrl(imageData);
            } else {
              // Fallback to getProjectFilePath for project files
              const pathParts = imageData.split(/[/\\]/);
              const fileName = pathParts.pop();
              
              if (fileName) {
                let projectName = '';
                const projectIndex = pathParts.findIndex(part => part === 'projects');
                if (projectIndex !== -1 && projectIndex + 1 < pathParts.length) {
                  projectName = pathParts[projectIndex + 1];
                }
                
                let fileType: 'screenshots' | 'recordings' | 'diagrams' = 'screenshots';
                if (imageData.includes('recordings')) {
                  fileType = 'recordings';
                } else if (imageData.includes('diagrams')) {
                  fileType = 'diagrams';
                }
                
                if (window.electronAPI.getProjectFilePath) {
                  // Construct the correct relative path based on file type
                  let relativePath: string;
                  if (fileType === 'recordings') {
                    relativePath = `recordings/${fileName}`;
                  } else if (fileType === 'screenshots') {
                    relativePath = `screenshots/${fileName}`;
                  } else if (fileType === 'diagrams') {
                    relativePath = `diagrams/${fileName}`;
                  } else {
                    relativePath = fileName;
                  }
                  
                  fileUrl = await window.electronAPI.getProjectFilePath(projectName, relativePath);
                } else {
                  throw new Error('No Electron file access methods available');
                }
              } else {
                throw new Error('Invalid file path format');
              }
            }
            
            const response = await fetch(fileUrl);
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.status}`);
            }
            const imageBuffer = await response.arrayBuffer();
            return this.createImageRun(imageBuffer);
          } else {
            // Fallback to regular fetch for web environment
            const response = await fetch(imageData);
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.status}`);
            }
            const imageBuffer = await response.arrayBuffer();
            return this.createImageRun(imageBuffer);
          }
        } catch (fetchError) {
          console.error('Failed to load image from source');
          return this.createPlaceholderImage();
        }
      }
    } catch (error) {
      console.error('Error creating image for DOCX export');
      return this.createPlaceholderImage();
    }
  }

  private createImageRun(imageBuffer: ArrayBuffer, width: number = 700, height: number = 447): ImageRun {
    return new ImageRun({
      data: imageBuffer,
      transformation: {
        width,
        height,
      },
    });
  }

  private createPlaceholderImage(): ImageRun {
    // 1x1 transparent PNG in base64
    const placeholderBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const placeholderBuffer = this.base64ToBuffer('data:image/png;base64,' + placeholderBase64);
    return new ImageRun({
      data: placeholderBuffer,
      transformation: {
        width: 700,
        height: 447,
      },
    });
  }

  async exportToDocx(exportData: ExportData, options: ExportOptions): Promise<Blob> {
    const { name, projectName, screenshots, isInteractiveScreenshots, documentationSteps } = exportData;

    // Determine the steps to export
    let steps: ScreenshotData[] = [];

    // Always use the screenshots array as it contains the processed data with base64 images
    // ExportPage already processes documentationSteps and adds them to the screenshots array
    if (screenshots && screenshots.length > 0) {
      steps = screenshots;
    } else if (documentationSteps) {
      // Fallback to documentationSteps only if screenshots array is empty
      steps = documentationSteps.map((step, index) => ({
        id: step.id || `step-${index + 1}`,
        imageData: step.imageData,
        filePath: step.type === 'diagram' ? step.diagramImagePath : (step.filePath || (step as any).screenshot),
        description: step.description,
        title: step.title,
        actionType: step.actionType,
        timestamp: step.timestamp || (step as any).rotamp
      }));
    }

    try {
      // Get translations based on target language
      const lang = options.translateTo && options.translateTo !== 'none' ? options.translateTo : 'EN';
      const t = TRANSLATIONS[lang];

      const children: any[] = [];

      // Add company logo if provided
      if (options.companyLogo) {
        try {
          const logoImage = await this.createImageFromData(options.companyLogo, 80, 80);
          children.push(
            new Paragraph({
              children: [logoImage],
              alignment: AlignmentType.LEFT,
              spacing: { after: 380 },
            })
          );
        } catch (error) {
          console.error('Error adding company logo to DOCX');
        }
      }

      // Title Page - Combined with Overview
      children.push(
        new Paragraph({
          text: `${projectName} - Documentation`,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        }),
        new Paragraph({
          text: name,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
        }),
        new Paragraph({
          text: `${t.generatedDate}: ${formatEuropeanDateTime(new Date())}`,
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
        }),
        new Paragraph({
          text: t.overview,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 240 },
        }),
        new Paragraph({
          text: lang === 'DE'
            ? `Dieses Dokument bietet eine umfassende Schritt-für-Schritt-Anleitung für ${name}. Die Anleitung enthält ${steps.length} detaillierte Schritte, um Benutzern zu helfen, den Prozess zu verstehen.`
            : `This document provides a comprehensive step-by-step guide for ${name}. The guide includes ${steps.length} detailed steps to help users understand the process.`,
          spacing: { after: 240 },
        })
      );

      // Add document details table
      if (steps.length > 0) {
        children.push(
          new Paragraph({
            text: t.documentSummary,
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 120 },
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: t.projectName })] }),
                  new TableCell({ children: [new Paragraph({ text: projectName })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: t.documentationTitle })] }),
                  new TableCell({ children: [new Paragraph({ text: name })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: t.totalSteps })] }),
                  new TableCell({ children: [new Paragraph({ text: steps.length.toString() })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: t.generatedDate })] }),
                  new TableCell({ children: [new Paragraph({ text: formatEuropeanDateTime(new Date()) })] }),
                ],
              }),
            ],
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
          new Paragraph({
            text: '',
            spacing: { after: 800 },
          })
        );
      }

      // Add step-by-step guide
      if (steps.length > 0) {
        children.push(
          new Paragraph({
            text: t.stepByStepGuide,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 },
          })
        );

        // Handle first page: only first step
        if (steps.length > 0) {
          const firstStepContent = await this.generateSingleStepContent(steps[0], 1, options);
          children.push(...firstStepContent);
          
          // Add page break after first step
          children.push(
            new Paragraph({
              children: [new PageBreak()],
            })
          );
        }

        // Handle remaining steps in groups of 2 per page
        const remainingSteps = steps.slice(1);
        for (let i = 0; i < remainingSteps.length; i += 2) {
          const stepsInPage = remainingSteps.slice(i, i + 2);
          
          for (let j = 0; j < stepsInPage.length; j++) {
            const stepIndex = i + j + 1; // +1 because we skipped the first step
            const stepContent = await this.generateSingleStepContent(stepsInPage[j], stepIndex + 1, options);
            children.push(...stepContent);
          }
          
          // Add page break after every 2 steps, except for the last group
          if (i + 2 < remainingSteps.length) {
            children.push(
              new Paragraph({
                children: [new PageBreak()],
              })
            );
          }
        }
      } else {
        children.push(
          new Paragraph({
            text: 'No steps available for this documentation.',
            spacing: { after: 120 },
          })
        );
      }

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: 'Calibri',
              },
            },
            heading1: {
              run: {
                font: 'Calibri',
              },
            },
            heading2: {
              run: {
                font: 'Calibri',
              },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              margin: {
                top: 720,
                right: 720,
                bottom: 720,
                left: 720,
              },
            },
          },
          children,
        }],
      });

      // Use toBlob() for browser compatibility instead of toBuffer()
      return await Packer.toBlob(doc);
    } catch (error) {
      console.error('Error generating DOCX document');
      throw new Error(`Failed to generate DOCX document: ${error.message}`);
    }
  }

  private async generateSingleStepContent(step: ScreenshotData, stepNumber: number, options: ExportOptions): Promise<Paragraph[]> {
    const paragraphs: Paragraph[] = [];

    // Get translation for "Step"
    const lang = options.translateTo && options.translateTo !== 'none' ? options.translateTo : 'EN';
    const t = TRANSLATIONS[lang];

    // Step header - strip HTML tags from title
    const cleanTitle = this.stripHtmlTags(step.title || step.description || `Action ${stepNumber}`);
    paragraphs.push(
      new Paragraph({
        text: `${t.step} ${stepNumber}: ${cleanTitle}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      })
    );

    // Action type and timestamps removed from Word document generation

    // Only add description if it exists and is different from the title
    if (step.description && step.description !== step.title) {
      // Convert HTML description to DOCX paragraphs preserving formatting
      const descriptionParagraphs = this.htmlToDocxParagraphs(step.description);
      paragraphs.push(...descriptionParagraphs);
    }

    // Screenshot
    if (options.includeScreenshots) {
      const imageSource = step.imageData || step.filePath;
      if (imageSource) {
        try {
          const imageRun = await this.createImageFromData(imageSource);
          paragraphs.push(
            new Paragraph({
              children: [imageRun],
              alignment: AlignmentType.CENTER,
              spacing: { after: 240 },
            }),
            new Paragraph({
              text: '',
              spacing: { after: 240 },
            })
          );
        } catch (error) {
          console.error('Error adding image to DOCX');
          paragraphs.push(
            new Paragraph({
              text: '[Screenshot not available]',
              alignment: AlignmentType.CENTER,
              spacing: { after: 240 },
            })
          );
        }
      }
    }

    return paragraphs;
  }

  private async generateStepsContent(steps: ScreenshotData[], options: ExportOptions): Promise<Paragraph[]> {
    const paragraphs: Paragraph[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNumber = i + 1;

      // Get translation for "Step"
      const lang = options.translateTo && options.translateTo !== 'none' ? options.translateTo : 'EN';
      const t = TRANSLATIONS[lang];

      // Step header
      paragraphs.push(
        new Paragraph({
          text: `${t.step} ${stepNumber}: ${step.title || step.description || `Action ${stepNumber}`}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        })
      );

      // Step details container
      const stepDetails: Paragraph[] = [];

      if (options.includeActions && step.actionType) {
        stepDetails.push(
          new Paragraph({
            text: `Action Type: ${step.actionType}`,
            spacing: { after: 120 },
          })
        );
      }

      if (step.timestamp) {
        const timestamp = typeof step.timestamp === 'number' ? step.timestamp : parseInt(step.timestamp as any);
        const ms = timestamp > 1000000000000 ? timestamp : timestamp * 1000;

        stepDetails.push(
          new Paragraph({
            text: `Captured: ${formatEuropeanDateTime(new Date(ms))}`,
            spacing: { after: 120 },
          })
        );
      }

      if (step.description) {
        stepDetails.push(
          new Paragraph({
            text: step.description,
            spacing: { after: 120 },
          })
        );
      }

      // Screenshot
      if (options.includeScreenshots) {
        const imageSource = step.imageData || step.filePath;
        if (imageSource) {
          try {
            const imageRun = await this.createImageFromData(imageSource);
            stepDetails.push(
              new Paragraph({
                children: [imageRun],
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
              }),
              new Paragraph({
                text: '',
                spacing: { after: 800 },
              })
            );
          } catch (error) {
            console.error('Error adding image to DOCX');
            stepDetails.push(
              new Paragraph({
                text: '[Screenshot not available]',
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
              })
            );
          }
        }
      }

      // Add all step details to paragraphs
      paragraphs.push(...stepDetails);

      // Add spacing between steps
      if (i < steps.length - 1) {
        paragraphs.push(
          new Paragraph({
            text: '',
            spacing: { after: 120 },
          })
        );
      }
    }

    return paragraphs;
  }
}

export const docxExporter = new DocxExporter();