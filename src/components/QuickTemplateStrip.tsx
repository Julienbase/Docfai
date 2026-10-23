import React from 'react';
import {
  ClipboardCheck,
  GraduationCap,
  ListChecks,
  FileCode,
  BookOpen
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DocumentTemplate } from '../templates/types';
import { getAllTemplates } from '../templates/registry';
import { cn } from '../lib/utils';

interface QuickTemplateStripProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: DocumentTemplate) => void;
}

const templateIcons: Record<string, React.ReactNode> = {
  'ClipboardCheck': <ClipboardCheck className="w-4 h-4" />,
  'GraduationCap': <GraduationCap className="w-4 h-4" />,
  'ListChecks': <ListChecks className="w-4 h-4" />,
  'FileCode': <FileCode className="w-4 h-4" />,
  'BookOpen': <BookOpen className="w-4 h-4" />
};

const shortNames: Record<string, string> = {
  'sop': 'SOP',
  'training-manual': 'Training',
  'work-instruction': 'Work Inst.',
  'technical-spec': 'Tech Spec',
  'user-guide': 'User Guide'
};

const QuickTemplateStrip: React.FC<QuickTemplateStripProps> = ({
  selectedTemplateId,
  onSelectTemplate
}) => {
  const { t } = useTranslation('editingPage');
  const templates = getAllTemplates();

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">{t('preview.templateLabel')}</span>
      {templates.map((template) => {
        const isSelected = selectedTemplateId === template.id;
        return (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
              isSelected
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            )}
            title={template.name}
          >
            {templateIcons[template.icon] || <FileCode className="w-4 h-4" />}
            <span>{shortNames[template.id] || template.name}</span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickTemplateStrip;
