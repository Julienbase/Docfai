export interface NotificationOptions {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number; // in milliseconds, 0 for persistent
  actions?: NotificationAction[];
  data?: any;
}

export interface NotificationAction {
  label: string;
  action: string;
  primary?: boolean;
}

export interface BackupNotificationData {
  scheduleId?: string;
  scheduleName?: string;
  projectId?: string;
  projectName?: string;
  backupId?: string;
  exportPaths?: string[];
  error?: string;
}

class NotificationService {
  private notifications: Map<string, NotificationOptions & { id: string; timestamp: number }> = new Map();
  private listeners: Set<(notification: NotificationOptions & { id: string }) => void> = new Set();
  private readonly MAX_NOTIFICATIONS = 100;

  constructor() {
    // Request notification permission on initialization
    this.requestPermission();
  }

  private async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  private generateId(): string {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupOldNotifications(): void {
    const notifications = Array.from(this.notifications.entries())
      .sort(([, a], [, b]) => b.timestamp - a.timestamp);

    if (notifications.length > this.MAX_NOTIFICATIONS) {
      const toRemove = notifications.slice(this.MAX_NOTIFICATIONS);
      for (const [id] of toRemove) {
        this.notifications.delete(id);
      }
    }
  }

  show(options: NotificationOptions): string {
    const id = this.generateId();
    const notification = {
      ...options,
      id,
      timestamp: Date.now()
    };

    this.notifications.set(id, notification);
    this.cleanupOldNotifications();

    // Notify listeners (for in-app notifications)
    this.listeners.forEach(listener => listener(notification));

    // Show system notification if permission granted
    this.showSystemNotification(notification);

    // Auto-dismiss if duration is set
    if (options.duration && options.duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, options.duration);
    }

    return id;
  }

