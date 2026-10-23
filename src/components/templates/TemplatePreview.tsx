import React, { useMemo } from 'react';
import { DocumentTemplate, TemplateCustomization } from '../../templates/types';
import { applyCustomization } from '../../templates/registry';
import { cn } from '../../lib/utils';

interface TemplatePreviewProps {
  template: DocumentTemplate;
  customization?: TemplateCustomization;
  sampleSteps?: Array<{
    title: string;
    description: string;
    hasImage: boolean;
  }>;
  className?: string;
  scale?: number;
}

// Default sample steps for preview
const defaultSampleSteps = [
  {
    title: 'Navigate to Settings',
    description: 'Click on the gear icon in the top-right corner to access the settings panel.',
    hasImage: true
  },
  {
    title: 'Configure Options',
    description: 'Select your preferred options from the dropdown menu and adjust the sliders.',
    hasImage: true
  },
  {
    title: 'Save Changes',
    description: 'Click the "Save" button to apply your changes.',
    hasImage: true
  }
];

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  customization,
  sampleSteps = defaultSampleSteps,
  className,
  scale = 0.4
}) => {
  // Apply customization to template
  const appliedTemplate = useMemo(() => {
    if (customization) {
      return applyCustomization(template, customization);
    }
    return template;
  }, [template, customization]);

  const { colors, typography, header, footer, stepLayout, options } = appliedTemplate;

  // Calculate preview dimensions (A4 aspect ratio)
  const previewWidth = 210 * scale;
  const previewHeight = 297 * scale;

  // Font sizes scaled down for preview
  const scaledFontSize = (size: number) => `${size * scale * 0.8}px`;

  return (
    <div className={cn('relative', className)}>
      {/* Preview container with shadow */}
      <div
        className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200"
        style={{
          width: `${previewWidth}mm`,
          height: `${previewHeight}mm`,
          fontFamily: typography.bodyFont
        }}
      >
        {/* Header */}
        {header.show && (
          <div
            className="flex items-center justify-between px-2 py-1"
            style={{
              backgroundColor: colors.headerBg,
              color: colors.headerText,
              fontSize: scaledFontSize(typography.fontSize.small)
            }}
          >
            <div className="flex items-center gap-1">
              {header.includeLogo && (
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: colors.accent }}
                />
              )}
              {customization?.companyName && (
                <span className="font-medium truncate" style={{ maxWidth: '40px' }}>
                  {customization.companyName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-right">
              {header.includeDocId && customization?.documentId && (
                <span className="opacity-80">{customization.documentId}</span>
              )}
              {header.includeRevision && (
                <span className="opacity-80">Rev {customization?.revision || '1.0'}</span>
              )}
            </div>
          </div>
        )}

        {/* Content area */}
        <div
          className="p-2 overflow-hidden"
          style={{
            backgroundColor: colors.background,
            color: colors.text
          }}
        >
          {/* Title */}
          <div
            className="font-bold text-center mb-2"
            style={{
              fontSize: scaledFontSize(typography.fontSize.title),
              fontFamily: typography.headingFont,
              color: colors.primary
            }}
          >
            Document Title
          </div>

          {/* Document Summary (if enabled) */}
          {options.showDocumentSummary && (
            <div
              className="mb-2 p-1 rounded"
              style={{
                backgroundColor: `${colors.secondary}15`,
                border: `1px solid ${colors.border}`,
                fontSize: scaledFontSize(typography.fontSize.small)
              }}
            >
              <div className="font-medium" style={{ color: colors.secondary }}>
                Summary
              </div>
              <div className="opacity-70">3 steps | Generated today</div>
            </div>
          )}

          {/* Section headers for specific templates */}
          {template.id === 'sop' && (
            <>
              <div
                className="font-semibold mb-1"
                style={{
                  fontSize: scaledFontSize(typography.fontSize.heading2),
                  color: colors.primary
                }}
              >
                Purpose
              </div>
              <div
                className="mb-2 opacity-60"
                style={{ fontSize: scaledFontSize(typography.fontSize.body) }}
              >
                Brief description of procedure purpose...
              </div>
              <div
                className="font-semibold mb-1"
                style={{
                  fontSize: scaledFontSize(typography.fontSize.heading2),
                  color: colors.primary
                }}
              >
                Procedure
              </div>
            </>
          )}

          {template.id === 'training-manual' && options.showCheckpoints && (
            <div
              className="mb-2 p-1 rounded flex items-center gap-1"
              style={{
                backgroundColor: `${colors.success}20`,
                border: `1px solid ${colors.success}`,
                fontSize: scaledFontSize(typography.fontSize.small)
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.success }}
              />
              <span style={{ color: colors.success }}>Learning Objectives</span>
            </div>
          )}

          {/* Steps preview */}
          <div className="space-y-2">
            {sampleSteps.slice(0, 2).map((step, index) => (
              <div
                key={index}
                className="rounded"
                style={{
                  border: stepLayout.borderStyle !== 'none'
                    ? `1px ${stepLayout.borderStyle} ${colors.border}`
                    : 'none',
                  padding: stepLayout.stepSpacing === 'compact' ? '2px' : '4px'
                }}
              >
                {/* Step header */}
                <div
                  className="flex items-center gap-1 mb-1"
                  style={{
                    fontSize: scaledFontSize(typography.fontSize.heading3),
                    fontFamily: typography.headingFont
                  }}
                >
                  {stepLayout.showStepNumbers && (
                    <span
                      className="font-bold"
                      style={{ color: colors.primary }}
                    >
                      {stepLayout.numberingStyle === 'decimal' && `${index + 1}.`}
                      {stepLayout.numberingStyle === 'roman' && ['I.', 'II.', 'III.'][index]}
                      {stepLayout.numberingStyle === 'alpha' && `${String.fromCharCode(65 + index)}.`}
                      {stepLayout.numberingStyle === 'bullet' && '•'}
                    </span>
                  )}
                  <span className="font-medium truncate">{step.title}</span>
                </div>

                {/* Step content based on image position */}
                <div
                  className={cn(
                    'flex gap-1',
                    stepLayout.imagePosition === 'left' && 'flex-row',
                    stepLayout.imagePosition === 'right' && 'flex-row-reverse',
                    (stepLayout.imagePosition === 'above' || stepLayout.imagePosition === 'below') && 'flex-col'
                  )}
                >
                  {/* Image placeholder */}
                  {step.hasImage && stepLayout.imagePosition !== 'inline' && (
                    <div
                      className={cn(
                        'rounded flex items-center justify-center',
                        stepLayout.imageSize === 'small' && 'w-8 h-6',
                        stepLayout.imageSize === 'medium' && 'w-12 h-8',
                        stepLayout.imageSize === 'large' && 'w-16 h-10',
                        stepLayout.imageSize === 'full-width' && 'w-full h-10',
                        (stepLayout.imagePosition === 'above' || stepLayout.imagePosition === 'below')
                          ? 'order-first'
                          : ''
                      )}
                      style={{
                        backgroundColor: `${colors.secondary}30`,
                        border: `1px dashed ${colors.border}`
                      }}
                    >
                      <span
                        className="opacity-50"
                        style={{ fontSize: scaledFontSize(typography.fontSize.small) }}
                      >
                        IMG
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  <div
                    className={cn(
                      'flex-1',
                      stepLayout.imagePosition === 'above' && 'order-last'
                    )}
                    style={{
                      fontSize: scaledFontSize(typography.fontSize.body),
                      lineHeight: typography.lineSpacing
                    }}
                  >
                    <p className="opacity-70 line-clamp-2">{step.description}</p>
                  </div>
                </div>

                {/* Callout example */}
                {stepLayout.calloutStyle !== 'none' && index === 0 && (
                  <div
                    className={cn(
                      'mt-1 rounded',
                      stepLayout.calloutStyle === 'box' && 'p-1',
                      stepLayout.calloutStyle === 'banner' && 'p-1',
                      stepLayout.calloutStyle === 'sidebar' && 'border-l-2 pl-1',
                      stepLayout.calloutStyle === 'inline' && ''
                    )}
                    style={{
                      backgroundColor: stepLayout.calloutStyle === 'box' || stepLayout.calloutStyle === 'banner'
                        ? `${colors.info}20`
                        : 'transparent',
                      borderColor: colors.info,
                      fontSize: scaledFontSize(typography.fontSize.small)
                    }}
                  >
                    <span style={{ color: colors.info }}>Tip: Sample callout</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Approval section for SOP */}
          {options.showApprovalSection && (
            <div
              className="mt-2 pt-1 border-t"
              style={{
                borderColor: colors.border,
                fontSize: scaledFontSize(typography.fontSize.small)
              }}
            >
              <div className="font-medium" style={{ color: colors.primary }}>
                Approvals
              </div>
              <div className="flex gap-2 mt-1">
                <div className="flex-1 p-1 border rounded" style={{ borderColor: colors.border }}>
                  <div className="opacity-50">Prepared by</div>
                </div>
                <div className="flex-1 p-1 border rounded" style={{ borderColor: colors.border }}>
                  <div className="opacity-50">Approved by</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {footer.show && (
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1"
            style={{
              backgroundColor: colors.background,
              borderTop: `1px solid ${colors.border}`,
              fontSize: scaledFontSize(typography.fontSize.small),
              color: colors.text
            }}
          >
            <div className="opacity-60">
              {footer.includeDocumentName && 'Document Name'}
            </div>
            <div className="flex items-center gap-2">
              {footer.includeConfidentiality && (
                <span className="opacity-40 text-xs">
                  {customization?.confidentialityLevel || 'Internal'}
                </span>
              )}
              {footer.includePageNumbers && (
                <span className="opacity-60">Page 1</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Template name badge */}
      <div
        className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 rounded-full text-xs font-medium shadow-sm"
        style={{
          backgroundColor: colors.primary,
          color: colors.headerText
        }}
      >
        {template.name}
      </div>
    </div>
  );
};

export default TemplatePreview;
