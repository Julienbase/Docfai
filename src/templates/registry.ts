import { DocumentTemplate, TemplateCustomization, AppliedTemplate, TemplateColors, TemplateTypography } from './types';
import {
  SOPTemplate,
  TrainingManualTemplate,
  WorkInstructionTemplate,
  TechnicalSpecTemplate,
  UserGuideTemplate
} from './layouts';

// Registry of all available templates
const templateRegistry: Map<string, DocumentTemplate> = new Map();

// Initialize registry with all templates
function initializeRegistry() {
  const templates = [
    SOPTemplate,
    TrainingManualTemplate,
    WorkInstructionTemplate,
    TechnicalSpecTemplate,
    UserGuideTemplate
  ];

  templates.forEach(template => {
    templateRegistry.set(template.id, template);
  });
}

// Initialize on module load
initializeRegistry();

/**
 * Get all available templates
 */
export function getAllTemplates(): DocumentTemplate[] {
  return Array.from(templateRegistry.values());
}

/**
 * Get a template by ID
 */
export function getTemplate(id: string): DocumentTemplate | undefined {
  return templateRegistry.get(id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: DocumentTemplate['category']): DocumentTemplate[] {
  return getAllTemplates().filter(t => t.category === category);
}

/**
 * Apply customization to a template
 */
export function applyCustomization(
  template: DocumentTemplate,
  customization: TemplateCustomization
): AppliedTemplate {
  const appliedTemplate: AppliedTemplate = {
    ...template,
    customization,
    colors: mergeColors(template.colors, customization.colors),
    typography: mergeTypography(template.typography, customization.typography)
  };

  return appliedTemplate;
}

/**
 * Merge custom colors with template defaults
 */
function mergeColors(
  defaults: TemplateColors,
  custom?: Partial<TemplateColors>
): TemplateColors {
  if (!custom) return defaults;
  return { ...defaults, ...custom };
}

/**
 * Merge custom typography with template defaults
 */
function mergeTypography(
  defaults: TemplateTypography,
  custom?: Partial<TemplateTypography>
): TemplateTypography {
  if (!custom) return defaults;
  return {
    ...defaults,
    ...custom,
    fontSize: {
      ...defaults.fontSize,
      ...(custom.fontSize || {})
    }
  };
}

/**
 * Get default customization for a template
 */
export function getDefaultCustomization(): TemplateCustomization {
  return {
    colors: undefined,
    typography: undefined,
    companyLogo: null,
    companyName: '',
    documentId: '',
    revision: '1.0',
    confidentialityLevel: 'internal',
    customSections: {}
  };
}

/**
 * Predefined color schemes for quick selection
 */
export const colorSchemes: Record<string, Partial<TemplateColors>> = {
  corporate: {
    primary: '#1e3a5f',
    secondary: '#4a6fa5',
    accent: '#e67e22',
    headerBg: '#1e3a5f',
    headerText: '#ffffff'
  },
  modern: {
    primary: '#2c3e50',
    secondary: '#3498db',
    accent: '#9b59b6',
    headerBg: '#2c3e50',
    headerText: '#ffffff'
  },
  minimal: {
    primary: '#333333',
    secondary: '#666666',
    accent: '#0066cc',
    headerBg: '#f5f5f5',
    headerText: '#333333'
  },
  vibrant: {
    primary: '#e74c3c',
    secondary: '#3498db',
    accent: '#f1c40f',
    headerBg: '#e74c3c',
    headerText: '#ffffff'
  },
  nature: {
    primary: '#27ae60',
    secondary: '#2ecc71',
    accent: '#f39c12',
    headerBg: '#27ae60',
    headerText: '#ffffff'
  },
  dark: {
    primary: '#1a1a2e',
    secondary: '#16213e',
    accent: '#e94560',
    headerBg: '#1a1a2e',
    headerText: '#ffffff',
    background: '#f8f9fa'
  },
  professional: {
    primary: '#2980b9',
    secondary: '#7f8c8d',
    accent: '#c0392b',
    headerBg: '#2980b9',
    headerText: '#ffffff'
  },
  elegant: {
    primary: '#34495e',
    secondary: '#95a5a6',
    accent: '#8e44ad',
    headerBg: '#34495e',
    headerText: '#ffffff'
  }
};

/**
 * Predefined font combinations
 */
export const fontCombinations: Record<string, { headingFont: string; bodyFont: string }> = {
  classic: { headingFont: 'Times New Roman', bodyFont: 'Times New Roman' },
  modern: { headingFont: 'Segoe UI', bodyFont: 'Segoe UI' },
  professional: { headingFont: 'Arial', bodyFont: 'Arial' },
  elegant: { headingFont: 'Georgia', bodyFont: 'Calibri' },
  technical: { headingFont: 'Consolas', bodyFont: 'Segoe UI' },
  clean: { headingFont: 'Calibri', bodyFont: 'Calibri' },
  readable: { headingFont: 'Verdana', bodyFont: 'Verdana' }
};

/**
 * Validate a color hex string
 */
export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Convert template to CSS variables for HTML export
 */
export function templateToCSSVariables(template: AppliedTemplate | DocumentTemplate): string {
  const colors = template.colors;
  const typography = template.typography;

  return `
    :root {
      --template-primary: ${colors.primary};
      --template-secondary: ${colors.secondary};
      --template-accent: ${colors.accent};
      --template-text: ${colors.text};
      --template-background: ${colors.background};
      --template-border: ${colors.border};
      --template-header-bg: ${colors.headerBg};
      --template-header-text: ${colors.headerText};
      --template-success: ${colors.success};
      --template-warning: ${colors.warning};
      --template-info: ${colors.info};

      --template-heading-font: '${typography.headingFont}', sans-serif;
      --template-body-font: '${typography.bodyFont}', sans-serif;
      --template-font-title: ${typography.fontSize.title}pt;
      --template-font-h1: ${typography.fontSize.heading1}pt;
      --template-font-h2: ${typography.fontSize.heading2}pt;
      --template-font-h3: ${typography.fontSize.heading3}pt;
      --template-font-body: ${typography.fontSize.body}pt;
      --template-font-caption: ${typography.fontSize.caption}pt;
      --template-font-small: ${typography.fontSize.small}pt;
      --template-line-spacing: ${typography.lineSpacing};
    }
  `;
}

/**
 * Storage key for template settings
 */
const TEMPLATE_SETTINGS_KEY = 'docfai_template_settings';

/**
 * Template settings interface for persistence
 * Now stores customizations per template ID
 */
interface TemplateSettings {
  selectedTemplateId: string | null;
  // Global customization (for backwards compatibility)
  customization?: TemplateCustomization;
  // Per-template customizations
  templateCustomizations: Record<string, TemplateCustomization>;
}

/**
 * Save template settings to storage
 */
export async function saveTemplateSettings(
  selectedTemplateId: string | null,
  customization: TemplateCustomization
): Promise<void> {
  try {
    // Load existing settings first
    const existingSettings = await loadTemplateSettings();

    const settings: TemplateSettings = {
      selectedTemplateId,
      templateCustomizations: existingSettings?.templateCustomizations || {}
    };

    // Save customization for the specific template
    if (selectedTemplateId) {
      settings.templateCustomizations[selectedTemplateId] = customization;
    }

    const settingsJson = JSON.stringify(settings);

    // Try Electron storage first
    if (window.electronAPI?.storage) {
      await window.electronAPI.storage.setItem(TEMPLATE_SETTINGS_KEY, settingsJson);
    } else {
      // Fallback to localStorage
      localStorage.setItem(TEMPLATE_SETTINGS_KEY, settingsJson);
    }
  } catch (error) {
    console.error('Failed to save template settings:', error);
  }
}

/**
 * Load template settings from storage
 */
export async function loadTemplateSettings(): Promise<TemplateSettings | null> {
  try {
    let settingsJson: string | null = null;

    // Try Electron storage first
    if (window.electronAPI?.storage) {
      const result = await window.electronAPI.storage.getItem(TEMPLATE_SETTINGS_KEY);
      if (result.success && result.value) {
        settingsJson = result.value;
      }
    } else {
      // Fallback to localStorage
      settingsJson = localStorage.getItem(TEMPLATE_SETTINGS_KEY);
    }

    if (settingsJson) {
      const settings = JSON.parse(settingsJson) as TemplateSettings;
      // Ensure templateCustomizations exists (for backwards compatibility)
      if (!settings.templateCustomizations) {
        settings.templateCustomizations = {};
        // Migrate old customization to the selected template if exists
        if (settings.customization && settings.selectedTemplateId) {
          settings.templateCustomizations[settings.selectedTemplateId] = settings.customization;
        }
      }
      return settings;
    }
  } catch (error) {
    console.error('Failed to load template settings:', error);
  }

  return null;
}

/**
 * Get customization for a specific template
 */
export async function getTemplateCustomization(templateId: string): Promise<TemplateCustomization | null> {
  const settings = await loadTemplateSettings();
  if (settings?.templateCustomizations?.[templateId]) {
    return settings.templateCustomizations[templateId];
  }
  return null;
}

/**
 * Clear template settings from storage
 */
export async function clearTemplateSettings(): Promise<void> {
  try {
    if (window.electronAPI?.storage) {
      await window.electronAPI.storage.removeItem(TEMPLATE_SETTINGS_KEY);
    } else {
      localStorage.removeItem(TEMPLATE_SETTINGS_KEY);
    }
  } catch (error) {
    console.error('Failed to clear template settings:', error);
  }
}

export { templateRegistry };
