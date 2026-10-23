import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Palette,
  Type,
  Image,
  Building2,
  FileText,
  Shield,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save,
  Check
} from 'lucide-react';
import { DocumentTemplate, TemplateCustomization, TemplateColors } from '../../templates/types';
import { colorSchemes, fontCombinations, isValidHexColor } from '../../templates/registry';
import { cn } from '../../lib/utils';

interface TemplateCustomizerProps {
  template: DocumentTemplate;
  customization: TemplateCustomization;
  onCustomizationChange: (customization: TemplateCustomization) => void;
  onSaveSettings?: () => Promise<void>;
  className?: string;
}

type CollapsibleSection = 'colors' | 'typography' | 'branding' | 'document' | null;

export const TemplateCustomizer: React.FC<TemplateCustomizerProps> = ({
  template,
  customization,
  onCustomizationChange,
  onSaveSettings,
  className
}) => {
  const { t } = useTranslation('templatePanel');
  const [expandedSection, setExpandedSection] = useState<CollapsibleSection>('colors');
  const [customColorInput, setCustomColorInput] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Handle save settings
  const handleSaveSettings = useCallback(async () => {
    if (!onSaveSettings) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await onSaveSettings();
      setSaveSuccess(true);
      // Reset success state after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  }, [onSaveSettings]);

  // Toggle section expansion
  const toggleSection = useCallback((section: CollapsibleSection) => {
    setExpandedSection(prev => prev === section ? null : section);
  }, []);

  // Update customization
  const updateCustomization = useCallback((updates: Partial<TemplateCustomization>) => {
    onCustomizationChange({ ...customization, ...updates });
  }, [customization, onCustomizationChange]);

  // Update a specific color
  const updateColor = useCallback((colorKey: keyof TemplateColors, value: string) => {
    if (!isValidHexColor(value) && value !== '') return;

    const newColors = {
      ...(customization.colors || {}),
      [colorKey]: value || undefined
    };

    // Remove undefined values
    Object.keys(newColors).forEach(key => {
      if (newColors[key as keyof TemplateColors] === undefined) {
        delete newColors[key as keyof TemplateColors];
      }
    });

    updateCustomization({
      colors: Object.keys(newColors).length > 0 ? newColors : undefined
    });
  }, [customization.colors, updateCustomization]);

  // Apply a color scheme preset
  const applyColorScheme = useCallback((schemeId: string) => {
    const scheme = colorSchemes[schemeId];
    if (scheme) {
      updateCustomization({ colors: scheme as Partial<TemplateColors> });
    }
  }, [updateCustomization]);

  // Apply a font combination
  const applyFontCombination = useCallback((comboId: string) => {
    const combo = fontCombinations[comboId];
    if (combo) {
      updateCustomization({
        typography: {
          ...(customization.typography || {}),
          ...combo
        }
      });
    }
  }, [customization.typography, updateCustomization]);

  // Reset customization
  const resetCustomization = useCallback(() => {
    onCustomizationChange({
      colors: undefined,
      typography: undefined,
      companyLogo: customization.companyLogo, // Keep logo
      companyName: customization.companyName, // Keep company name
      documentId: customization.documentId,
      revision: customization.revision,
      confidentialityLevel: customization.confidentialityLevel
    });
    setCustomColorInput({});
  }, [customization, onCustomizationChange]);

  // Handle logo upload
  const handleLogoUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      updateCustomization({ companyLogo: result });
    };
    reader.readAsDataURL(file);
  }, [updateCustomization]);

  // Get current color value (custom or from template)
  const getColorValue = useCallback((colorKey: keyof TemplateColors): string => {
    return customization.colors?.[colorKey] || template.colors[colorKey];
  }, [customization.colors, template.colors]);

  // Section header component
  const SectionHeader: React.FC<{
    section: CollapsibleSection;
    icon: React.ReactNode;
    title: string;
  }> = ({ section, icon, title }) => (
    <button
      onClick={() => toggleSection(section)}
      className={cn(
        'w-full flex items-center justify-between p-3 rounded-lg transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        expandedSection === section
          ? 'bg-gray-100 dark:bg-gray-700'
          : 'bg-white dark:bg-gray-800'
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
          {title}
        </span>
      </div>
      {expandedSection === section ? (
        <ChevronUp className="w-4 h-4 text-gray-500" />
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-500" />
      )}
    </button>
  );

  // Render a color input field - using a stable reference to avoid re-renders
  const renderColorInput = (label: string, colorKey: keyof TemplateColors) => {
    const value = getColorValue(colorKey);
    const inputValue = customColorInput[colorKey] ?? value;

    return (
      <div className="flex items-center gap-2" key={colorKey}>
        <input
          type="color"
          defaultValue={value}
          key={`color-${colorKey}-${value}`}
          onBlur={(e) => {
            // Only update when the picker closes (blur event)
            const newValue = e.target.value;
            if (newValue !== value) {
              updateColor(colorKey, newValue);
              setCustomColorInput(prev => ({ ...prev, [colorKey]: newValue }));
            }
          }}
          onChange={(e) => {
            // Update local state for text input sync, but don't trigger parent update
            setCustomColorInput(prev => ({ ...prev, [colorKey]: e.target.value }));
          }}
          className="w-8 h-8 rounded cursor-pointer border border-gray-300 color-picker-input"
          style={{ WebkitAppearance: 'none', padding: 0 }}
        />
        <div className="flex-1">
          <label className="text-xs text-gray-600 dark:text-gray-400">{label}</label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              const val = e.target.value;
              setCustomColorInput(prev => ({ ...prev, [colorKey]: val }));
              if (isValidHexColor(val)) {
                updateColor(colorKey, val);
              }
            }}
            onBlur={(e) => {
              // On blur, if valid color, commit it
              const val = e.target.value;
              if (isValidHexColor(val)) {
                updateColor(colorKey, val);
              }
            }}
            placeholder="#000000"
            className={cn(
              'w-full text-xs px-2 py-1 rounded border',
              'bg-white dark:bg-gray-800',
              'border-gray-300 dark:border-gray-600',
              'focus:outline-none focus:ring-1 focus:ring-blue-500'
            )}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header with save and reset buttons */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('customizer.heading')}
        </h3>
        <div className="flex items-center gap-2">
          {onSaveSettings && (
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className={cn(
                'flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors',
                saveSuccess
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50',
                isSaving && 'opacity-50 cursor-not-allowed'
              )}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3 h-3" />
                  {t('customizer.saved')}
                </>
              ) : isSaving ? (
                <>
                  <Save className="w-3 h-3 animate-pulse" />
                  {t('customizer.saving')}
                </>
              ) : (
                <>
                  <Save className="w-3 h-3" />
                  {t('customizer.save')}
                </>
              )}
            </button>
          )}
          <button
            onClick={resetCustomization}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <RotateCcw className="w-3 h-3" />
            {t('customizer.reset')}
          </button>
        </div>
      </div>

      {/* Color Scheme Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <SectionHeader
          section="colors"
          icon={<Palette className="w-4 h-4 text-blue-500" />}
          title={t('customizer.sections.colors')}
        />

        {expandedSection === 'colors' && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            {/* Preset color schemes */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                {t('customizer.colors.presets')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(colorSchemes).map(([id, scheme]) => (
                  <button
                    key={id}
                    onClick={() => applyColorScheme(id)}
                    className={cn(
                      'flex flex-col items-center p-2 rounded-lg border transition-all',
                      'hover:border-blue-400 hover:shadow-sm',
                      'border-gray-200 dark:border-gray-600'
                    )}
                    title={id.charAt(0).toUpperCase() + id.slice(1)}
                  >
                    <div className="flex gap-0.5 mb-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: scheme.primary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: scheme.secondary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: scheme.accent }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-600 dark:text-gray-400 capitalize">
                      {id}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Individual color pickers */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                {t('customizer.colors.custom')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {renderColorInput(t('customizer.colors.primary'), "primary")}
                {renderColorInput(t('customizer.colors.secondary'), "secondary")}
                {renderColorInput(t('customizer.colors.accent'), "accent")}
                {renderColorInput(t('customizer.colors.text'), "text")}
                {renderColorInput(t('customizer.colors.headerBg'), "headerBg")}
                {renderColorInput(t('customizer.colors.headerText'), "headerText")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Typography Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <SectionHeader
          section="typography"
          icon={<Type className="w-4 h-4 text-purple-500" />}
          title={t('customizer.sections.typography')}
        />

        {expandedSection === 'typography' && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            {/* Font combinations */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                {t('customizer.typography.combinations')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(fontCombinations).map(([id, combo]) => (
                  <button
                    key={id}
                    onClick={() => applyFontCombination(id)}
                    className={cn(
                      'p-2 rounded-lg border text-left transition-all',
                      'hover:border-blue-400 hover:shadow-sm',
                      'border-gray-200 dark:border-gray-600'
                    )}
                  >
                    <div
                      className="text-sm font-medium truncate"
                      style={{ fontFamily: combo.headingFont }}
                    >
                      {id.charAt(0).toUpperCase() + id.slice(1)}
                    </div>
                    <div
                      className="text-xs text-gray-500 truncate"
                      style={{ fontFamily: combo.bodyFont }}
                    >
                      {combo.headingFont} / {combo.bodyFont}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom font selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                  {t('customizer.typography.headingFont')}
                </label>
                <select
                  value={customization.typography?.headingFont || template.typography.headingFont}
                  onChange={(e) => updateCustomization({
                    typography: {
                      ...(customization.typography || {}),
                      headingFont: e.target.value
                    }
                  })}
                  className={cn(
                    'w-full text-sm px-2 py-1.5 rounded border',
                    'bg-white dark:bg-gray-800',
                    'border-gray-300 dark:border-gray-600'
                  )}
                >
                  <option value="Arial">Arial</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Segoe UI">Segoe UI</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Consolas">Consolas</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                  {t('customizer.typography.bodyFont')}
                </label>
                <select
                  value={customization.typography?.bodyFont || template.typography.bodyFont}
                  onChange={(e) => updateCustomization({
                    typography: {
                      ...(customization.typography || {}),
                      bodyFont: e.target.value
                    }
                  })}
                  className={cn(
                    'w-full text-sm px-2 py-1.5 rounded border',
                    'bg-white dark:bg-gray-800',
                    'border-gray-300 dark:border-gray-600'
                  )}
                >
                  <option value="Arial">Arial</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Segoe UI">Segoe UI</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Consolas">Consolas</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Branding Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <SectionHeader
          section="branding"
          icon={<Building2 className="w-4 h-4 text-green-500" />}
          title={t('customizer.sections.branding')}
        />

        {expandedSection === 'branding' && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            {/* Company logo */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                {t('customizer.branding.logo')}
              </label>
              <div className="flex items-center gap-3">
                {customization.companyLogo ? (
                  <div className="relative">
                    <img
                      src={customization.companyLogo}
                      alt="Company logo"
                      className="w-12 h-12 object-contain rounded border border-gray-200"
                    />
                    <button
                      onClick={() => updateCustomization({ companyLogo: null })}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <Image className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <span className={cn(
                    'block w-full text-center py-1.5 px-3 rounded border cursor-pointer text-sm',
                    'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600',
                    'hover:bg-gray-50 dark:hover:bg-gray-700'
                  )}>
                    {customization.companyLogo ? t('customizer.branding.changeLogo') : t('customizer.branding.uploadLogo')}
                  </span>
                </label>
              </div>
            </div>

            {/* Company name */}
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                {t('customizer.branding.companyName')}
              </label>
              <input
                type="text"
                value={customization.companyName || ''}
                onChange={(e) => updateCustomization({ companyName: e.target.value })}
                placeholder={t('customizer.branding.companyNamePlaceholder')}
                className={cn(
                  'w-full text-sm px-3 py-1.5 rounded border',
                  'bg-white dark:bg-gray-800',
                  'border-gray-300 dark:border-gray-600',
                  'focus:outline-none focus:ring-1 focus:ring-blue-500'
                )}
              />
            </div>
          </div>
        )}
      </div>

      {/* Document Info Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <SectionHeader
          section="document"
          icon={<FileText className="w-4 h-4 text-orange-500" />}
          title={t('customizer.sections.document')}
        />

        {expandedSection === 'document' && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Document ID */}
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                  {t('customizer.document.documentId')}
                </label>
                <input
                  type="text"
                  value={customization.documentId || ''}
                  onChange={(e) => updateCustomization({ documentId: e.target.value })}
                  placeholder={t('customizer.document.documentIdPlaceholder')}
                  className={cn(
                    'w-full text-sm px-3 py-1.5 rounded border',
                    'bg-white dark:bg-gray-800',
                    'border-gray-300 dark:border-gray-600',
                    'focus:outline-none focus:ring-1 focus:ring-blue-500'
                  )}
                />
              </div>

              {/* Revision */}
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                  {t('customizer.document.revision')}
                </label>
                <input
                  type="text"
                  value={customization.revision || ''}
                  onChange={(e) => updateCustomization({ revision: e.target.value })}
                  placeholder={t('customizer.document.revisionPlaceholder')}
                  className={cn(
                    'w-full text-sm px-3 py-1.5 rounded border',
                    'bg-white dark:bg-gray-800',
                    'border-gray-300 dark:border-gray-600',
                    'focus:outline-none focus:ring-1 focus:ring-blue-500'
                  )}
                />
              </div>
            </div>

            {/* Confidentiality level */}
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {t('customizer.document.confidentiality')}
              </label>
              <select
                value={customization.confidentialityLevel || 'internal'}
                onChange={(e) => updateCustomization({
                  confidentialityLevel: e.target.value as TemplateCustomization['confidentialityLevel']
                })}
                className={cn(
                  'w-full text-sm px-3 py-1.5 rounded border',
                  'bg-white dark:bg-gray-800',
                  'border-gray-300 dark:border-gray-600'
                )}
              >
                <option value="public">{t('customizer.document.public')}</option>
                <option value="internal">{t('customizer.document.internal')}</option>
                <option value="confidential">{t('customizer.document.confidential')}</option>
                <option value="restricted">{t('customizer.document.restricted')}</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateCustomizer;
