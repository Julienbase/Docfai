import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  FileText,
  FolderOpen,
  ArrowRight,
  Shield,
  HardDrive,
  Archive,
  X,
  Loader2,
  Info,
  Image,
  Video,
  AlertTriangle,
  RefreshCw,
  FilePlus,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { ProjectExportService } from '../services/ProjectExportService';
import { createImportPreview, validateAndSanitizeProjectExportData } from '../services/ProjectImportValidation';
import { useAppStore } from '../store/useAppStore';
import CoachMark from '../components/CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';

interface ImportPreview {
  name: string;
  description: string;
  createdAt: string;
  recordingsCount: number;
  screenshotsCount: number;
  stepsCount: number;
  size: number;
  version: string;
}

const ImportPage: React.FC = () => {
  const { t } = useTranslation('importPage');
  const { projects } = useAppStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [conflictAction, setConflictAction] = useState<'replace' | 'new'>('new');

  const exportService = new ProjectExportService();

  // Onboarding hints
  const hintsSuppressed = useHintsSuppressed();
  const browseBtnRef = useRef<HTMLButtonElement | null>(null);
  const importBtnRef = useRef<HTMLButtonElement | null>(null);
  const [browseReady, setBrowseReady] = useState(false);
  const [importReady, setImportReady] = useState(false);

  const assignBrowseRef = useCallback((node: HTMLButtonElement | null) => {
    browseBtnRef.current = node;
    setBrowseReady(!!node);
  }, []);
  const assignImportRef = useCallback((node: HTMLButtonElement | null) => {
    importBtnRef.current = node;
    setImportReady(!!node);
  }, []);

  const browseHint = useOnboardingHint('import.browse', { priority: 100, when: !selectedFile });
  const importHint = useOnboardingHint('import.confirmImport', { priority: 90, when: !!importPreview && !isImporting });

  const handleFileAnalyze = async (file: File) => {
    setSelectedFile(file);
    setImportPreview(null);
    setIsAnalyzing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(arrayBuffer);

      const projectJsonFile = zipContents.file('project.json');
      if (!projectJsonFile) {
        throw new Error('Invalid .docfai file: project.json not found');
      }

      const projectJsonContent = await projectJsonFile.async('text');
      const projectData = validateAndSanitizeProjectExportData(JSON.parse(projectJsonContent));
      const preview: ImportPreview = createImportPreview(projectData, file.name, file.size);

      setImportPreview(preview);
    } catch (error) {
      console.error('Failed to analyze import file:', error);
      toast.error(t('toast.analyzeError'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectFile = async () => {
    try {
      if (!window.electronAPI?.backup?.selectImportFile) {
        toast.error(t('toast.fileNotAvailable'));
        return;
      }

      const result = await window.electronAPI.backup.selectImportFile();
      if (result && !result.canceled && result.path) {
        const filePath = result.path;
        const fileName = filePath.split(/[\\/]/).pop() || 'import.docfai';

        const fileResult = await window.electronAPI.backup.readImportFile(filePath);
        if (fileResult.success && fileResult.data) {
          const file = new File([new Uint8Array(fileResult.data)], fileName, {
            type: 'application/zip'
          });
          await handleFileAnalyze(file);
        } else {
          toast.error(t('toast.readError', { error: fileResult.error || 'Unknown error' }));
        }
      }
    } catch (error) {
      console.error('Failed to select file:', error);
      toast.error(t('toast.selectError'));
    }
  };

  const hasNameConflict = importPreview
    ? projects.some(p => p.name.toLowerCase() === importPreview.name.toLowerCase())
    : false;

  const handleImport = async () => {
    if (!selectedFile || !importPreview) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportStatus('Starting import...');

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      await exportService.importProject(
        uint8Array,
        {
          overwriteExisting: hasNameConflict && conflictAction === 'replace',
          importAsNew: hasNameConflict && conflictAction === 'new'
        },
        (progress) => {
          setImportProgress(progress.progress);
          setImportStatus(progress.message);
        }
      );

      toast.success(t('toast.success'));
      // Reset state after successful import
      setSelectedFile(null);
      setImportPreview(null);
      setConflictAction('new');
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t('toast.error', { error: error instanceof Error ? error.message : 'Unknown error' }));
    } finally {
      setIsImporting(false);
      setImportProgress(0);
      setImportStatus('');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-10 text-center relative">
          <button
            onClick={toggleAllOnboardingHints}
            className={cn(
              "absolute top-0 right-0 p-1.5 rounded-md transition-colors",
              hintsSuppressed
                ? "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
            title={hintsSuppressed ? t('header.hints.show') : t('header.hints.hide')}
            aria-pressed={!hintsSuppressed}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('header.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {t('header.description')}
          </p>
        </div>

        {/* Import Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 mb-8 shadow-sm">

          {!selectedFile ? (
            /* File Selection */
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-50 dark:bg-gray-700 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {t('selection.title')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {t('selection.subtitle')}
              </p>
              <button
                ref={assignBrowseRef}
                onClick={selectFile}
                disabled={isAnalyzing}
                className="mx-auto bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center space-x-2 group"
              >
                <Upload className="w-5 h-5" />
                <span>{t('selection.browseButton')}</span>
                <ArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
              </button>
            </div>
          ) : (
            /* File Selected - Show Preview & Import */
            <div className="space-y-6">
              {/* Selected File */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Archive className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setImportPreview(null);
                    setConflictAction('new');
                  }}
                  disabled={isImporting}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Analyzing */}
              {isAnalyzing && (
                <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                  <span className="text-sm text-blue-900 dark:text-blue-100">{t('preview.analyzing')}</span>
                </div>
              )}

              {/* Preview */}
              {importPreview && (
                <>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center space-x-2">
                      <Info className="w-4 h-4" />
                      <span>{t('preview.title')}</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('preview.projectName')}</span>
                        <p className="font-medium text-gray-900 dark:text-white">{importPreview.name}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('preview.created')}</span>
                        <p className="font-medium text-gray-900 dark:text-white">{formatDate(importPreview.createdAt)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('preview.recordings')}</span>
                        <p className="font-medium text-gray-900 dark:text-white flex items-center space-x-1">
                          <Video className="w-4 h-4" />
                          <span>{importPreview.recordingsCount}</span>
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('preview.screenshots')}</span>
                        <p className="font-medium text-gray-900 dark:text-white flex items-center space-x-1">
                          <Image className="w-4 h-4" />
                          <span>{importPreview.screenshotsCount}</span>
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('preview.documentationSteps')}</span>
                        <p className="font-medium text-gray-900 dark:text-white flex items-center space-x-1">
                          <FileText className="w-4 h-4" />
                          <span>{importPreview.stepsCount}</span>
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('preview.fileSize')}</span>
                        <p className="font-medium text-gray-900 dark:text-white">{formatFileSize(importPreview.size)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Conflict Resolution */}
                  {hasNameConflict && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                          {t('conflict.warning', { name: importPreview.name })}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <label
                          className={cn(
                            "flex items-center space-x-3 p-3 rounded-lg cursor-pointer border transition-colors",
                            conflictAction === 'new'
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                          )}
                        >
                          <input
                            type="radio"
                            name="conflictAction"
                            checked={conflictAction === 'new'}
                            onChange={() => setConflictAction('new')}
                            disabled={isImporting}
                            className="w-4 h-4 text-blue-600"
                          />
                          <FilePlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{t('conflict.importAsNew')}</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('conflict.importAsNewDesc')}</p>
                          </div>
                        </label>
                        <label
                          className={cn(
                            "flex items-center space-x-3 p-3 rounded-lg cursor-pointer border transition-colors",
                            conflictAction === 'replace'
                              ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                              : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                          )}
                        >
                          <input
                            type="radio"
                            name="conflictAction"
                            checked={conflictAction === 'replace'}
                            onChange={() => setConflictAction('replace')}
                            disabled={isImporting}
                            className="w-4 h-4 text-red-600"
                          />
                          <RefreshCw className="w-5 h-5 text-red-600 dark:text-red-400" />
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{t('conflict.replace')}</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('conflict.replaceDesc')}</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Import Progress */}
                  {isImporting && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <div className="flex items-center space-x-3 mb-2">
                        <Loader2 className="w-5 h-5 text-green-600 dark:text-green-400 animate-spin" />
                        <span className="text-sm font-medium text-green-900 dark:text-green-100">{importStatus}</span>
                      </div>
                      <div className="w-full bg-green-200 dark:bg-green-800 rounded-full h-2">
                        <div
                          className="bg-green-600 dark:bg-green-400 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                      <div className="text-xs text-green-700 dark:text-green-300 mt-1">
                        {importProgress.toFixed(0)}{t('progress.complete')}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setImportPreview(null);
                        setConflictAction('new');
                      }}
                      disabled={isImporting}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                    >
                      {t('actions.chooseDifferent')}
                    </button>
                    <button
                      ref={assignImportRef}
                      onClick={handleImport}
                      disabled={isImporting}
                      className={cn(
                        "px-6 py-2.5 rounded-xl transition-colors flex items-center space-x-2 font-medium text-sm",
                        isImporting
                          ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                          : "bg-green-600 hover:bg-green-700 text-white"
                      )}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{t('actions.importing')}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>{t('actions.importButton')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Info Cards - only show when no file is selected */}
        {!selectedFile && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('infocards.formats.title')}</h4>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {t('infocards.formats.desc')}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('infocards.protection.title')}</h4>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {t('infocards.protection.desc')}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('infocards.restore.title')}</h4>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {t('infocards.restore.desc')}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Onboarding coach marks */}
      {browseHint.visible && browseReady && (
        <CoachMark
          anchorRef={browseBtnRef}
          title={t('coach.browse.title')}
          description={t('coach.browse.desc')}
          placement="bottom"
          onDismiss={browseHint.dismiss}
        />
      )}
      {importHint.visible && importReady && (
        <CoachMark
          anchorRef={importBtnRef}
          title={t('coach.confirmImport.title')}
          description={t('coach.confirmImport.desc')}
          placement="top"
          onDismiss={importHint.dismiss}
        />
      )}
    </div>
  );
};

export default ImportPage;