  private async showSystemNotification(notification: NotificationOptions & { id: string }): Promise<void> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    try {
      const systemNotification = new Notification(notification.title, {
        body: notification.message,
        icon: this.getIconForType(notification.type),
        tag: notification.id,
        requireInteraction: notification.type === 'error'
      });

      systemNotification.onclick = () => {
        window.focus();
        systemNotification.close();
        
        // Handle notification actions
        if (notification.actions && notification.actions.length > 0) {
          const primaryAction = notification.actions.find(a => a.primary) || notification.actions[0];
          this.handleNotificationAction(primaryAction.action, notification.data);
        }
      };

      // Auto-close system notification after 5 seconds for success/info
      if (notification.type === 'success' || notification.type === 'info') {
        setTimeout(() => {
          systemNotification.close();
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to show system notification:', error);
    }
  }

  private getIconForType(type: string): string {
    // Return appropriate icon path based on type
    // These would be actual icon files in your public directory
    switch (type) {
      case 'success': return '/icons/success.png';
      case 'error': return '/icons/error.png';
      case 'warning': return '/icons/warning.png';
      case 'info': return '/icons/info.png';
      default: return '/icons/default.png';
    }
  }

  private handleNotificationAction(action: string, data?: any): void {
    switch (action) {
      case 'open_backup_history':
        // Navigate to backup history
        window.location.hash = '/account?tab=backup-history';
        break;
      case 'retry_backup':
        if (data?.scheduleId) {
          // Trigger backup retry
          this.retryBackup(data.scheduleId);
        }
        break;
      case 'open_backup_location':
        if (data?.exportPaths && data.exportPaths.length > 0) {
          // Open backup location in file explorer
          this.openBackupLocation(data.exportPaths[0]);
        }
        break;
      case 'dismiss':
        // Just dismiss - no action needed
        break;
      default:
        console.warn('Unknown notification action:', action);
    }
  }

  private async retryBackup(scheduleId: string): Promise<void> {
    try {
      // Import BackupSchedulerService dynamically to avoid circular dependency
      const BackupSchedulerService = (await import('./BackupSchedulerService')).default;
      const schedulerService = new BackupSchedulerService();
      await schedulerService.runScheduleNow(scheduleId);
    } catch (error) {
      console.error('Failed to retry backup:', error);
      this.showBackupError('Failed to retry backup', error as Error);
    }
  }

  private async openBackupLocation(path: string): Promise<void> {
    try {
      // TODO: Implement file location opening when ElectronAPI method is available
      console.log('Would open backup location:', path);
    } catch (error) {
      console.error('Failed to open backup location:', error);
    }
  }

  dismiss(id: string): void {
    this.notifications.delete(id);
  }

  dismissAll(): void {
    this.notifications.clear();
  }

  getNotifications(): Array<NotificationOptions & { id: string; timestamp: number }> {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getNotification(id: string): (NotificationOptions & { id: string; timestamp: number }) | undefined {
    return this.notifications.get(id);
  }

  onNotification(listener: (notification: NotificationOptions & { id: string }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Backup-specific notification methods
  showBackupStarted(data: BackupNotificationData): string {
    return this.show({
      title: 'Backup Started',
      message: `Backup for ${data.projectName || data.projectId} has started`,
      type: 'info',
      duration: 3000,
      data
    });
  }

  showBackupCompleted(data: BackupNotificationData): string {
    const actions: NotificationAction[] = [
      {
        label: 'View History',
        action: 'open_backup_history',
        primary: false
      }
    ];

    if (data.exportPaths && data.exportPaths.length > 0) {
      actions.unshift({
        label: 'Open Location',
        action: 'open_backup_location',
        primary: true
      });
    }

    return this.show({
      title: 'Backup Completed',
      message: `Backup for ${data.projectName || data.projectId} completed successfully`,
      type: 'success',
      duration: 5000,
      actions,
      data
    });
  }

  showBackupError(message: string, error: Error, data?: BackupNotificationData): string {
    const actions: NotificationAction[] = [
      {
        label: 'View History',
        action: 'open_backup_history',
        primary: false
      },
      {
        label: 'Dismiss',
        action: 'dismiss',
        primary: false
      }
    ];

    if (data?.scheduleId) {
      actions.unshift({
        label: 'Retry',
        action: 'retry_backup',
        primary: true
      });
    }

    return this.show({
      title: 'Backup Failed',
      message: `${message}: ${error.message}`,
      type: 'error',
      duration: 0, // Persistent for errors
      actions,
      data: { ...data, error: error.message }
    });
  }

  /**
   * Send a backup-specific notification
   */
  async sendBackupNotification(data: {
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    filePath?: string;
  }): Promise<void> {
    const notification: NotificationOptions = {
      type: data.type,
      title: data.title,
      message: data.message,
      actions: data.filePath ? [{
        label: 'Show File',
        action: 'show-file'
      }] : undefined
    };

    this.show(notification);
  }

  private async showFileInFolder(path: string): Promise<void> {
    try {
      // TODO: Implement file folder opening when ElectronAPI method is available
      console.log('Would show file in folder:', path);
    } catch (error) {
      console.error('Failed to show file in folder:', error);
    }
  }

  showBackupWarning(message: string, data?: BackupNotificationData): string {
    return this.show({
      title: 'Backup Warning',
      message,
      type: 'warning',
      duration: 8000,
      actions: [
        {
          label: 'View History',
          action: 'open_backup_history',
          primary: true
        }
      ],
      data
    });
  }

  showScheduleCreated(scheduleName: string): string {
    return this.show({
      title: 'Backup Schedule Created',
      message: `Schedule "${scheduleName}" has been created and activated`,
      type: 'success',
      duration: 4000
    });
  }

  showScheduleUpdated(scheduleName: string): string {
    return this.show({
      title: 'Backup Schedule Updated',
      message: `Schedule "${scheduleName}" has been updated`,
      type: 'info',
      duration: 3000
    });
  }

  showScheduleDeleted(scheduleName: string): string {
    return this.show({
      title: 'Backup Schedule Deleted',
      message: `Schedule "${scheduleName}" has been deleted`,
      type: 'info',
      duration: 3000
    });
  }

  showStorageWarning(usedSpace: number, totalSpace: number): string {
    const usagePercent = Math.round((usedSpace / totalSpace) * 100);
    
    return this.show({
      title: 'Storage Space Warning',
      message: `Backup storage is ${usagePercent}% full. Consider cleaning up old backups.`,
      type: 'warning',
      duration: 10000,
      actions: [
        {
          label: 'Manage Backups',
          action: 'open_backup_history',
          primary: true
        }
      ]
    });
  }

  showExportCompleted(projectName: string, exportPath: string): string {
    return this.show({
      title: 'Export Completed',
      message: `Project "${projectName}" exported successfully`,
      type: 'success',
      duration: 5000,
      actions: [
        {
          label: 'Open Location',
          action: 'open_backup_location',
          primary: true
        }
      ],
      data: { exportPaths: [exportPath] }
    });
  }

  showImportCompleted(projectName: string): string {
    return this.show({
      title: 'Import Completed',
      message: `Project "${projectName}" imported successfully`,
      type: 'success',
      duration: 4000
    });
  }

  showImportError(error: Error): string {
    return this.show({
      title: 'Import Failed',
      message: `Failed to import project: ${error.message}`,
      type: 'error',
      duration: 0,
      actions: [
        {
          label: 'Dismiss',
          action: 'dismiss',
          primary: true
        }
      ]
    });
  }

  // Utility methods for notification management
  getUnreadCount(): number {
    // In a real implementation, you might track read/unread status
    return this.notifications.size;
  }

  markAllAsRead(): void {
    // In a real implementation, you would mark notifications as read
    // For now, we'll just clear them
    this.dismissAll();
  }

  getNotificationsByType(type: string): Array<NotificationOptions & { id: string; timestamp: number }> {
    return this.getNotifications().filter(n => n.type === type);
  }

  hasPermission(): boolean {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  async enableNotifications(): Promise<boolean> {
    return await this.requestPermission();
  }
}

export { NotificationService };
export default NotificationService;