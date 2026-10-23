import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Upload,
  FileText,
  FolderOpen,
  Loader2,
  Info,
  Archive,
  Image,
  Video,
  AlertTriangle,
  RefreshCw,
  FilePlus,
  ArrowRight,
  Shield,
  HardDrive
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { ProjectExportService } from '../services/ProjectExportService';
import { createImportPreview, validateAndSanitizeProjectExportData } from '../services/ProjectImportValidation';
import { useAppStore } from '../store/useAppStore';

interface ProjectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: (projectId: string) => void;
}

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

const ProjectImportModal: React.FC<ProjectImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
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

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setImportPreview(null);
    setIsAnalyzing(true);

    try {
      // Read file and analyze its contents
      const arrayBuffer = await file.arrayBuffer();
      
      // Extract and parse the ZIP file to get actual project data
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(arrayBuffer);
      
      // Read project.json from the ZIP file
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

        // Read the file
        const fileResult = await window.electronAPI.backup.readImportFile(filePath);
        if (fileResult.success && fileResult.data) {
          const file = new File([new Uint8Array(fileResult.data)], fileName, {
            type: 'application/zip'
          });

          await handleFileSelect(file);
        } else {
          toast.error(t('toast.readError', { error: fileResult.error || 'Unknown error' }));
        }
      }
    } catch (error) {
      console.error('Failed to select file:', error);
      toast.error(t('toast.selectError'));
    }
  };

  // Check if the imported project name conflicts with an existing project
  const hasNameConflict = importPreview
    ? projects.some(p => p.name.toLowerCase() === importPreview.name.toLowerCase())
    : false;

  const handleImport = async () => {
    if (!selectedFile || !importPreview) {
      toast.error('Please select a file to import');
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportStatus('Starting import...');

    try {
      const progressHandler = (progress: number, status: string) => {
        setImportProgress(progress);
        setImportStatus(status);
      };

      const arrayBuffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const importedProject = await exportService.importProject(
        uint8Array,
        {
          overwriteExisting: hasNameConflict && conflictAction === 'replace',
          importAsNew: hasNameConflict && conflictAction === 'new'
        },
        (progress) => progressHandler(progress.progress, progress.message)
      );

      toast.success(t('toast.success'));
      onImportComplete?.(importedProject.id);
      onClose();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header with Close Button */}
        <div className="flex items-center justify-end p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* File Selection */}
          {!selectedFile ? (
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
                      }}
                      disabled={isImporting}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                    >
                      {t('actions.chooseDifferent')}
                    </button>
                    <button
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

          {/* Info Cards - only show when no file is selected */}
          {!selectedFile && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-4">
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

              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-4">
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

              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-4">
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
      </div>
    </div>
  );
};

export default ProjectImportModal;
