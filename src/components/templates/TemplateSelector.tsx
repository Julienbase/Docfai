import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardCheck,
  GraduationCap,
  ListChecks,
  FileCode,
  BookOpen,
  Check
} from 'lucide-react';
import { DocumentTemplate } from '../../templates/types';
import { getAllTemplates } from '../../templates/registry';
import { cn } from '../../lib/utils';

interface TemplateSelectorProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: DocumentTemplate) => void;
  className?: string;
}

// Icon mapping for templates
const templateIcons: Record<string, React.ReactNode> = {
  'ClipboardCheck': <ClipboardCheck className="w-6 h-6" />,
  'GraduationCap': <GraduationCap className="w-6 h-6" />,
  'ListChecks': <ListChecks className="w-6 h-6" />,
  'FileCode': <FileCode className="w-6 h-6" />,
  'BookOpen': <BookOpen className="w-6 h-6" />
};

// Category labels
const categoryLabels: Record<string, string> = {
  compliance: 'Compliance & Regulatory',
  operations: 'Operations & Processes',
  training: 'Training & Education',
  technical: 'Technical Documentation'
};

// Category colors
const categoryColors: Record<string, string> = {
  compliance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  operations: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  training: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  technical: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selectedTemplateId,
  onSelectTemplate,
  className
}) => {
  const { t } = useTranslation('templatePanel');
  const templates = getAllTemplates();

  // Sort templates in a logical order for display
  const sortedTemplates = [...templates].sort((a, b) => {
    const order: Record<string, number> = {
      'sop': 1,
      'work-instruction': 2,
      'training-manual': 3,
      'user-guide': 4,
      'technical-spec': 5
    };
    return (order[a.id] || 99) - (order[b.id] || 99);
  });

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('selector.heading')}
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t('selector.available', { count: templates.length })}
        </span>
      </div>

      {/* All templates in a list */}
      <div className="space-y-1.5">
        {sortedTemplates.map((template) => {
          const isSelected = selectedTemplateId === template.id;

          return (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                'hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              )}
            >
              {/* Icon */}
              <div className={cn(
                'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
                isSelected
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              )}>
                {templateIcons[template.icon] || <FileCode className="w-5 h-5" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={cn(
                    'text-sm font-medium',
                    isSelected
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-gray-100'
                  )}>
                    {t(`templates.${template.id}.name`, { defaultValue: template.name })}
                  </h4>
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
                    categoryColors[template.category]
                  )}>
                    {t(`selector.categories.${template.category}`, { defaultValue: categoryLabels[template.category] })}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {t(`templates.${template.id}.description`, { defaultValue: template.description })}
                </p>
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TemplateSelector;
