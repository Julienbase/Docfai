import React, { useState } from 'react';
import {
  BookOpen,
  Settings,
  Video,
  Camera,
  Download,
  Upload,
  Database,
  FileText,
  HardDrive,
  Clock,
  ChevronDown,
  ChevronRight,
  Search
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

interface HelpSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

const HelpPage: React.FC = () => {
  const { t } = useTranslation('helpPage');
  const [expandedSection, setExpandedSection] = useState<string>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSection = (sectionId: string) => {
    setExpandedSection(expandedSection === sectionId ? '' : sectionId);
  };

  const helpSections: HelpSection[] = [
    {
      id: 'getting-started',
      title: t('sections.gettingStarted.title'),
      icon: BookOpen,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.gettingStarted.welcome')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.gettingStarted.description')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.gettingStarted.quickStartTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.gettingStarted.quickStart', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )
    },
    {
      id: 'projects',
      title: t('sections.projects.title'),
      icon: FileText,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.projects.projectManagement')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.projects.projectDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.projects.createTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.projects.createSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.projects.actionsTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.projects.actions', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )
    },
    {
      id: 'screenshots',
      title: t('sections.screenshots.title'),
      icon: Camera,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.screenshots.screenshotTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.screenshots.screenshotDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.screenshots.howToTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.screenshots.howToSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.screenshots.editingToolsTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.screenshots.editingTools', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.screenshots.shortcutsTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.screenshots.shortcuts', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )
    },
    {
      id: 'video-recording',
      title: t('sections.videoRecording.title'),
      icon: Video,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.videoRecording.recordingTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.videoRecording.recordingDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.videoRecording.howToTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.videoRecording.howToSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.videoRecording.extractTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.videoRecording.extractSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.videoRecording.tipsTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.videoRecording.tips', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )
    },
    {
      id: 'templates',
      title: t('sections.templates.title'),
      icon: FileText,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.templates.templatesTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.templates.templatesDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.templates.availableTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.templates.available', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.templates.customizeTitle')}</h4>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.templates.customizeDesc')}
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.templates.customizeOptions', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.templates.saveTitle')}</h4>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.templates.saveDesc')}
          </p>
        </div>
      )
    },
    {
      id: 'export',
      title: t('sections.export.title'),
      icon: Download,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.export.exportTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.export.exportDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.export.formatsTitle')}</h4>

          <div className="space-y-3">
            {Object.entries((t('sections.export.formats', { returnObjects: true }) as Record<string, any>) || {}).map(([key, format]) => (
              <div key={key} className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <h5 className="font-semibold text-gray-900 dark:text-white">{format.name}</h5>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {format.desc}
                </p>
              </div>
            ))}
          </div>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.export.howToTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.export.howToSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )
    },
    {
      id: 'import',
      title: t('sections.importExport.title'),
      icon: Upload,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.importExport.importTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.importExport.importDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.importExport.formatsTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.importExport.formats', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.importExport.howToTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.importExport.howToSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.importExport.useCasesTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.importExport.useCases', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )
    },
    {
      id: 'backup',
      title: t('sections.backup.title'),
      icon: HardDrive,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.backup.backupTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.backup.backupDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.backup.automaticTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.backup.automaticSteps', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.backup.configureTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.backup.configureSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.backup.manualTitle')}</h4>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.backup.manualDesc')}
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.backup.manualSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.backup.restoreTitle')}</h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.backup.restoreSteps', { returnObjects: true }) as string[]).map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.backup.settingsTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.backup.settingsOptions', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )
    },
    {
      id: 'translation',
      title: t('sections.translation.title'),
      icon: Download,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.translation.translationTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300">
            {t('sections.translation.translationDesc')}
          </p>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.translation.howItTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.translation.howItSteps', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.translation.storageTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.translation.storageInfo', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.translation.languagesTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.translation.languages', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.translation.translatedTitle')}</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            {(t('sections.translation.translatedItems', { returnObjects: true }) as string[]).map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg mt-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {t('sections.translation.privacyNote')}
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'shortcuts',
      title: t('sections.shortcuts.title'),
      icon: Settings,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sections.shortcuts.shortcutsTitle')}</h3>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.shortcuts.globalTitle')}</h4>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">{t('sections.shortcuts.globalShortcuts.screenshot')}</span>
              <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm">
                {t('sections.shortcuts.globalShortcuts.screenshotKey')}
              </kbd>
            </div>
          </div>

          <h4 className="text-md font-semibold text-gray-900 dark:text-white mt-4">{t('sections.shortcuts.editorTitle')}</h4>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">{t('sections.shortcuts.editorShortcuts.zoom')}</span>
              <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm">
                {t('sections.shortcuts.editorShortcuts.zoomKey')}
              </kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">{t('sections.shortcuts.editorShortcuts.pan')}</span>
              <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm">
                {t('sections.shortcuts.editorShortcuts.panKey')}
              </kbd>
            </div>
          </div>

        </div>
      )
    }
  ];

  // Filter sections based on search query
  const filteredSections = helpSections.filter(section =>
    section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {t('header.title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {t('header.subtitle')}
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Help Sections */}
      <div className="space-y-4">
        {filteredSections.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSection === section.id;

          return (
            <div
              key={section.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {section.title}
                  </h2>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="pt-4">
                    {section.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* No Results */}
      {filteredSections.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            {t('search.noResults', { query: searchQuery })}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {t('footer.needHelp')}
        </h3>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          {t('footer.helpDesc')}
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href="https://github.com/Julienbase/Docfai/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            {t('footer.emailSupport')}
          </a>
          <a
            href="https://github.com/Julienbase/Docfai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors"
          >
            {t('footer.viewDocs')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
