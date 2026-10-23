import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Clock,
  Settings,
  History,
  FolderOpen,
  Upload,
  AlertCircle,
  CheckCircle,
  Database,
  Play
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import BackupSchedulerService from '../services/BackupSchedulerService';
import { BackupHistoryService } from '../services/BackupHistoryService';
import { BackupSchedule } from '../services/BackupSchedulerService';
import { BackupRecord } from '../services/BackupHistoryService';

interface BackupSettingsProps {
  onOpenBackupHistory: () => void;
  onOpenAdvancedSettings: () => void;
}

// Module-level singletons — must not be created inside the component body,
// as the constructor starts a setInterval and re-renders would leak timers.
const backupScheduler = new BackupSchedulerService();
const backupHistory = new BackupHistoryService();

const BackupSettings: React.FC<BackupSettingsProps> = ({
  onOpenBackupHistory,
  onOpenAdvancedSettings
}) => {
  const { t } = useTranslation('accountPage');
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [destinations, setDestinations] = useState({
    local: true,
    sharepoint: false
  });
  const [backupPaths, setBackupPaths] = useState({
    local: '',
    sharepoint: ''
  });

  const [, setDefaultPaths] = useState<{
    local: string;
    sharepoint: string;
  }>({ local: '', sharepoint: '' });
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [recentBackups, setRecentBackups] = useState<BackupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scheduleTime, setScheduleTime] = useState<{
    hour: number;
    minute: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
  }>({
    hour: 2,
    minute: 0
  });
  const [nextBackupTime, setNextBackupTime] = useState<string>('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showSharePointModal, setShowSharePointModal] = useState(false);
  const [sharePointUrlInput, setSharePointUrlInput] = useState('');

  // Security Note: backupPaths contains non-sensitive configuration data (file paths, URLs)
  // No encryption needed as it doesn't contain credentials or personal data
  // Load backup paths from localStorage on mount
  useEffect(() => {
    const savedPaths = localStorage.getItem('backupPaths');
    if (savedPaths) {
      try {
        const parsedPaths = JSON.parse(savedPaths);
        setBackupPaths(parsedPaths);
      } catch (error) {
        console.error('Failed to load backup paths');
      }
    }
  }, []);

  // Save backup paths to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('backupPaths', JSON.stringify(backupPaths));
  }, [backupPaths]);

  const handlePathSelect = async (destinationType: keyof typeof backupPaths) => {
    try {
      let selectedPath = '';
      
      if (destinationType === 'local') {
        // Use folder browser for local storage
        const result = await window.electronAPI.backup.selectBackupDirectory();
        
        if (result.canceled) {
          return;
        }
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to select directory');
        }
        
        selectedPath = result.path || '';
      } else if (destinationType === 'sharepoint') {
        // Use modal for SharePoint URL
        setSharePointUrlInput(backupPaths.sharepoint || '');
        setShowSharePointModal(true);
        return;
      }
      
      if (selectedPath) {
        // Create updated backup paths object with the new path
        const updatedBackupPaths = {
          ...backupPaths,
          [destinationType]: selectedPath
        };

        // Selecting a path implicitly enables that destination
        const updatedDestinations = { ...destinations, [destinationType]: true };

        setBackupPaths(updatedBackupPaths);
        setDestinations(updatedDestinations);
        toast.success(`${destinationType} backup path updated`);

        // Update existing schedule if backup is enabled
        if (backupEnabled) {
          // Pass both updated values directly to avoid React stale-state closure issues
          await updateScheduleDestinations(updatedBackupPaths, updatedDestinations);

          // Force reload backup settings to ensure UI reflects the updated schedule
          await loadBackupSettings();
        }
      }
    } catch (error) {
      console.error('Failed to select backup path');
      toast.error(`Failed to select backup path for ${destinationType} storage`);
    }
  };

  const getDefaultBackupPath = async (destinationType: string): Promise<string> => {
    // Return empty strings for local paths to avoid showing hardcoded defaults
    // Only return placeholder path for SharePoint for reference
    switch (destinationType) {
      case 'local':
        // Return empty string - no default path for local storage
        return '';
      case 'sharepoint':
        return 'https://yourcompany.sharepoint.com/sites/yoursite/Shared Documents/Backups';
      default:
        // Return empty string for any other type
        return '';
    }
  };

  const updateScheduleDestinations = async (updatedPaths?: typeof backupPaths, updatedDestinations?: typeof destinations) => {
    const activeSchedule = schedules.find(s => s.enabled);
    if (!activeSchedule) {
      return;
    }

    // Use provided values or fall back to current state (avoids stale React closure)
    const pathsToUse = updatedPaths || backupPaths;
    const destsToUse = updatedDestinations || destinations;

    try {
      const destinationList = [];
      if (destsToUse.local) {
        // Use user-selected path only - don't fall back to default
        const localPath = pathsToUse.local || '';
        // Only add destination if path is not empty
        if (localPath.trim() !== '') {
          destinationList.push({ 
            type: 'local' as const, 
            path: localPath
          });
        }
      }
      if (destsToUse.sharepoint) {
        const sharepointPath = pathsToUse.sharepoint || await getDefaultBackupPath('sharepoint');
        destinationList.push({
          type: 'sharepoint' as const,
          path: sharepointPath
        });
      }

      const updatedSchedule = {
        ...activeSchedule,
        destinations: destinationList
      };
      await backupScheduler.updateSchedule(activeSchedule.id, updatedSchedule);
    } catch (error) {
      console.error('Failed to update schedule destinations');
    }
  };

  useEffect(() => {
    loadBackupSettings();
    loadRecentBackups();
    loadDefaultPaths();
  }, []);
  
  const loadDefaultPaths = async () => {
    try {
      const localPath = await getDefaultBackupPath('local');
      const sharepointPath = await getDefaultBackupPath('sharepoint');

      setDefaultPaths({
        local: localPath,
        sharepoint: sharepointPath
      });
    } catch (error) {
      console.error('Failed to load default paths');
    }
  };

  const loadBackupSettings = async () => {
    try {
      const allSchedules = await backupScheduler.getAllSchedules();
      setSchedules(allSchedules);
      
      // Check if there's an active schedule
      const activeSchedule = allSchedules.find(s => s.enabled);
      if (activeSchedule) {
        setBackupEnabled(true);
        setFrequency(activeSchedule.frequency);
        setDestinations({
          local: activeSchedule.destinations.some(d => d.type === 'local'),
          sharepoint: activeSchedule.destinations.some(d => d.type === 'sharepoint')
        });

        // Sync destination paths from schedule into backupPaths state.
        // The schedule is the source of truth — backupPaths localStorage may
        // be empty (e.g. after a clear) while the schedule still has the paths.
        const localDest = activeSchedule.destinations.find(d => d.type === 'local');
        const sharepointDest = activeSchedule.destinations.find(d => d.type === 'sharepoint');
        if (localDest?.path || sharepointDest?.path) {
          setBackupPaths(prev => ({
            local: prev.local || localDest?.path || '',
            sharepoint: prev.sharepoint || sharepointDest?.path || ''
          }));
        }

        // Load schedule time if available
        if (activeSchedule.scheduleTime) {
          setScheduleTime({
            hour: activeSchedule.scheduleTime.hour,
            minute: activeSchedule.scheduleTime.minute,
            dayOfWeek: activeSchedule.scheduleTime.dayOfWeek,
            dayOfMonth: activeSchedule.scheduleTime.dayOfMonth
          });
        }
        
        // Calculate and set next backup time
        updateNextBackupTime(activeSchedule);
      }
    } catch (error) {
      console.error('Failed to load backup settings');
      toast.error('Failed to load backup settings');
    }
  };

  const loadRecentBackups = async () => {
    try {
      const history = await backupHistory.getBackupHistory({ limit: 3 });
      setRecentBackups(history);
    } catch (error) {
      console.error('Failed to load recent backups');
    }
  };

  const handleToggleBackup = async (enabled: boolean) => {
    setIsLoading(true);
    try {
      if (enabled) {
        // Create a new backup schedule
        const destinationList = [];
        if (destinations.local) {
          // Use user-selected path only - don't fall back to default
          const localPath = backupPaths.local || '';
          // Only add destination if path is not empty
          if (localPath.trim() !== '') {
            destinationList.push({ 
              type: 'local' as const, 
              path: localPath
            });
          }
        }
        if (destinations.sharepoint) {
          const sharepointPath = backupPaths.sharepoint || await getDefaultBackupPath('sharepoint');
          destinationList.push({
            type: 'sharepoint' as const,
            path: sharepointPath
          });
        }

        const newSchedule = await backupScheduler.createSchedule({
          name: 'Default Backup Schedule',
          frequency,
          destinations: destinationList,
          projectIds: [], // All projects
          retentionDays: 30,
          enabled: true,
          scheduleTime,
          options: {
            includeRecordings: true,
            includeScreenshots: true,
            includeDocumentation: true,
            includeExports: true,
            includeUploads: true,
            compressionLevel: 6,
            destination: { type: 'local', path: '' }
          }
        });
        
        // Update next backup time preview
        updateNextBackupTime(newSchedule);
        
        toast.success('Automatic backup enabled');
      } else {
        // Disable all schedules
        for (const schedule of schedules) {
          if (schedule.enabled) {
            await backupScheduler.disableSchedule(schedule.id);
          }
        }
        
        toast.success('Automatic backup disabled');
      }
      
      setBackupEnabled(enabled);
      await loadBackupSettings();
    } catch (error) {
      console.error('Failed to toggle backup');
      toast.error('Failed to update backup settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFrequencyChange = async (newFrequency: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    setFrequency(newFrequency);
    
    // Reset day/date selection when frequency changes
    const updatedScheduleTime = { ...scheduleTime };
    if (newFrequency === 'weekly' && scheduleTime.dayOfWeek === undefined) {
      updatedScheduleTime.dayOfWeek = 1; // Default to Monday
    }
    if (newFrequency === 'monthly' && scheduleTime.dayOfMonth === undefined) {
      updatedScheduleTime.dayOfMonth = 1; // Default to 1st
    }
    setScheduleTime(updatedScheduleTime);
    
    if (backupEnabled) {
      // Update existing schedule
      const activeSchedule = schedules.find(s => s.enabled);
      if (activeSchedule) {
        try {
          const updatedSchedule = {
            ...activeSchedule,
            frequency: newFrequency,
            scheduleTime: updatedScheduleTime
          };
          
          await backupScheduler.updateSchedule(activeSchedule.id, updatedSchedule);
          updateNextBackupTime(updatedSchedule);
          toast.success('Backup frequency updated');
          await loadBackupSettings();
        } catch (error) {
          console.error('Failed to update frequency');
          toast.error('Failed to update backup frequency');
        }
      }
    } else {
      // Update preview for inactive schedule
      try {
        const previewSchedule: BackupSchedule = {
          id: 'preview',
          name: 'Preview',
          frequency: newFrequency,
          destinations: [],
          projectIds: [],
          retentionDays: 30,
          enabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          nextRunAt: new Date().toISOString(),
          options: {
            includeRecordings: true,
            includeScreenshots: true,
            includeDocumentation: true,
            includeExports: true,
            includeUploads: true,
            compressionLevel: 6,
            destination: { type: 'local', path: '' }
          },
          scheduleTime: updatedScheduleTime
        };
        updateNextBackupTime(previewSchedule);
      } catch (error) {
        console.error('Failed to update preview');
      }
    }
  };

  const handleDestinationChange = async (destination: keyof typeof destinations, enabled: boolean) => {
    // For local storage: if enabling and no path set, open folder picker first
    if (destination === 'local' && enabled && !backupPaths.local) {
      try {
        const result = await window.electronAPI.backup.selectBackupDirectory();
        if (result.canceled || !result.success || !result.path) {
          // User canceled folder picker — don't enable the checkbox
          return;
        }
        const updatedPaths = { ...backupPaths, local: result.path };
        setBackupPaths(updatedPaths);

        const newDestinations = { ...destinations, local: true };
        setDestinations(newDestinations);

        if (backupEnabled) {
          await updateScheduleDestinations(updatedPaths, newDestinations);
          await loadBackupSettings();
        }
        toast.success('Local backup path configured');
        return;
      } catch (error) {
        console.error('Failed to select backup directory');
        toast.error('Failed to select backup directory');
        return;
      }
    }

    // For SharePoint: if enabling and no path set, show modal for URL input
    if (destination === 'sharepoint' && enabled && !backupPaths.sharepoint) {
      setSharePointUrlInput('');
      setShowSharePointModal(true);
      return;
    }

    const newDestinations = { ...destinations, [destination]: enabled };
    setDestinations(newDestinations);

    if (backupEnabled) {
      // Update existing schedule
      const activeSchedule = schedules.find(s => s.enabled);
      if (activeSchedule) {
        try {
          const destinationList = [];
          if (newDestinations.local && backupPaths.local) {
            destinationList.push({
              type: 'local' as const,
              path: backupPaths.local
            });
          }
          if (newDestinations.sharepoint) {
            const sharepointPath = backupPaths.sharepoint || await getDefaultBackupPath('sharepoint');
            destinationList.push({
              type: 'sharepoint' as const,
              path: sharepointPath
            });
          }

          await backupScheduler.updateSchedule(activeSchedule.id, {
            ...activeSchedule,
            destinations: destinationList
          });
          toast.success('Backup destinations updated');
          await loadBackupSettings();
        } catch (error) {
          console.error('Failed to update destinations');
          toast.error('Failed to update backup destinations');
        }
      }
    }
  };

  const updateNextBackupTime = (schedule: BackupSchedule) => {
    try {
      const nextRun = backupScheduler.calculateNextRunTime(schedule);
      setNextBackupTime(nextRun.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }));
    } catch (error) {
      console.error('Failed to calculate next backup time');
      setNextBackupTime('');
    }
  };

  const handleSharePointUrlSave = async () => {
    const selectedPath = sharePointUrlInput.trim();

    if (!selectedPath) {
      toast.error('Please enter a SharePoint URL');
      return;
    }

    // Basic validation for SharePoint URL
    if (!selectedPath.includes('sharepoint.com')) {
      toast.error('Please enter a valid SharePoint URL');
      return;
    }

    const updatedPaths = { ...backupPaths, sharepoint: selectedPath };
    setBackupPaths(updatedPaths);

    const newDestinations = { ...destinations, sharepoint: true };
    setDestinations(newDestinations);

    if (backupEnabled) {
      await updateScheduleDestinations(updatedPaths);
      await loadBackupSettings();
    }

    setShowSharePointModal(false);
    setSharePointUrlInput('');
    toast.success('SharePoint backup path configured');
  };

  const handleBackupNow = async () => {
    if (!backupEnabled || isBackingUp) return;

    const activeSchedule = schedules.find(s => s.enabled);
    if (!activeSchedule) {
      toast.error('No active backup schedule found');
      return;
    }

    setIsBackingUp(true);
    try {
      toast.info('Starting manual backup...');
      await backupScheduler.runScheduleNow(activeSchedule.id);
      toast.success('Backup completed successfully!');
      await loadRecentBackups(); // Refresh the recent backups list
    } catch (error) {
      console.error('Manual backup failed');
      toast.error('Backup failed: ' + (error as Error).message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleScheduleTimeChange = async (field: string, value: number | string) => {
    const newScheduleTime = { ...scheduleTime, [field]: value };
    setScheduleTime(newScheduleTime);
    
    if (backupEnabled) {
      const activeSchedule = schedules.find(s => s.enabled);
      if (activeSchedule) {
        try {
          const updatedSchedule = {
            ...activeSchedule,
            scheduleTime: newScheduleTime
          };
          
          await backupScheduler.updateSchedule(activeSchedule.id, updatedSchedule);
          updateNextBackupTime(updatedSchedule);
          toast.success('Schedule time updated');
          await loadBackupSettings();
        } catch (error) {
          console.error('Failed to update schedule time');
          toast.error('Failed to update schedule time');
        }
      }
    } else {
      // Update preview for inactive schedule
      try {
        const previewSchedule: BackupSchedule = {
          id: 'preview',
          name: 'Preview',
          frequency,
          destinations: [],
          projectIds: [],
          retentionDays: 30,
          enabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          nextRunAt: new Date().toISOString(),
          options: {
            includeRecordings: true,
            includeScreenshots: true,
            includeDocumentation: true,
            includeExports: true,
            includeUploads: true,
            compressionLevel: 6,
            destination: { type: 'local', path: '' }
          },
          scheduleTime: newScheduleTime
        };
        updateNextBackupTime(previewSchedule);
      } catch (error) {
        console.error('Failed to update preview');
      }
    }
  };

  const getScheduleDescription = () => {
    const hour = scheduleTime.hour.toString().padStart(2, '0');
    const minute = scheduleTime.minute.toString().padStart(2, '0');
    const time = `${hour}:${minute}`;
    
    switch (frequency) {
      case 'daily':
        return `Every day at ${time}`;
      case 'weekly':
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[scheduleTime.dayOfWeek || 1];
        return `Every ${dayName} at ${time}`;
      case 'monthly':
        if (scheduleTime.dayOfMonth === -1) {
          return `Last day of every month at ${time}`;
        }
        const dayOfMonth = scheduleTime.dayOfMonth || 1;
        const suffix = dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
        return `${dayOfMonth}${suffix} of every month at ${time}`;
      default:
        return `Custom schedule at ${time}`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Backup Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{t('backupSettings.automaticBackup')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('backupSettings.automaticBackupDesc')}
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={backupEnabled}
            onChange={(e) => handleToggleBackup(e.target.checked)}
            disabled={isLoading}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {backupEnabled && (
        <>
          {/* Backup Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <Clock className="w-4 h-4 inline mr-2" />
              {t('backupSettings.backupFrequency')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'daily', label: t('backupSettings.daily') },
                { value: 'weekly', label: t('backupSettings.weekly') },
                { value: 'monthly', label: t('backupSettings.monthly') }
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleFrequencyChange(value as any)}
                  className={cn(
                    "p-3 border-2 rounded-lg transition-colors",
                    frequency === value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Time Scheduling */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('backupSettings.scheduleTime')}
              </h4>
              
              {/* Time Picker */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    {t('backupSettings.hour')}
                  </label>
                  <select
                    value={scheduleTime?.hour || 0}
                    onChange={(e) => handleScheduleTimeChange('hour', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => {
                      const date = new Date();
                      date.setHours(i, 0, 0, 0);
                      const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <option key={i} value={i}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    {t('backupSettings.minute')}
                  </label>
                  <select
                    value={scheduleTime?.minute || 0}
                    onChange={(e) => handleScheduleTimeChange('minute', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {[0, 15, 30, 45].map((minute) => (
                      <option key={minute} value={minute}>
                        :{minute.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day Selector for Weekly */}
              {frequency === 'weekly' && (
                <div className="mb-4">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                    {t('backupSettings.dayOfWeek')}
                  </label>
                  <div className="grid grid-cols-7 gap-1">
                    {[
                      { value: 0, label: 'Sun' },
                      { value: 1, label: 'Mon' },
                      { value: 2, label: 'Tue' },
                      { value: 3, label: 'Wed' },
                      { value: 4, label: 'Thu' },
                      { value: 5, label: 'Fri' },
                      { value: 6, label: 'Sat' }
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => handleScheduleTimeChange('dayOfWeek', value)}
                        className={cn(
                          "px-2 py-1 text-xs rounded transition-colors",
                          scheduleTime?.dayOfWeek === value
                            ? "bg-blue-500 text-white"
                            : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Selector for Monthly */}
              {frequency === 'monthly' && (
                <div className="mb-4">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                    {t('backupSettings.dayOfMonth')}
                  </label>
                  <select
                    value={scheduleTime?.dayOfMonth || 1}
                    onChange={(e) => handleScheduleTimeChange('dayOfMonth', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`} of the month
                      </option>
                    ))}
                    <option value={-1}>{t('backupSettings.lastDayOfMonth')}</option>
                  </select>
                </div>
              )}



              {/* Schedule Preview */}
              {nextBackupTime && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        {getScheduleDescription()}
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {t('backupSettings.nextBackup', { time: nextBackupTime })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Backup Destinations */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <Database className="w-4 h-4 inline mr-2" />
              {t('backupSettings.backupDestinations')}
            </label>
            <div className="space-y-3">
              {[
                { key: 'local', label: t('backupSettings.localStorage'), icon: <HardDrive className="w-4 h-4" />, description: t('backupSettings.localStorageDesc') },
                { key: 'sharepoint', label: t('backupSettings.sharepoint'), icon: <Upload className="w-4 h-4" />, description: t('backupSettings.sharepointDesc') }
              ].map(({ key, label, icon, description }) => {
                const isEnabled = destinations[key as keyof typeof destinations];
                const currentPath = backupPaths[key as keyof typeof backupPaths];

                return (
                  <div
                    key={key}
                    className={cn(
                      "border rounded-lg p-3 transition-colors",
                      isEnabled
                        ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10"
                        : "border-gray-200 dark:border-gray-600"
                    )}
                  >
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) => handleDestinationChange(key as keyof typeof destinations, e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          {icon}
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                      </div>
                    </label>

                    <div className="ml-7 mt-2 flex items-center justify-between gap-3">
                      <p
                        className={cn(
                          "text-xs truncate flex-1 min-w-0 px-2 py-1.5 rounded",
                          currentPath
                            ? "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700"
                            : "text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-750 italic"
                        )}
                        title={currentPath || undefined}
                      >
                        {currentPath || t('backupSettings.noFolderSelected')}
                      </p>
                      <button
                        onClick={() => handlePathSelect(key as keyof typeof backupPaths)}
                        className="flex-shrink-0 flex items-center space-x-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        <FolderOpen className="w-3 h-3" />
                        <span>{currentPath ? t('backupSettings.change') : t('backupSettings.select')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Recent Backups */}
      {recentBackups.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              <History className="w-4 h-4 inline mr-2" />
              Recent Backups
            </label>
            <button
              onClick={onOpenBackupHistory}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {recentBackups.map((backup) => (
              <div key={backup.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    backup.status === 'completed' ? "bg-green-500" :
                    backup.status === 'failed' ? "bg-red-500" : "bg-yellow-500"
                  )} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {backup.projectName || 'All Projects'}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {formatDate(backup.startedAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formatFileSize(backup.fileSize || 0)}
                  </p>
                  {backup.status === 'completed' && (
                    <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
                  )}
                  {backup.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-red-500 ml-auto" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleBackupNow}
          disabled={!backupEnabled || isBackingUp}
          className={`flex items-center justify-center px-4 py-2 rounded-lg transition-colors ${
            !backupEnabled || isBackingUp
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : 'bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300'
          }`}
        >
          <Play className={`w-4 h-4 mr-2 ${isBackingUp ? 'animate-pulse' : ''}`} />
          {isBackingUp ? 'Backing up...' : t('backupSettings.backupNow')}
        </button>
        <button
          onClick={onOpenBackupHistory}
          className="flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <History className="w-4 h-4 mr-2" />
          {t('backupSettings.backupHistory')}
        </button>
        <button
          onClick={onOpenAdvancedSettings}
          className="flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <Settings className="w-4 h-4 mr-2" />
          {t('backupSettings.advancedSettings')}
        </button>
      </div>

      {/* SharePoint URL Input Modal */}
      {showSharePointModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Configure SharePoint Backup
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter your SharePoint site URL or document library path where backups will be saved.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                SharePoint URL
              </label>
              <input
                type="text"
                value={sharePointUrlInput}
                onChange={(e) => setSharePointUrlInput(e.target.value)}
                placeholder="https://yourcompany.sharepoint.com/sites/yoursite/Shared Documents/Backups"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSharePointUrlSave();
                  }
                }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Example: https://company.sharepoint.com/sites/team/Shared Documents/Backups
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowSharePointModal(false);
                  setSharePointUrlInput('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSharePointUrlSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupSettings;