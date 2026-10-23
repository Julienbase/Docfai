import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';

import enCommon from './locales/en/common.json';
import enDashboard from './locales/en/dashboard.json';
import enProjectModal from './locales/en/projectModal.json';
import enEditingPage from './locales/en/editingPage.json';
import enImageEditor from './locales/en/imageEditor.json';
import enExportPage from './locales/en/exportPage.json';
import enTemplatePanel from './locales/en/templatePanel.json';
import enRecordingPage from './locales/en/recordingPage.json';
import enInteractiveScreenshots from './locales/en/interactiveScreenshots.json';
import enVideoExportPage from './locales/en/videoExportPage.json';
import enImportPage from './locales/en/importPage.json';
import enAccountPage from './locales/en/accountPage.json';
import enHelpPage from './locales/en/helpPage.json';
import deCommon from './locales/de/common.json';
import deDashboard from './locales/de/dashboard.json';
import deProjectModal from './locales/de/projectModal.json';
import deEditingPage from './locales/de/editingPage.json';
import deImageEditor from './locales/de/imageEditor.json';
import deExportPage from './locales/de/exportPage.json';
import deTemplatePanel from './locales/de/templatePanel.json';
import deRecordingPage from './locales/de/recordingPage.json';
import deInteractiveScreenshots from './locales/de/interactiveScreenshots.json';
import deVideoExportPage from './locales/de/videoExportPage.json';
import deImportPage from './locales/de/importPage.json';
import deAccountPage from './locales/de/accountPage.json';
import deHelpPage from './locales/de/helpPage.json';

import esCommon from './locales/es/common.json';
import esDashboard from './locales/es/dashboard.json';
import esProjectModal from './locales/es/projectModal.json';
import esEditingPage from './locales/es/editingPage.json';
import esImageEditor from './locales/es/imageEditor.json';
import esExportPage from './locales/es/exportPage.json';
import esTemplatePanel from './locales/es/templatePanel.json';
import esRecordingPage from './locales/es/recordingPage.json';
import esInteractiveScreenshots from './locales/es/interactiveScreenshots.json';
import esVideoExportPage from './locales/es/videoExportPage.json';
import esImportPage from './locales/es/importPage.json';
import esAccountPage from './locales/es/accountPage.json';
import esHelpPage from './locales/es/helpPage.json';

import frCommon from './locales/fr/common.json';
import frDashboard from './locales/fr/dashboard.json';
import frProjectModal from './locales/fr/projectModal.json';
import frEditingPage from './locales/fr/editingPage.json';
import frImageEditor from './locales/fr/imageEditor.json';
import frExportPage from './locales/fr/exportPage.json';
import frTemplatePanel from './locales/fr/templatePanel.json';
import frRecordingPage from './locales/fr/recordingPage.json';
import frInteractiveScreenshots from './locales/fr/interactiveScreenshots.json';
import frVideoExportPage from './locales/fr/videoExportPage.json';
import frImportPage from './locales/fr/importPage.json';
import frAccountPage from './locales/fr/accountPage.json';
import frHelpPage from './locales/fr/helpPage.json';

import roCommon from './locales/ro/common.json';
import roDashboard from './locales/ro/dashboard.json';
import roProjectModal from './locales/ro/projectModal.json';
import roEditingPage from './locales/ro/editingPage.json';
import roImageEditor from './locales/ro/imageEditor.json';
import roExportPage from './locales/ro/exportPage.json';
import roTemplatePanel from './locales/ro/templatePanel.json';
import roRecordingPage from './locales/ro/recordingPage.json';
import roInteractiveScreenshots from './locales/ro/interactiveScreenshots.json';
import roVideoExportPage from './locales/ro/videoExportPage.json';
import roImportPage from './locales/ro/importPage.json';
import roAccountPage from './locales/ro/accountPage.json';
import roHelpPage from './locales/ro/helpPage.json';

