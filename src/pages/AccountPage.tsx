import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Shield,
  Monitor,
  Palette,
  Download,
  Trash2,
  Edit3,
  Save,
  X,
  Calendar,
  BarChart3,
  FileText,
  Video,
  Clock,
  Key,
  Mail,
  ArrowLeft,
  HardDrive,
  History,
  FolderOpen,
  Archive,
  Info,
  MessageSquare,
  FileDown,
  Globe
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '../utils/logger';
import { toast } from 'sonner';
import { useAppStore } from '../store/useAppStore';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { cn } from '../lib/utils';
import BackupSettings from '../components/BackupSettings';
import { errorLogService } from '../services/ErrorLogService';

const logger = createLogger("AccountPage");

const ISSUES_URL = 'https://github.com/Julienbase/Docfai/issues';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  avatar?: string;
}

interface UsageStats {
  recordingsThisMonth: number;
  totalRecordings: number;
  documentsGenerated: number;
  hoursRecorded: number;
}

const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    settings,
    projects,
    totalExportCount,
    updateUser,
    updateSettings
  } = useAppStore();
  const [activeTab, setActiveTab] = useState('settings');
  const { t: tCommon } = useTranslation('common');
  const { t } = useTranslation('accountPage');
  const [tempSettings, setTempSettings] = useState(settings);
  const [appVersion, setAppVersion] = useState('...');

  // Fetch app version from Electron on mount
  useEffect(() => {
    const fetchVersion = async () => {
      if (window.electronAPI?.getAppVersion) {
        try {
          const { version } = await window.electronAPI.getAppVersion();
          setAppVersion(`v${version}`);
        } catch (error) {
          logger.error('Failed to fetch app version:', error);
          setAppVersion('unknown');
        }
      }
    };
    fetchVersion();
  }, []);
  // Calculate real usage statistics from projects and recordings
  const calculateUsageStats = (): UsageStats => {
    
    // Get current month start
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let totalRecordings = 0;
    let recordingsThisMonth = 0;
    let totalDurationSeconds = 0;

    projects.forEach(project => {
      // Count total recordings
      totalRecordings += project.recordings.length;

      // Count recordings this month
      project.recordings.forEach(recording => {
        const recordingDate = new Date(recording.createdAt);
        if (recordingDate >= monthStart) {
          recordingsThisMonth++;
        }
        // Sum up total duration
        totalDurationSeconds += recording.duration || 0;
      });
    });
    
    // Convert seconds to hours
    const hoursRecorded = Math.round((totalDurationSeconds / 3600) * 10) / 10;
    
    return {
      recordingsThisMonth,
      totalRecordings,
      documentsGenerated: totalExportCount,
      hoursRecorded
    };
  };
  
  const [usageStats, setUsageStats] = useState<UsageStats>(calculateUsageStats());
  const [showBackupHistoryModal, setShowBackupHistoryModal] = useState(false);
  const [showAdvancedBackupModal, setShowAdvancedBackupModal] = useState(false);
  const [showExportLogsModal, setShowExportLogsModal] = useState(false);
  
  // Real backup history data
  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Advanced Backup Settings state
  const [advancedSettings, setAdvancedSettings] = useState({
    retentionDays: 30,
    maxBackupCount: 10,
    enableCompression: true,
    compressionLevel: 'balanced',
    backupAllProjects: true,
    includeRecordings: true,
    includeScreenshots: true,
    includeDocumentation: true,
    notifySuccess: true,
    notifyFailure: true,
    notifyCleanup: false,
    limitUploadSpeed: false,
    maxUploadSpeed: 5
  });

  // Load backup history when modal opens
  useEffect(() => {
    if (showBackupHistoryModal) {
      loadBackupHistory();
    }
  }, [showBackupHistoryModal]);

  // Load advanced settings when modal opens
  useEffect(() => {
    if (showAdvancedBackupModal) {
      loadAdvancedSettings();
    }
  }, [showAdvancedBackupModal]);

  const loadBackupHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const backupHistoryService = new (await import('../services/BackupHistoryService')).BackupHistoryService();
      const records = backupHistoryService.getBackupHistory({ limit: 50 });
      
      // Transform BackupRecord to match the expected format
      const transformedRecords = records.map(record => ({
        id: record.id,
        date: new Date(record.completedAt).toLocaleString(),
        status: record.status,
        destination: record.destinations.map(d => d.path ? `${d.type}: ${d.path}` : d.type).join(', ') || 'Unknown',
        size: record.fileSize ? `${(record.fileSize / (1024 * 1024)).toFixed(1)} MB` : 'Unknown',
        project: record.projectName || record.projectId,
        exportPaths: record.exportPaths || [],
        error: record.error
      }));
      
      setBackupHistory(transformedRecords);
    } catch (error) {
      logger.error('Failed to load backup history:', error);
      setHistoryError('Failed to load backup history. Please try again.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Security Note: advancedBackupSettings contains non-sensitive preferences (retention, compression, notifications)
  // No encryption needed as it doesn't contain credentials or personal data
  const loadAdvancedSettings = () => {
    try {
      const savedSettings = localStorage.getItem('advancedBackupSettings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        setAdvancedSettings(prev => ({ ...prev, ...parsedSettings }));
      }
    } catch (error) {
      logger.error('Failed to load advanced backup settings:', error);
    }
  };

  const saveAdvancedSettings = () => {
    try {
      localStorage.setItem('advancedBackupSettings', JSON.stringify(advancedSettings));
      toast.success(t('toast.settingsSaved'));
      setShowAdvancedBackupModal(false);
    } catch (error) {
      logger.error('Failed to save advanced backup settings:', error);
      toast.error(t('toast.settingsFailed'));
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    try {
      const backupHistoryService = new (await import('../services/BackupHistoryService')).BackupHistoryService();
      await backupHistoryService.deleteBackupRecord(backupId);
      await loadBackupHistory(); // Reload the list
      toast.success(t('toast.backupDeleted'));
    } catch (error) {
      logger.error('Failed to delete backup record:', error);
      toast.error(t('toast.backupDeleteFailed'));
    }
  };

  useEffect(() => {
    // Recalculate usage stats when projects change
    setUsageStats(calculateUsageStats());
  }, [projects]);

  // Support: the open-source project uses GitHub Issues
  const openIssues = () => {
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(ISSUES_URL);
    } else {
      window.open(ISSUES_URL, '_blank');
    }
  };

  const handleContactSupport = openIssues;


  const handleExportErrorLogs = async () => {
    if (window.electronAPI) {
      try {
        // Close the modal
        setShowExportLogsModal(false);

        // Get renderer error logs from ErrorLogService
        const rendererLogs = errorLogService.getLogsAsText();

        // Call IPC with renderer logs
        const result = await window.electronAPI.exportErrorLogs(rendererLogs);

        // If user canceled the save dialog
        if (result.canceled) {
          return;
        }

        if (result.success && result.filePath) {
          toast.success(t('toast.logsSaved'));

          // Open GitHub Issues so the user can attach the exported log file
          openIssues();
        } else {
          toast.error(t('toast.logsFailed'));
        }
      } catch (error) {
        logger.error('Failed to export error logs:', error);
        toast.error(t('toast.logsFailed'));
      }
    } else {
      toast.error(t('toast.desktopOnly'));
    }
  };

  const tabs = [
    { id: 'backup', name: t('tabs.backup'), icon: <HardDrive className="w-4 h-4" /> },
    { id: 'settings', name: t('tabs.settings'), icon: <Settings className="w-4 h-4" /> },
    { id: 'usage', name: t('tabs.usage'), icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'support', name: t('tabs.support'), icon: <Shield className="w-4 h-4" /> }
  ];

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('header.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t('header.subtitle')}
            </p>
          </div>
        </div>
        
        {/* Premium badge removed - implement subscription checking logic */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <nav className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-left",
                    activeTab === tab.id
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}
                >
                  {tab.icon}
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* General Settings */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('settings.general')}
                </h2>

                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      <Palette className="w-4 h-4 inline mr-2" />
                      {tCommon('theme.label')}
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['light', 'dark', 'system'] as const).map((theme) => (
                        <button
                          key={theme}
                          onClick={() => setTempSettings(prev => ({ ...prev, theme }))}
                          className={cn(
                            "p-3 border-2 rounded-lg transition-colors text-gray-900 dark:text-white",
                            tempSettings.theme === theme
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700"
                          )}
                        >
                          {tCommon(`theme.${theme}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      <Globe className="w-4 h-4 inline mr-2" />
                      {tCommon('language.label')}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {SUPPORTED_LANGUAGES.map((lng) => (
                        <button
                          key={lng}
                          onClick={() => setTempSettings(prev => ({ ...prev, language: lng as SupportedLanguage }))}
                          className={cn(
                            "p-3 border-2 rounded-lg transition-colors text-sm font-medium text-gray-900 dark:text-white",
                            tempSettings.language === lng
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700"
                          )}
                        >
                          {tCommon(`language.${lng}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recording Settings */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      <Video className="w-4 h-4 inline mr-2" />
                      {t('settings.recordingDefaults')}
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">{t('settings.quality')}</label>
                        <select
                          value={tempSettings.recordingSettings.defaultQuality}
                          onChange={(e) => setTempSettings(prev => ({
                            ...prev,
                            recordingSettings: {
                              ...prev.recordingSettings,
                              defaultQuality: e.target.value as any
                            }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        >
                          <option value="fhd">1080p Full HD</option>
                          <option value="2k">1440p 2K (QHD)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">{t('settings.frameRate')}</label>
                        <select
                          value={tempSettings.recordingSettings.defaultFps}
                          onChange={(e) => setTempSettings(prev => ({
                            ...prev,
                            recordingSettings: {
                              ...prev.recordingSettings,
                              defaultFps: parseInt(e.target.value) as any
                            }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        >
                          <option value={30}>30 FPS</option>
                          <option value={60}>60 FPS</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => { updateSettings(tempSettings); toast.success(t('settings.saved')); }}
                    className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {t('settings.saveSettings')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Usage Tab */}
          {activeTab === 'usage' && (
            <div className="space-y-6">
              {/* Usage Overview */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('usage.title')}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  {[
                    {
                      label: t('usage.recordingsThisMonth'),
                      value: usageStats.recordingsThisMonth,
                      icon: <Video className="w-5 h-5" />,
                      color: 'blue'
                    },
                    {
                      label: t('usage.totalRecordings'),
                      value: usageStats.totalRecordings,
                      icon: <FileText className="w-5 h-5" />,
                      color: 'green'
                    },
                    {
                      label: t('usage.documentsGenerated'),
                      value: usageStats.documentsGenerated,
                      icon: <FileText className="w-5 h-5" />,
                      color: 'purple'
                    },
                    {
                      label: t('usage.hoursRecorded'),
                      value: usageStats.hoursRecorded,
                      icon: <Clock className="w-5 h-5" />,
                      color: 'orange'
                    }
                  ].map(({ label, value, icon, color }) => (
                    <div key={label} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
                        color === 'blue' && "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
                        color === 'green' && "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
                        color === 'purple' && "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400",
                        color === 'orange' && "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400"
                      )}>
                        {icon}
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
                

              </div>
            </div>
          )}

          {/* Support Tab */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              {/* App Information */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('support.appInfo')}
                </h2>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('support.version')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('support.versionDesc')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {appVersion}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Support */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('support.contactSupport')}
                </h2>

                <div className="space-y-4">
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('support.supportDesc')}
                  </p>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                        <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('support.emailSupport')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('support.emailAddress')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleContactSupport}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>{t('support.contact')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Troubleshooting Tools */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('support.troubleshooting')}
                </h2>

                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {tCommon('settings.exportLogs') || 'Export error logs to help diagnose issues.'}
                  </p>

                  <button
                    onClick={() => setShowExportLogsModal(true)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                        <FileDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('support.exportLogs')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('support.exportLogsDesc')}
                        </p>
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Backup & Export Tab */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <HardDrive className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('backup.title')}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('backup.subtitle')}
                    </p>
                  </div>
                </div>
                <BackupSettings
                  onOpenBackupHistory={() => setShowBackupHistoryModal(true)}
                  onOpenAdvancedSettings={() => setShowAdvancedBackupModal(true)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Backup History Modal */}
      {showBackupHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('backupHistory.title')}
                </h3>
              </div>
              <button
                onClick={() => setShowBackupHistoryModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[60vh]">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-400">{t('backupHistory.loading')}</span>
                </div>
              ) : historyError ? (
                <div className="text-center py-8">
                  <div className="text-red-600 dark:text-red-400 mb-2">{historyError}</div>
                  <button
                    onClick={loadBackupHistory}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {t('backupHistory.retry')}
                  </button>
                </div>
              ) : backupHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{t('backupHistory.empty')}</p>
                  <p className="text-sm mt-1">{t('backupHistory.emptyDesc')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {backupHistory.map((backup) => (
                    <div key={backup.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {backup.project}
                            </span>
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              backup.status === 'completed'
                                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                            )}>
                              {backup.status}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                            <div>{t('backupHistory.date')} {backup.date}</div>
                            <div>{t('backupHistory.destination')} {backup.destination}</div>
                            <div>{t('backupHistory.size')} {backup.size}</div>
                            {backup.error && (
                              <div className="text-red-600 dark:text-red-400 mt-1">
                                Error: {backup.error}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {backup.exportPaths && backup.exportPaths.length > 0 && (
                            <>
                              <button
                                className="p-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                title={t('backupHistory.download')}
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                className="p-2 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                                title={t('backupHistory.openFolder')}
                              >
                                <FolderOpen className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteBackup(backup.id)}
                            className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            title={t('backupHistory.deleteRecord')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={() => setShowBackupHistoryModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                {t('backupHistory.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Backup Settings Modal */}
      {showAdvancedBackupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('advancedBackupSettings.title')}
                </h3>
              </div>
              <button
                onClick={() => setShowAdvancedBackupModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[60vh] space-y-6">
              {/* Retention Policy */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">{t('advancedBackupSettings.retentionPolicy')}</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.keepBackupsFor')}</label>
                    <select
                      value={advancedSettings.retentionDays}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, retentionDays: parseInt(e.target.value) }))}
                      className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">1 year</option>
                      <option value="-1">Forever</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.maxBackupCount')}</label>
                    <input 
                      type="number" 
                      value={advancedSettings.maxBackupCount}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, maxBackupCount: parseInt(e.target.value) || 1 }))}
                      min="1" 
                      max="100"
                      className="w-20 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              
              {/* Compression Settings */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">{t('advancedBackupSettings.compression')}</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.enableCompression')}</label>
                    <input
                      type="checkbox"
                      checked={advancedSettings.enableCompression}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, enableCompression: e.target.checked }))}
                      className="rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.compressionLevel')}</label>
                    <select
                      value={advancedSettings.compressionLevel}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, compressionLevel: e.target.value }))}
                      className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="fast">{t('advancedBackupSettings.fast')}</option>
                      <option value="balanced">{t('advancedBackupSettings.balanced')}</option>
                      <option value="maximum">{t('advancedBackupSettings.maximum')}</option>
                    </select>
                  </div>
                </div>
              </div>
              

              
              {/* Notification Settings */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">{t('advancedBackupSettings.notifications')}</h4>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="notify-success"
                      checked={advancedSettings.notifySuccess}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, notifySuccess: e.target.checked }))}
                    />
                    <label htmlFor="notify-success" className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.notifySuccess')}</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="notify-failure"
                      checked={advancedSettings.notifyFailure}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, notifyFailure: e.target.checked }))}
                    />
                    <label htmlFor="notify-failure" className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.notifyFailure')}</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="notify-cleanup"
                      checked={advancedSettings.notifyCleanup}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, notifyCleanup: e.target.checked }))}
                    />
                    <label htmlFor="notify-cleanup" className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.notifyCleanup')}</label>
                  </div>
                </div>
              </div>
              
              {/* Bandwidth Settings */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">{t('advancedBackupSettings.bandwidth')}</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.limitUploadSpeed')}</label>
                    <input
                      type="checkbox"
                      checked={advancedSettings.limitUploadSpeed}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, limitUploadSpeed: e.target.checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700 dark:text-gray-300">{t('advancedBackupSettings.maxUploadSpeed')}</label>
                    <input 
                      type="number" 
                      value={advancedSettings.maxUploadSpeed}
                      onChange={(e) => setAdvancedSettings(prev => ({ ...prev, maxUploadSpeed: parseInt(e.target.value) || 1 }))}
                      min="1" 
                      max="100"
                      className="w-20 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={() => setShowAdvancedBackupModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('advancedBackupSettings.cancel')}
              </button>
              <button
                onClick={saveAdvancedSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('advancedBackupSettings.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Error Logs Modal */}
      {showExportLogsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <FileDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('support.exportErrorLogsModal.title')}
                </h3>
              </div>
              <button
                onClick={() => setShowExportLogsModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300">
                {t('support.exportErrorLogsModal.instructions')}
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold">
                    1
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('support.exportErrorLogsModal.step1Title')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {t('support.exportErrorLogsModal.step1Desc')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold">
                    2
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('support.exportErrorLogsModal.step2Title')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {t('support.exportErrorLogsModal.step2Desc')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold">
                    3
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('support.exportErrorLogsModal.step3Title')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {t('support.exportErrorLogsModal.step3Desc')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold">
                    4
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('support.exportErrorLogsModal.step4Title')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {t('support.exportErrorLogsModal.step4Desc')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> {t('support.exportErrorLogsModal.note')}
                </p>
              </div>
            </div>

            <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={() => setShowExportLogsModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('support.exportErrorLogsModal.cancel')}
              </button>
              <button
                onClick={handleExportErrorLogs}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <FileDown className="w-4 h-4" />
                <span>{t('support.exportErrorLogsModal.export')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default AccountPage;
