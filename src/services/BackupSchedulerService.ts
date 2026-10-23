// Using native Date methods instead of date-fns to avoid import issues
import ProjectExportService, { ExportOptions, ExportDestination } from './ProjectExportService';
import { BackupHistoryService } from './BackupHistoryService';
import { NotificationService } from './NotificationService';
import { useAppStore } from '../store/useAppStore';

export interface ScheduleTime {
  hour: number; // 0-23
  minute: number; // 0-59
  dayOfWeek?: number; // 0-6 (Sunday=0) for weekly schedules
  dayOfMonth?: number; // 1-31 or -1 for last day of month
}

export interface BackupSchedule {
  id: string;
  name: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  customInterval?: number; // in hours
  scheduleTime?: ScheduleTime; // specific time scheduling
  projectIds: string[]; // empty array means all projects
  destinations: ExportDestination[];
  options: ExportOptions;
  nextRunAt: string;
  lastRunAt?: string;
  retentionDays: number; // 0 means keep forever
  createdAt: string;
  updatedAt: string;
}

export interface BackupJob {
  id: string;
  scheduleId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
  exportPath?: string;
}

class BackupSchedulerService {
  private exportService: ProjectExportService;
  private historyService: BackupHistoryService;
  private notificationService: NotificationService;
  private schedules: Map<string, BackupSchedule> = new Map();
  private runningJobs: Map<string, BackupJob> = new Map();
  private runningSchedules: Set<string> = new Set();
  private intervalId: NodeJS.Timeout | null = null;
  private readonly STORAGE_KEY = 'backup_schedules';
  private readonly CHECK_INTERVAL = 60000; // Check every minute

  constructor() {
    this.exportService = new ProjectExportService();
    this.historyService = new BackupHistoryService();
    this.notificationService = new NotificationService();
    this.loadSchedules();
    this.startScheduler();
  }