import itCommon from './locales/it/common.json';
import itDashboard from './locales/it/dashboard.json';
import itProjectModal from './locales/it/projectModal.json';
import itEditingPage from './locales/it/editingPage.json';
import itImageEditor from './locales/it/imageEditor.json';
import itExportPage from './locales/it/exportPage.json';
import itTemplatePanel from './locales/it/templatePanel.json';
import itRecordingPage from './locales/it/recordingPage.json';
import itInteractiveScreenshots from './locales/it/interactiveScreenshots.json';
import itVideoExportPage from './locales/it/videoExportPage.json';
import itImportPage from './locales/it/importPage.json';
import itAccountPage from './locales/it/accountPage.json';
import itHelpPage from './locales/it/helpPage.json';

export const SUPPORTED_LANGUAGES = ['en', 'de', 'es', 'fr', 'ro', 'it'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const resources = {
  en: { common: enCommon, dashboard: enDashboard, projectModal: enProjectModal, editingPage: enEditingPage, imageEditor: enImageEditor, exportPage: enExportPage, templatePanel: enTemplatePanel, recordingPage: enRecordingPage, interactiveScreenshots: enInteractiveScreenshots, videoExportPage: enVideoExportPage, importPage: enImportPage, accountPage: enAccountPage, helpPage: enHelpPage },
  de: { common: deCommon, dashboard: deDashboard, projectModal: deProjectModal, editingPage: deEditingPage, imageEditor: deImageEditor, exportPage: deExportPage, templatePanel: deTemplatePanel, recordingPage: deRecordingPage, interactiveScreenshots: deInteractiveScreenshots, videoExportPage: deVideoExportPage, importPage: deImportPage, accountPage: deAccountPage, helpPage: deHelpPage },
  es: { common: esCommon, dashboard: esDashboard, projectModal: esProjectModal, editingPage: esEditingPage, imageEditor: esImageEditor, exportPage: esExportPage, templatePanel: esTemplatePanel, recordingPage: esRecordingPage, interactiveScreenshots: esInteractiveScreenshots, videoExportPage: esVideoExportPage, importPage: esImportPage, accountPage: esAccountPage, helpPage: esHelpPage },
  fr: { common: frCommon, dashboard: frDashboard, projectModal: frProjectModal, editingPage: frEditingPage, imageEditor: frImageEditor, exportPage: frExportPage, templatePanel: frTemplatePanel, recordingPage: frRecordingPage, interactiveScreenshots: frInteractiveScreenshots, videoExportPage: frVideoExportPage, importPage: frImportPage, accountPage: frAccountPage, helpPage: frHelpPage },
  ro: { common: roCommon, dashboard: roDashboard, projectModal: roProjectModal, editingPage: roEditingPage, imageEditor: roImageEditor, exportPage: roExportPage, templatePanel: roTemplatePanel, recordingPage: roRecordingPage, interactiveScreenshots: roInteractiveScreenshots, videoExportPage: roVideoExportPage, importPage: roImportPage, accountPage: roAccountPage, helpPage: roHelpPage },
  it: { common: itCommon, dashboard: itDashboard, projectModal: itProjectModal, editingPage: itEditingPage, imageEditor: itImageEditor, exportPage: itExportPage, templatePanel: itTemplatePanel, recordingPage: itRecordingPage, interactiveScreenshots: itInteractiveScreenshots, videoExportPage: itVideoExportPage, importPage: itImportPage, accountPage: itAccountPage, helpPage: itHelpPage },
};

const initialLanguage: SupportedLanguage =
  useAppStore.getState().settings.language || 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  defaultNS: 'common',
  ns: ['common', 'dashboard', 'projectModal', 'editingPage', 'imageEditor', 'exportPage', 'templatePanel', 'recordingPage', 'interactiveScreenshots', 'videoExportPage', 'importPage', 'accountPage', 'helpPage'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

let lastLanguage = initialLanguage;
useAppStore.subscribe((state) => {
  const lang = state.settings.language;
  if (lang && lang !== lastLanguage) {
    lastLanguage = lang;
    i18n.changeLanguage(lang);
  }
});

export default i18n;
