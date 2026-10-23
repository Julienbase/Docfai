import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface ProgressInfo {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

export const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ProgressInfo | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Set up event listeners for update events
    const removeAvailableListener = window.electronAPI.onUpdateAvailable((info: UpdateInfo) => {
      console.log('[Update UI] Update available:', info);
      setUpdateAvailable(true);
      setUpdateInfo(info);
      setDismissed(false);
    });

    const removeProgressListener = window.electronAPI.onUpdateProgress((progress: ProgressInfo) => {
      console.log('[Update UI] Download progress:', progress.percent + '%');
      setDownloadProgress(progress);
    });

    const removeDownloadedListener = window.electronAPI.onUpdateDownloaded((info: UpdateInfo) => {
      console.log('[Update UI] Update downloaded:', info);
      setUpdateDownloaded(true);
      setUpdateInfo(info);
      setDownloadProgress(null);
      setDismissed(false);
    });

    const removeErrorListener = window.electronAPI.onUpdateError((err: { message: string }) => {
      console.error('[Update UI] Update error:', err);
      setError(err.message);
      setUpdateAvailable(false);
      setDownloadProgress(null);
      setDismissed(false);
    });

    // Clean up listeners on unmount
    return () => {
      removeAvailableListener();
      removeProgressListener();
      removeDownloadedListener();
      removeErrorListener();
    };
  }, []);

  const handleInstallUpdate = async () => {
    try {
      console.log('[Update UI] User clicked install update');
      await window.electronAPI.installUpdate();
    } catch (error) {
      console.error('[Update UI] Error installing update:', error);
      setError('Failed to install update. Please try again.');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setError(null);
  };

  // Don't show anything if dismissed
  if (dismissed) {
    return null;
  }

  // Show error notification
  if (error) {
    return (
      <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top">
        <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">Update Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 ml-3 text-red-400 hover:text-red-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show "Restart to Update" notification
  if (updateDownloaded) {
    return (
      <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top">
        <div className="bg-green-50 border border-green-200 rounded-lg shadow-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-green-800">Update Ready to Install</h3>
              </div>
              <p className="text-sm text-green-700 mb-3">
                Version {updateInfo?.version} has been downloaded and is ready to install.
              </p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleInstallUpdate}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  Restart and Update
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md border border-gray-300 transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 ml-3 text-green-400 hover:text-green-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show download progress
  if (downloadProgress && downloadProgress.percent > 0) {
    const progressPercent = Math.round(downloadProgress.percent);
    const downloadedMB = (downloadProgress.transferred / 1024 / 1024).toFixed(1);
    const totalMB = (downloadProgress.total / 1024 / 1024).toFixed(1);
    const speedMBps = (downloadProgress.bytesPerSecond / 1024 / 1024).toFixed(1);

    return (
      <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top">
        <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <h3 className="text-sm font-semibold text-blue-800">Downloading Update...</h3>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-blue-400 hover:text-blue-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-blue-700">
              <span>{progressPercent}% complete</span>
              <span>{downloadedMB} / {totalMB} MB</span>
            </div>

            <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <p className="text-xs text-blue-600">
              {speedMBps} MB/s • Version {updateInfo?.version}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show "Update Available" notification
  if (updateAvailable) {
    return (
      <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top">
        <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h3 className="text-sm font-semibold text-blue-800">Update Available</h3>
              </div>
              <p className="text-sm text-blue-700">
                Version {updateInfo?.version} is available and downloading in the background.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 ml-3 text-blue-400 hover:text-blue-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
