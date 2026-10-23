import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Share2,
  FolderOpen,
  HardDrive,
  Upload,
  Loader2,
  Copy,
  CheckCircle,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { ProjectExportService, ExportOptions, ExportDestination } from '../services/ProjectExportService';
import { useAppStore } from '../store/useAppStore';

interface ProjectExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
}

const ProjectExportModal: React.FC<ProjectExportModalProps> = ({
  isOpen,
  onClose,
  projectId
}) => {
  const { projects, currentProject } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || currentProject?.id || '');
  const exportOptions: ExportOptions = {
    includeRecordings: true,
    includeScreenshots: true,
    includeDocumentation: true,
    includeExports: true,
    includeUploads: true,
    compressionLevel: 6,
    destination: { type: 'local', path: '' }
  };
  const [destinations, setDestinations] = useState<ExportDestination[]>([{
    type: 'local',
    path: ''
  }]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const [exportComplete, setExportComplete] = useState(false);
  const [exportedFilePath, setExportedFilePath] = useState('');
  const [copiedPath, setCopiedPath] = useState(false);

  const exportService = useMemo(() => new ProjectExportService(), []);

  useEffect(() => {
    if (isOpen && (!selectedProjectId || selectedProjectId === '') && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [isOpen, projects, selectedProjectId]);

  useEffect(() => {
    if (isOpen) {
      setExportComplete(false);
      setExportedFilePath('');
      setCopiedPath(false);
    }
  }, [isOpen]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleDestinationChange = (index: number, field: keyof ExportDestination, value: any) => {
    const newDestinations = [...destinations];
    newDestinations[index] = { ...newDestinations[index], [field]: value };
    setDestinations(newDestinations);
  };

  const addDestination = () => {
    setDestinations([...destinations, { type: 'local', path: '' }]);
  };

  const removeDestination = (index: number) => {
    if (destinations.length > 1) {
      setDestinations(destinations.filter((_, i) => i !== index));
    }
  };

  const selectLocalPath = async (index: number) => {
    try {
      const result = await window.electronAPI.backup.selectBackupDirectory();

      if (result && result.success && result.path) {
        setDestinations(prev => {
          const updated = prev.map((dest, i) =>
            i === index ? { ...dest, path: result.path } : dest
          );
          return updated;
        });
      } else if (result && result.canceled) {
        // User canceled the dialog, do nothing
        return;
      } else {
        toast.error('Failed to select directory');
      }
    } catch (error) {
      console.error('Error selecting backup directory:', error);
      toast.error('Failed to select directory');
    }
  };

  const handleExport = async () => {
    if (!selectedProject) {
      toast.error('Please select a project to export');
      return;
    }

    // Validate destinations
    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];
      if (dest.type === 'local' && !dest.path) {
        toast.error(`Please select a destination path for export ${i + 1}`);
        return;
      }
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Preparing export...');

    try {
      const progressHandler = (progress: number, status: string) => {
        setExportProgress(progress);
        setExportStatus(status);
      };

      const exportConfig = { ...exportOptions, destinations };

      const result = await exportService.exportProject(
        selectedProject.id,
        exportConfig,
        (progress) => progressHandler(progress.progress, progress.message)
      );

      // Use the actual file path returned by the export service
      if (result.paths && result.paths.length > 0) {
        setExportedFilePath(result.paths[0]);
      }

      setExportComplete(true);
      toast.success('Project exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
    }
  };

  const handleShowInFolder = async () => {
    if (exportedFilePath && window.electronAPI?.backup?.showItemInFolder) {
      try {
        await window.electronAPI.backup.showItemInFolder(exportedFilePath);
      } catch {
        // Fallback: try showing the destination folder
        const localDest = destinations.find(d => d.type === 'local');
        if (localDest?.path && window.electronAPI?.backup?.showItemInFolder) {
          await window.electronAPI.backup.showItemInFolder(localDest.path);
        }
      }
    }
  };

  const handleCopyPath = async () => {
    const pathToCopy = exportedFilePath || destinations.find(d => d.type === 'local')?.path || '';
    if (pathToCopy) {
      try {
        await navigator.clipboard.writeText(pathToCopy);
        setCopiedPath(true);
        toast.success('File path copied to clipboard');
        setTimeout(() => setCopiedPath(false), 2000);
      } catch {
        toast.error('Failed to copy path');
      }
    }
  };

  const handleClose = () => {
    setExportComplete(false);
    setExportedFilePath('');
    setCopiedPath(false);
    onClose();
  };

  const getDestinationIcon = (type: ExportDestination['type']) => {
    switch (type) {
      case 'local':
        return <HardDrive className="w-4 h-4" />;
      case 'sharepoint':
        return <Upload className="w-4 h-4" />;
      default:
        return <FolderOpen className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <Share2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Share Project</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Export your project as a .docfai file to share with others
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isExporting}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Export Complete — Share Actions */}
        {exportComplete ? (
          <div className="p-6">
            {/* Success banner */}
            <div className="flex items-center gap-3 p-4 mb-5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Project exported successfully!
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {selectedProject?.name}.docfai is ready to share
                </p>
              </div>
            </div>

            {/* Share actions */}
            <div className="space-y-3 mb-5">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Share your project file
              </h3>
              <button
                onClick={handleShowInFolder}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                  <ExternalLink className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Show in Folder</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Open the file location in your file explorer</p>
                </div>
              </button>
              <button
                onClick={handleCopyPath}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <div className="w-9 h-9 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                  {copiedPath ? (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {copiedPath ? 'Copied!' : 'Copy File Path'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Copy the file path to paste anywhere</p>
                </div>
              </button>
            </div>

            {/* Sharing hint */}
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                <span className="font-semibold">Tip:</span> Drag the .docfai file into your email, Slack, Teams, or cloud drive (Google Drive, OneDrive) to share it with others. They can import it into Docfai from their dashboard.
              </p>
            </div>
          </div>
        ) : (
          /* Export Form */
          <div className="p-6 space-y-6">
            {/* Project Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={isExporting}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Export Destinations */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Export Destinations
                </label>
                <button
                  onClick={addDestination}
                  disabled={isExporting}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  + Add Destination
                </button>
              </div>
              <div className="space-y-3">
                {destinations.map((destination, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center space-x-2">
                      {getDestinationIcon(destination.type)}
                      <select
                        value={destination.type}
                        onChange={(e) => handleDestinationChange(index, 'type', e.target.value)}
                        disabled={isExporting}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="local">Local</option>
                        <option value="sharepoint">SharePoint</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      {destination.type === 'local' ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={destination.path}
                            onChange={(e) => handleDestinationChange(index, 'path', e.target.value)}
                            placeholder="Select destination folder..."
                            disabled={isExporting}
                            className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            readOnly
                          />
                          <button
                            onClick={() => selectLocalPath(index)}
                            disabled={isExporting}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors text-sm"
                          >
                            Browse
                          </button>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={destination.path}
                          onChange={(e) => handleDestinationChange(index, 'path', e.target.value)}
                          placeholder={`Enter ${destination.type} path...`}
                          disabled={isExporting}
                          className="w-full px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      )}
                    </div>
                    {destinations.length > 1 && (
                      <button
                        onClick={() => removeDestination(index)}
                        disabled={isExporting}
                        className="p-1 text-red-500 hover:text-red-700 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Export Progress */}
            {isExporting && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {exportStatus}
                  </span>
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {exportProgress.toFixed(0)}% complete
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          {exportComplete ? (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={isExporting}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || !selectedProject || destinations.some(dest => dest.type === 'local' && !dest.path)}
                className={cn(
                    "px-4 py-2 rounded-lg transition-colors flex items-center space-x-2",
                    isExporting || !selectedProject || destinations.some(dest => dest.type === 'local' && !dest.path)
                      ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  )}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Export & Share</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectExportModal;
