import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, FileText, Eye, EyeOff } from 'lucide-react';
import { DocumentTemplate, TemplateCustomization } from '../../templates/types';
import { getDefaultCustomization, getTemplateCustomization } from '../../templates/registry';
import { TemplateSelector } from './TemplateSelector';
import { TemplatePreview } from './TemplatePreview';
import { TemplateCustomizer } from './TemplateCustomizer';
import { cn } from '../../lib/utils';

interface TemplatePanelProps {
  selectedTemplate: DocumentTemplate | null;
  customization: TemplateCustomization;
  onTemplateChange: (template: DocumentTemplate) => void;
  onCustomizationChange: (customization: TemplateCustomization) => void;
  onSaveSettings?: () => Promise<void>;
  className?: string;
  companyLogo?: string | null;
  /** When true, uses single-column layout and hides built-in preview (for sidebar use) */
  compact?: boolean;
}

export const TemplatePanel: React.FC<TemplatePanelProps> = ({
  selectedTemplate,
  customization,
  onTemplateChange,
  onCustomizationChange,
  onSaveSettings,
  className,
  companyLogo,
  compact = false
}) => {
  const { t } = useTranslation('templatePanel');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [activeTab, setActiveTab] = useState<'select' | 'customize'>('select');

  // Sync company logo from parent
  React.useEffect(() => {
    if (companyLogo !== undefined && companyLogo !== customization.companyLogo) {
      onCustomizationChange({ ...customization, companyLogo });
    }
  }, [companyLogo]);

  const handleTemplateSelect = useCallback(async (template: DocumentTemplate) => {
    onTemplateChange(template);

    // Try to load saved customization for this template
    const savedCustomization = await getTemplateCustomization(template.id);

    if (savedCustomization) {
      // Use saved customization, but update company logo from parent if provided
      onCustomizationChange({
        ...savedCustomization,
        companyLogo: companyLogo ?? savedCustomization.companyLogo
      });
    } else {
      // No saved customization, use defaults but keep company-specific info
      onCustomizationChange({
        ...getDefaultCustomization(),
        companyLogo: customization.companyLogo,
        companyName: customization.companyName,
        documentId: customization.documentId,
        revision: customization.revision
      });
    }
  }, [onTemplateChange, onCustomizationChange, customization, companyLogo]);

  return (
    <div className={cn(
      'overflow-hidden',
      compact ? 'bg-transparent' : 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700',
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-500" />
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t('panel.heading')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {selectedTemplate ? t(`templates.${selectedTemplate.id}.name`, { defaultValue: selectedTemplate.name }) : t('panel.selectPlaceholder')}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('select')}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'select'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/20'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {t('panel.tabSelect')}
            </button>
            <button
              onClick={() => setActiveTab('customize')}
              disabled={!selectedTemplate}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'customize'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/20'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                !selectedTemplate && 'opacity-50 cursor-not-allowed'
              )}
            >
              {t('panel.tabCustomize')}
            </button>
          </div>

          <div className="p-5">
            {activeTab === 'select' && (
              <div className="space-y-4">
                <TemplateSelector
                  selectedTemplateId={selectedTemplate?.id || null}
                  onSelectTemplate={handleTemplateSelect}
                />

                {/* Quick customize link */}
                {selectedTemplate && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t('panel.selected')} <span className="font-medium text-gray-900 dark:text-white">{t(`templates.${selectedTemplate.id}.name`, { defaultValue: selectedTemplate.name })}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab('customize')}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {t('panel.customizeLink')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'customize' && selectedTemplate && (
              <div className={compact ? '' : 'grid grid-cols-1 xl:grid-cols-3 gap-6'}>
                {/* Customization options */}
                <div className={compact ? '' : 'xl:col-span-2'}>
                  <TemplateCustomizer
                    template={selectedTemplate}
                    customization={customization}
                    onCustomizationChange={onCustomizationChange}
                    onSaveSettings={onSaveSettings}
                  />
                </div>

                {/* Preview — hidden in compact mode (parent provides its own preview) */}
                {!compact && (
                  <div className="hidden xl:block">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('customizer.preview.heading')}
                      </h4>
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {showPreview ? (
                          <>
                            <EyeOff className="w-3 h-3" />
                            {t('customizer.preview.hide')}
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" />
                            {t('customizer.preview.show')}
                          </>
                        )}
                      </button>
                    </div>

                    {showPreview && (
                      <div className="flex justify-center sticky top-4">
                        <TemplatePreview
                          template={selectedTemplate}
                          customization={customization}
                          scale={0.5}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplatePanel;