  private async loadSchedules(): Promise<void> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const schedulesData = JSON.parse(stored);
        for (const schedule of schedulesData) {
          this.schedules.set(schedule.id, schedule);
        }
      }
    } catch (error) {
      console.error('Failed to load backup schedules:', error);
    }
  }

  private async saveSchedules(): Promise<void> {
    try {
      const schedulesArray = Array.from(this.schedules.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(schedulesArray));
    } catch (error) {
      console.error('Failed to save backup schedules:', error);
    }
  }

  private startScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.checkAndRunSchedules();
    }, this.CHECK_INTERVAL);
  }

  private async checkAndRunSchedules(): Promise<void> {
    const now = new Date();
    
    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled) continue;
      
      const nextRun = new Date(schedule.nextRunAt);
      if (now >= nextRun) {
        await this.executeSchedule(schedule);
      }
    }
  }

  private async executeSchedule(schedule: BackupSchedule): Promise<void> {
    if (this.runningSchedules.has(schedule.id)) {
      console.log(`[BACKUP] Schedule ${schedule.id} already running, skipping concurrent execution`);
      return;
    }
    this.runningSchedules.add(schedule.id);
    try {
      // Get projects to backup
      const projectIds = schedule.projectIds.length > 0
        ? schedule.projectIds
        : await this.getAllProjectIds();

      // Create backup jobs
      const jobs: BackupJob[] = [];
      for (const projectId of projectIds) {
        const job: BackupJob = {
          id: this.generateId(),
          scheduleId: schedule.id,
          projectId,
          status: 'pending'
        };
        jobs.push(job);
        this.runningJobs.set(job.id, job);
      }

      // Execute jobs
      const results = await Promise.allSettled(
        jobs.map(job => this.executeBackupJob(job, schedule))
      );

      // Update schedule
      schedule.lastRunAt = new Date().toISOString();
      schedule.nextRunAt = this.calculateNextRun(schedule).toISOString();
      this.schedules.set(schedule.id, schedule);
      await this.saveSchedules();

      // Clean up old backups if retention is set
      if (schedule.retentionDays > 0) {
        await this.cleanupOldBackups(schedule);
      }

      // Send notification
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      
      await this.notificationService.sendBackupNotification({
        type: failureCount === 0 ? 'success' : 'info',
        title: 'Scheduled Backup Completed',
        message: `Schedule "${schedule.name}": ${successCount} projects backed up successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`
      });

    } catch (error) {
      console.error('Failed to execute backup schedule:', error);
      await this.notificationService.sendBackupNotification({
        type: 'error',
        title: 'Backup Failed',
        message: `Failed to backup project for schedule "${schedule.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      this.runningSchedules.delete(schedule.id);
    }
  }

  private async executeBackupJob(job: BackupJob, schedule: BackupSchedule): Promise<void> {
    try {
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      this.runningJobs.set(job.id, job);

      // Execute backup for each destination
      const exportPaths: string[] = [];
      let totalFileSize = 0;
      console.log('[DEBUG-BACKUP] Schedule destinations:', schedule.destinations);
      for (const destination of schedule.destinations) {
        console.log('[DEBUG-BACKUP] Processing destination:', destination);
        const { paths, totalSize } = await this.exportService.exportProject(
          job.projectId,
          { ...schedule.options, destination },
          (progress) => {
            // Update job progress if needed
          }
        );
        exportPaths.push(...paths);
        totalFileSize += totalSize;
      }

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.exportPath = exportPaths.join(', ');
      this.runningJobs.set(job.id, job);

      // Record in history
      await this.historyService.recordBackup({
        id: this.generateId(),
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        projectId: job.projectId,
        status: 'completed',
        startedAt: job.startedAt!,
        completedAt: job.completedAt,
        exportPaths,
        fileSize: totalFileSize,
        destinations: schedule.destinations
      });

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date().toISOString();
      this.runningJobs.set(job.id, job);

      // Record failure in history
      await this.historyService.recordBackup({
        id: this.generateId(),
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        projectId: job.projectId,
        status: 'failed',
        startedAt: job.startedAt!,
        completedAt: job.completedAt!,
        error: job.error,
        destinations: schedule.destinations
      });

      throw error;
    } finally {
      // Clean up completed job after some time
      setTimeout(() => {
        this.runningJobs.delete(job.id);
      }, 300000); // 5 minutes
    }
  }

  private calculateNextRun(schedule: BackupSchedule): Date {
    const now = new Date();
    
    // If no specific time is set, use the old logic
    if (!schedule.scheduleTime) {
      switch (schedule.frequency) {
        case 'daily':
          const nextDay = new Date(now);
          nextDay.setDate(now.getDate() + 1);
          return nextDay;
        case 'weekly':
          const nextWeek = new Date(now);
          nextWeek.setDate(now.getDate() + 7);
          return nextWeek;
        case 'monthly':
          const nextMonth = new Date(now);
          nextMonth.setMonth(now.getMonth() + 1);
          return nextMonth;
        case 'custom':
          const hours = schedule.customInterval || 24;
          return new Date(now.getTime() + hours * 60 * 60 * 1000);
        default:
          const defaultNextDay = new Date(now);
          defaultNextDay.setDate(now.getDate() + 1);
          return defaultNextDay;
      }
    }

    const { hour, minute, dayOfWeek, dayOfMonth } = schedule.scheduleTime;
    let nextRun: Date;

    switch (schedule.frequency) {
      case 'daily':
        nextRun = this.calculateNextDailyRun(now, hour, minute);
        break;
      case 'weekly':
        nextRun = this.calculateNextWeeklyRun(now, hour, minute, dayOfWeek || 0);
        break;
      case 'monthly':
        nextRun = this.calculateNextMonthlyRun(now, hour, minute, dayOfMonth || 1);
        break;
      case 'custom':
        const intervalHours = schedule.customInterval || 24;
        nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
        break;
      default:
        nextRun = this.calculateNextDailyRun(now, hour, minute);
    }

    return nextRun;
  }

  private calculateNextDailyRun(now: Date, hour: number, minute: number): Date {
    // Set the target time for today
    let targetDate = new Date(now);
    let nextRun = new Date(targetDate);
       nextRun.setHours(hour, minute, 0, 0);
    
    // If the time has already passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    return nextRun;
  }

  private calculateNextWeeklyRun(now: Date, hour: number, minute: number, targetDayOfWeek: number): Date {
    // Find the next occurrence of the target day
    let targetDate = new Date(now);
    const currentDay = targetDate.getDay();
    const daysUntilTarget = (targetDayOfWeek - currentDay + 7) % 7;
    
    if (daysUntilTarget === 0) {
      // It's the target day - check if time has passed
      let nextRun = new Date(targetDate);
     nextRun.setHours(hour, minute, 0, 0);
      if (nextRun <= now) {
        // Time has passed, schedule for next week
        nextRun.setDate(nextRun.getDate() + 7);
      }
      return nextRun;
    } else {
      // Schedule for the next occurrence of the target day
      targetDate.setDate(targetDate.getDate() + daysUntilTarget);
      const result = new Date(targetDate);
       result.setHours(hour, minute, 0, 0);
       return result;
    }
  }

  private calculateNextMonthlyRun(now: Date, hour: number, minute: number, dayOfMonth: number): Date {
    let targetDate: Date;
    
    if (dayOfMonth === -1) {
      // Last day of month
      targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else {
      // Specific day of month
      const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const targetDay = Math.min(dayOfMonth, daysInCurrentMonth);
      targetDate = new Date(now);
      targetDate.setDate(targetDay);
    }
    
    // Set the target time
    let nextRun = new Date(targetDate);
    nextRun.setHours(hour, minute, 0, 0);
    
    // If the target time has already passed this month, schedule for next month
    if (nextRun <= now) {
      // Use day 1 to safely advance the month (avoids Jan 31 → setMonth(1) wrapping to Mar 3)
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      if (dayOfMonth === -1) {
        targetDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
      } else {
        const daysInNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        const targetDay = Math.min(dayOfMonth, daysInNextMonth);
        targetDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), targetDay);
      }
      
      nextRun = new Date(targetDate);
      nextRun.setHours(hour, minute, 0, 0);
    }
    
    return nextRun;
  }

  private async getAllProjectIds(): Promise<string[]> {
    // Get all project IDs from the app store
    const { projects } = useAppStore.getState();
    return projects.map(project => project.id);
  }

  private async cleanupOldBackups(schedule: BackupSchedule): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - schedule.retentionDays);
    
    await this.historyService.cleanupOldBackups(schedule.id, cutoffDate.toISOString());
  }

  private generateId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods

  async createSchedule(scheduleData: Omit<BackupSchedule, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt'>): Promise<BackupSchedule> {
    const schedule: BackupSchedule = {
      ...scheduleData,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextRunAt: this.calculateNextRun(scheduleData as BackupSchedule).toISOString()
    };

    this.schedules.set(schedule.id, schedule);
    await this.saveSchedules();
    
    return schedule;
  }

  async updateSchedule(id: string, updates: Partial<BackupSchedule>): Promise<BackupSchedule> {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const updatedSchedule = {
      ...schedule,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Recalculate next run if frequency or interval changed
    if (updates.frequency || updates.customInterval) {
      updatedSchedule.nextRunAt = this.calculateNextRun(updatedSchedule).toISOString();
    }

    this.schedules.set(id, updatedSchedule);
    await this.saveSchedules();
    
    return updatedSchedule;
  }

  async deleteSchedule(id: string): Promise<void> {
    if (!this.schedules.has(id)) {
      throw new Error('Schedule not found');
    }

    this.schedules.delete(id);
    await this.saveSchedules();
    
    // Clean up history for this schedule
    await this.historyService.deleteScheduleHistory(id);
  }

  getSchedule(id: string): BackupSchedule | undefined {
    return this.schedules.get(id);
  }

  calculateNextRunTime(schedule: BackupSchedule): Date {
    return this.calculateNextRun(schedule);
  }

  getAllSchedules(): BackupSchedule[] {
    return Array.from(this.schedules.values());
  }

  getRunningJobs(): BackupJob[] {
    return Array.from(this.runningJobs.values());
  }

  async enableSchedule(id: string): Promise<void> {
    await this.updateSchedule(id, { enabled: true });
  }

  async disableSchedule(id: string): Promise<void> {
    await this.updateSchedule(id, { enabled: false });
  }

  async runScheduleNow(id: string): Promise<void> {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    await this.executeSchedule(schedule);
  }

  getNextScheduledRuns(limit: number = 10): Array<{ schedule: BackupSchedule; nextRun: Date }> {
    return Array.from(this.schedules.values())
      .filter(s => s.enabled)
      .map(schedule => ({
        schedule,
        nextRun: new Date(schedule.nextRunAt)
      }))
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
      .slice(0, limit);
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export default BackupSchedulerService;