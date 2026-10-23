import React, { useEffect, useState, useCallback } from 'react';
import { X, Download, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface TranslationModuleDownloadProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallComplete: () => void;
  targetLang: 'EN' | 'DE';
}

interface DiskSpaceInfo {
  available: number;
  required: number;
  sufficient: boolean;
}

interface ProgressInfo {
  phase: 'preparing' | 'downloading' | 'verifying' | 'extracting';
  percent: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
}

type ModalState = 'consent' | 'downloading' | 'complete' | 'error';

export const TranslationModuleDownload: React.FC<TranslationModuleDownloadProps> = ({
  isOpen,
  onClose,
  onInstallComplete,
  targetLang
}) => {
  const [state, setState] = useState<ModalState>('consent');
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingSpace, setIsCheckingSpace] = useState(true);

  // Check disk space on mount
  useEffect(() => {
    if (!isOpen) return;

    setState('consent');
    setError(null);
    setProgress(null);
    setIsCheckingSpace(true);

    window.electronAPI.translationModuleCheckDiskSpace()
      .then((space) => {
        setDiskSpace(space);
        setIsCheckingSpace(false);
      })
      .catch(() => {
        setDiskSpace({ available: 0, required: 0, sufficient: true });
        setIsCheckingSpace(false);
      });
  }, [isOpen]);

  // Set up progress and completion listeners
  useEffect(() => {
    if (!isOpen) return;

    const removeProgressListener = window.electronAPI.onTranslationModuleProgress((data) => {
      setProgress(data);
    });

    const removeCompleteListener = window.electronAPI.onTranslationModuleComplete((data) => {
      if (data.success) {
        setState('complete');
      } else {
        setError(data.error || 'Installation failed');
        setState('error');
      }
    });

    return () => {
      removeProgressListener();
      removeCompleteListener();
    };
  }, [isOpen]);

  const handleDownload = useCallback(async () => {
    setState('downloading');
    setError(null);
    setProgress({ phase: 'preparing', percent: 0, message: 'Starting download...' });

    try {
      const result = await window.electronAPI.translationModuleDownload();
      if (!result.success) {
        setError(result.error || 'Download failed');
        setState('error');
      }
      // Success is handled by the onTranslationModuleComplete listener
    } catch (err: any) {
      setError(err.message || 'Unexpected error during download');
      setState('error');
    }
  }, []);

  const handleCancel = useCallback(async () => {
    if (state === 'downloading') {
      try {
        await window.electronAPI.translationModuleCancelDownload();
      } catch {
        // Ignore cancel errors
      }
    }
    onClose();
  }, [state, onClose]);

  const handleRetry = useCallback(() => {
    setError(null);
    setState('consent');
  }, []);

  const handleComplete = useCallback(() => {
    onInstallComplete();
  }, [onInstallComplete]);

  if (!isOpen) return null;

  const langName = targetLang === 'EN' ? 'English' : 'German';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {state === 'complete' ? 'Translation Module Installed' : 'Translation Module Required'}
          </h2>
          {state !== 'downloading' && (
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {/* Consent State */}
          {state === 'consent' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                To translate your documentation to <strong>{langName}</strong>, Docfai needs to download the Translation Module. This is a one-time download.
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 space-y-2">
                <div className="flex items-start space-x-3">
                  <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium">What will be downloaded:</p>
                    <ul className="mt-1 space-y-1 text-blue-700 dark:text-blue-300">
                      <li>Offline translation engine (~600 MB)</li>
                      <li>English &amp; German language models</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p>All translations happen <strong>offline</strong> on your computer.</p>
                <p>No data is sent to external servers.</p>
                <p>Stored in: <code className="text-xs bg-gray-200 dark:bg-gray-600 px-1 rounded">%APPDATA%/Docfai/</code></p>
              </div>

              {/* Disk space check */}
              {isCheckingSpace ? (
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking available disk space...</span>
                </div>
              ) : diskSpace && !diskSpace.sufficient ? (
                <div className="flex items-start space-x-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Insufficient disk space</p>
                    <p>
                      Available: {(diskSpace.available / (1024 * 1024 * 1024)).toFixed(1)} GB |
                      Required: {(diskSpace.required / (1024 * 1024 * 1024)).toFixed(1)} GB
                    </p>
                  </div>
                </div>
              ) : diskSpace ? (
                <div className="flex items-center space-x-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {(diskSpace.available / (1024 * 1024 * 1024)).toFixed(1)} GB available
                    (requires ~2.2 GB)
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Downloading State */}
          {state === 'downloading' && progress && (
            <div className="space-y-4">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {progress.phase === 'preparing' && (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>{progress.message || 'Preparing download...'}</span>
                  </div>
                )}
                {progress.phase === 'downloading' && (
                  <>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">Downloading Translation Module...</span>
                      <span>{progress.percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {progress.transferred ? `${(progress.transferred / (1024 * 1024)).toFixed(1)} MB` : '0 MB'}
                        {progress.total ? ` / ${(progress.total / (1024 * 1024)).toFixed(0)} MB` : ''}
                      </span>
                      <span>
                        {progress.bytesPerSecond ? `${(progress.bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s` : ''}
                      </span>
                    </div>
                  </>
                )}
                {progress.phase === 'verifying' && (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>Verifying download integrity...</span>
                  </div>
                )}
                {progress.phase === 'extracting' && (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>Extracting translation module... This may take a few minutes.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complete State */}
          {state === 'complete' && (
            <div className="space-y-4 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Translation Module Installed</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  The translation module has been installed successfully. Your export will now continue with {langName} translation.
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Download Failed</h3>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {state === 'consent' && (
            <>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={isCheckingSpace || (diskSpace ? !diskSpace.sufficient : false)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Download (~600 MB)
              </button>
            </>
          )}

          {state === 'downloading' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel Download
            </button>
          )}

          {state === 'complete' && (
            <button
              onClick={handleComplete}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Continue Export
            </button>
          )}

          {state === 'error' && (
            <>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
