import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import {
  FileText,
  Download,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import type { DocumentTemplate, AppliedTemplate } from '../templates/types';

interface DocumentationStep {
  id: string;
  title: string;
  description: string;
  screenshot?: string;
  timestamp: number;
  mediaType?: 'image' | 'video';
  videoClipPath?: string;
  videoClipUrl?: string; // Resolved secure URL for video playback
  type?: string; // For diagram type identification
  diagramImagePath?: string; // Path to diagram image
  diagramUrl?: string; // Resolved secure URL for diagram display
  actions?: Array<{
    type: string;
    element: string;
    description: string;
    value?: string;
  }>;
}

interface DocumentationSection {
  id: string;
  title: string;
  description: string;
  steps: DocumentationStep[];
}

interface DocumentationData {
  title: string;
  description?: string;
  steps?: DocumentationStep[];
  sections?: DocumentationSection[];
  metadata?: {
    duration?: number;
    frameCount?: number;
    aiAnalysisScore?: number;
    totalSteps?: number;
  };
}

interface PreviewPanelProps {
  data: DocumentationData;
  format: 'pdf' | 'markdown' | 'html';
  template?: DocumentTemplate | null;
  onDownload?: (format: string) => void;
  onFormatChange?: (format: 'pdf' | 'markdown' | 'html') => void;
  className?: string;
}

// Helper to get image max width from template imageSize
const getImageMaxWidth = (imageSize?: string): string => {
  switch (imageSize) {
    case 'small': return '450px';
    case 'medium': return '600px';
    case 'large': return '750px';
    case 'full-width': return '100%';
    default: return '100%';
  }
};

// Helper to format step number based on numbering style
const formatStepNumber = (index: number, style?: string): string => {
  switch (style) {
    case 'roman': {
      const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
        'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
      return romanNumerals[index] || `${index + 1}`;
    }
    case 'alpha': return String.fromCharCode(65 + index);
    case 'bullet': return '\u2022';
    case 'none': return '';
    case 'decimal':
    default: return `${index + 1}`;
  }
};

// Helper to check if a string is a renderable image URL
const isImageUrl = (src?: string): boolean => {
  if (!src) return false;
  return src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http');
};

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  data,
  format,
  template,
  onDownload,
  onFormatChange,
  className
}) => {
  const { t } = useTranslation('editingPage');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showScreenshots, setShowScreenshots] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);

  const copyStepContent = async (step: DocumentationStep) => {
    const content = `${step.title}\n${step.description}`;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedStepId(step.id);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedStepId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  // Render a single step with template styling
  const renderStep = (step: DocumentationStep, index: number) => {
    const colors = template?.colors;
    const typo = template?.typography;
    const layout = template?.stepLayout;

    const stepNumber = layout?.showStepNumbers !== false
      ? formatStepNumber(index, layout?.numberingStyle)
      : '';

    const spacing = layout?.stepSpacing === 'compact' ? 'mb-3' : layout?.stepSpacing === 'spacious' ? 'mb-8' : 'mb-5';
    const borderClass = layout?.borderStyle === 'solid'
      ? 'border'
      : layout?.borderStyle === 'dashed'
        ? 'border border-dashed'
        : layout?.borderStyle === 'double'
          ? 'border-4 border-double'
          : '';

    const imageMaxWidth = getImageMaxWidth(layout?.imageSize);
    const imagePosition = layout?.imagePosition || 'below';

    // Build media element (image or video)
    const imageElement = (() => {
      if (!showScreenshots) return null;

      // Diagram step — render diagram image
      if (step.type === 'diagram' && step.diagramUrl && isImageUrl(step.diagramUrl)) {
        return (
          <div style={{ margin: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', width: '100%' }}>
            <img
              src={step.diagramUrl}
              alt={`Diagram ${index + 1}`}
              style={{
                maxWidth: 'min(672px, 100%)',
                maxHeight: '45vh',
                width: imageMaxWidth === '100%' ? '100%' : undefined,
                height: 'auto',
                objectFit: 'contain',
                border: `1px solid ${template?.colors?.border || '#e5e7eb'}`,
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                display: 'block'
              }}
              loading="lazy"
            />
          </div>
        );
      }

      // Video step — responsive to container
      if (step.mediaType === 'video' && step.videoClipUrl) {
        return (
          <div style={{ margin: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', width: '100%' }}>
            <video
              src={step.videoClipUrl}
              controls
              style={{
                maxWidth: 'min(672px, 100%)',
                maxHeight: '45vh',
                height: 'auto',
                borderRadius: 4,
                border: `1px solid ${template?.colors?.border || '#e5e7eb'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                display: 'block'
              }}
            />
          </div>
        );
      }

      // Image step (default) — styled to match PDF export, responsive to container
      if (step.screenshot && isImageUrl(step.screenshot)) {
        return (
          <div style={{ margin: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', width: '100%' }}>
            <img
              src={step.screenshot}
              alt={`Step ${index + 1}`}
              style={{
                maxWidth: 'min(672px, 100%)',
                maxHeight: '45vh',
                width: imageMaxWidth === '100%' ? '100%' : undefined,
                height: 'auto',
                objectFit: 'contain',
                border: `1px solid ${template?.colors?.border || '#e5e7eb'}`,
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                display: 'block'
              }}
              loading="lazy"
            />
          </div>
        );
      }

      return null;
    })();

    // Build description element — render HTML from rich text editor
    const descriptionElement = step.description ? (
      <div
        className="rich-text-content"
        style={{
          fontFamily: typo?.bodyFont || 'inherit',
          fontSize: typo?.fontSize?.body ? `${typo.fontSize.body}pt` : undefined,
          lineHeight: typo?.lineSpacing || 1.4,
          color: colors?.text || '#2c3e50'
        }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.description) }}
      />
    ) : null;

    // Render step content with image position
    const renderStepContent = () => {
      if (!imageElement) return descriptionElement;

      switch (imagePosition) {
        case 'above':
          return <>{imageElement}<div className="mt-3">{descriptionElement}</div></>;
        case 'left':
          return (
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-2/5">{imageElement}</div>
              <div className="flex-1">{descriptionElement}</div>
            </div>
          );
        case 'right':
          return (
            <div className="flex gap-4">
              <div className="flex-1">{descriptionElement}</div>
              <div className="flex-shrink-0 w-2/5">{imageElement}</div>
            </div>
          );
        case 'below':
        default:
          return <>{descriptionElement}<div className="mt-3">{imageElement}</div></>;
      }
    };

    return (
      <div
        key={step.id}
        className={cn("p-4 rounded-lg overflow-hidden", spacing, borderClass)}
        style={{
          borderColor: borderClass ? (colors?.border || '#e5e7eb') : undefined,
        }}
      >
        {/* Step title with number — centered to match PDF export */}
        {(stepNumber || step.title) && (
          <div className="mb-2 text-center" style={{ position: 'relative' }}>
            <span
              className="font-bold"
              style={{
                fontFamily: typo?.headingFont || 'inherit',
                fontSize: typo?.fontSize?.heading2 ? `${typo.fontSize.heading2}pt` : '12pt',
                color: colors?.primary || '#1e3a5f'
              }}
            >
              {stepNumber ? `Step ${stepNumber}` : ''}{stepNumber && step.title ? ': ' : ''}{step.title || ''}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); copyStepContent(step); }}
              className="p-0.5 opacity-0 hover:opacity-100 transition-opacity"
              style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
              title="Copy step"
            >
              {copiedStepId === step.id ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          </div>
        )}

        {renderStepContent()}
      </div>
    );
  };

  // Template-aware document preview — matches the PDF export layout (electron.js generateHTMLContent)
  const renderTemplatePreview = () => {
    const colors = template?.colors;
    const typo = template?.typography;
    const steps = data.steps || [];
    // Access customization from AppliedTemplate (set by applyCustomization in EditingPage)
    const customization = (template as AppliedTemplate | undefined)?.customization;

    return (
      <div
        className="shadow-lg rounded-lg overflow-hidden"
        style={{
          fontFamily: typo?.bodyFont || 'Arial, sans-serif',
          color: colors?.text || '#2c3e50',
          backgroundColor: colors?.background || '#ffffff'
        }}
      >
        {/* Document Header — centered layout matching PDF export */}
        {template?.header?.show !== false && (
          <div
            className="text-center px-8 pt-6 pb-4"
            style={{
              borderBottom: `1px solid ${colors?.border || '#e5e7eb'}`,
            }}
          >
            {/* Company Logo */}
            {customization?.companyLogo && (
              <img
                src={customization.companyLogo}
                alt="Company Logo"
                className="mx-auto mb-2"
                style={{ maxWidth: 80, maxHeight: 60, objectFit: 'contain' }}
              />
            )}
            {/* Company Name */}
            {customization?.companyName && (
              <p
                className="mb-2"
                style={{
                  fontFamily: typo?.bodyFont || 'Arial',
                  fontSize: typo?.fontSize?.body ? `${typo.fontSize.body}pt` : '12pt',
                  fontWeight: 'bold',
                  color: colors?.headerText || '#1f2937',
                  margin: '0 0 8px 0'
                }}
              >
                {customization.companyName}
              </p>
            )}
            {/* Document Title */}
            <h1
              className="font-bold"
              style={{
                fontFamily: typo?.headingFont || 'Arial',
                fontSize: typo?.fontSize?.title ? `${typo.fontSize.title}pt` : '16pt',
                color: colors?.primary || '#1e3a5f',
                margin: '0 0 3px 0'
              }}
            >
              {data.title}
            </h1>
            {/* Source */}
            {data.description && (
              <p style={{
                fontFamily: typo?.bodyFont || 'Arial',
                fontSize: typo?.fontSize?.caption ? `${typo.fontSize.caption}pt` : '10pt',
                color: colors?.secondary || '#4a6fa5',
                margin: 0
              }}>
                <strong>Source:</strong> {data.description.replace(/^Source:\s*/i, '')}
              </p>
            )}
            {/* Generated Date */}
            {template?.header?.includeDate !== false && (
              <p style={{
                fontSize: typo?.fontSize?.caption ? `${typo.fontSize.caption}pt` : '10pt',
                color: colors?.secondary || '#4a6fa5',
                margin: 0
              }}>
                Generated on {new Date().toLocaleDateString()}
              </p>
            )}
            {/* Document ID / Revision */}
            {customization?.documentId && (
              <p style={{
                fontSize: typo?.fontSize?.caption ? `${typo.fontSize.caption}pt` : '10pt',
                color: colors?.secondary || '#4a6fa5',
                margin: 0
              }}>
                Document ID: {customization.documentId}
                {customization.revision ? ` | Rev ${customization.revision}` : ''}
              </p>
            )}
          </div>
        )}

        {/* Document Summary (when enabled in template options) */}
        {template?.options?.showDocumentSummary && (
          <div
            className="mx-8 my-6 p-4 rounded-lg"
            style={{ background: `${colors?.headerBg || '#1e3a5f'}15`, textAlign: 'left' }}
          >
            <h2
              className="font-bold mb-3"
              style={{
                fontFamily: typo?.headingFont || 'Arial',
                fontSize: typo?.fontSize?.heading1 ? `${typo.fontSize.heading1}pt` : '14pt',
                color: colors?.primary || '#1e3a5f',
                margin: '0 0 12px 0'
              }}
            >
              Document Summary
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Project Name', data.title],
                  ['Total Steps', String(steps.length)],
                  ['Generated Date', new Date().toLocaleDateString()]
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{
                      padding: '8px',
                      border: `1px solid ${colors?.border || '#e5e7eb'}`,
                      fontWeight: 'bold',
                      background: `${colors?.headerBg || '#1e3a5f'}20`,
                      width: '40%'
                    }}>
                      {label}
                    </td>
                    <td style={{
                      padding: '8px',
                      border: `1px solid ${colors?.border || '#e5e7eb'}`
                    }}>
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Steps Section */}
        <div className="px-8 pb-8 pt-4">
          {steps.length > 0 && (
            <>
              {steps.map((step, index) => renderStep(step, index))}
            </>
          )}

          {steps.length === 0 && (
            <div className="text-center py-12" style={{ color: colors?.secondary || '#6b7280' }}>
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No steps yet. Add screenshots to see the preview.</p>
            </div>
          )}
        </div>

        {/* Approval Section (when enabled in template options) */}
        {template?.options?.showApprovalSection && (
          <div className="mx-8 mb-8 mt-4" style={{ textAlign: 'center' }}>
            <h2
              className="font-bold mb-4"
              style={{
                fontFamily: typo?.headingFont || 'Arial',
                fontSize: typo?.fontSize?.heading1 ? `${typo.fontSize.heading1}pt` : '14pt',
                color: colors?.primary || '#1e3a5f'
              }}
            >
              Approvals
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{
                    padding: 16,
                    border: `1px solid ${colors?.border || '#e5e7eb'}`,
                    width: '50%',
                    textAlign: 'center',
                    background: `${colors?.headerBg || '#1e3a5f'}15`
                  }}>
                    <strong>Prepared By</strong>
                    <div style={{
                      height: 40,
                      margin: '12px 0 6px 0',
                      borderBottom: `1px solid ${colors?.text || '#2c3e50'}`
                    }} />
                    <div>Name: _________________</div>
                    <div>Date: _________________</div>
                  </td>
                  <td style={{
                    padding: 16,
                    border: `1px solid ${colors?.border || '#e5e7eb'}`,
                    width: '50%',
                    textAlign: 'center',
                    background: `${colors?.headerBg || '#1e3a5f'}15`
                  }}>
                    <strong>Approved By</strong>
                    <div style={{
                      height: 40,
                      margin: '12px 0 6px 0',
                      borderBottom: `1px solid ${colors?.text || '#2c3e50'}`
                    }} />
                    <div>Name: _________________</div>
                    <div>Date: _________________</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Document Footer — matches PDF export */}
        {template?.footer?.show !== false && (
          <div
            className="px-6 py-2 text-center"
            style={{
              borderTop: `1px solid ${colors?.border || '#e5e7eb'}`,
              fontSize: '8pt',
              color: colors?.secondary || '#6b7280'
            }}
          >
            {template?.footer?.includeConfidentiality && (
              <span>{template.footer.confidentialityText || 'Internal Use Only'} | </span>
            )}
            <span>Generated by Docfai{template?.name ? ` using ${template.name} template` : ''}</span>
          </div>
        )}
      </div>
    );
  };

  // Fallback simple preview when no template is selected
  const renderSimplePreview = () => {
    const steps = data.steps || [];
    return (
      <div className="bg-white dark:bg-gray-900 p-8 shadow-lg rounded-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{data.title}</h1>
          {data.description && (
            <p className="text-gray-500 text-sm">{data.description}</p>
          )}
          <div className="w-16 h-0.5 bg-blue-500 mx-auto mt-3" />
        </div>

        <div className="space-y-5">
          {steps.map((step, index) => (
            <div key={step.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <p className="font-semibold text-gray-900 dark:text-white mb-2" style={{ fontSize: '12pt' }}>
                Step {index + 1}{step.title ? `: ${step.title}` : ''}
              </p>
              {step.description && (
                <div className="rich-text-content text-gray-700 dark:text-gray-300 mb-3" style={{ fontSize: '11pt' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.description) }} />
              )}
              {showScreenshots && step.type === 'diagram' && step.diagramUrl && isImageUrl(step.diagramUrl) && (
                <div className="rounded overflow-hidden">
                  <img src={step.diagramUrl} alt={`Diagram ${index + 1}`} className="max-w-2xl w-full h-auto object-contain mx-auto" loading="lazy" />
                </div>
              )}
              {showScreenshots && step.mediaType === 'video' && step.videoClipUrl && (
                <div className="rounded overflow-hidden">
                  <video src={step.videoClipUrl} controls className="max-w-2xl w-full h-auto mx-auto" />
                </div>
              )}
              {showScreenshots && step.type !== 'diagram' && step.mediaType !== 'video' && step.screenshot && isImageUrl(step.screenshot) && (
                <div className="rounded overflow-hidden">
                  <img src={step.screenshot} alt={`Step ${index + 1}`} className="max-w-2xl w-full h-auto object-contain mx-auto" loading="lazy" />
                </div>
              )}
            </div>
          ))}
        </div>

        {steps.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No steps yet. Add screenshots to see the preview.</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg shadow-lg", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <FileText className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('preview.heading')}
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          {onFormatChange && (
            <select
              value={format}
              onChange={(e) => onFormatChange(e.target.value as any)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="pdf">PDF Preview</option>
              <option value="markdown">Markdown Preview</option>
              <option value="html">HTML Preview</option>
            </select>
          )}

          <button
            onClick={() => setShowScreenshots(!showScreenshots)}
            className={cn(
              "p-2 rounded transition-colors",
              showScreenshots
                ? "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            )}
            title="Toggle Screenshots"
          >
            {showScreenshots ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onDownload && (
            <button
              onClick={() => onDownload(format)}
              className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={cn(
        "overflow-auto",
        isExpanded ? "h-screen" : "max-h-[70vh]"
      )}>
        <div className="p-4">
          {template ? renderTemplatePreview() : renderSimplePreview()}
        </div>
      </div>
    </div>
  );
};

export default PreviewPanel;
