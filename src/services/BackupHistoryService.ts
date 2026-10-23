// Using native Date methods instead of date-fns
import { ExportDestination } from './ProjectExportService';
import { useAppStore } from '../store/useAppStore';

export interface BackupRecord {
  id: string;
  scheduleId: string;
  scheduleName: string;
  projectId: string;
  projectName?: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  duration?: number; // in milliseconds
  exportPaths?: string[];
  destinations: ExportDestination[];
  error?: string;
  fileSize?: number; // in bytes
}

export interface BackupStats {
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  totalSize: number;
  averageDuration: number;
  lastBackupAt?: string;
  oldestBackupAt?: string;
}

export interface BackupHistoryFilter {
  scheduleId?: string;
  projectId?: string;
  status?: 'completed' | 'failed';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

class BackupHistoryService {
  private records: Map<string, BackupRecord> = new Map();
  private readonly STORAGE_KEY = 'backup_history';
  private readonly MAX_RECORDS = 10000; // Limit to prevent excessive storage usage

  constructor() {
    this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const historyData = JSON.parse(stored);
        for (const record of historyData) {
          this.records.set(record.id, record);
        }
      }
    } catch (error) {
      console.error('Failed to load backup history:', error);
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      const recordsArray = Array.from(this.records.values());
      
      // Keep only the most recent records if we exceed the limit
      if (recordsArray.length > this.MAX_RECORDS) {
        const sortedRecords = recordsArray
          .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
          .slice(0, this.MAX_RECORDS);
        
        this.records.clear();
        for (const record of sortedRecords) {
          this.records.set(record.id, record);
        }
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(this.records.values())));
    } catch (error) {
      console.error('Failed to save backup history:', error);
    }
  }

  async recordBackup(record: BackupRecord): Promise<void> {
    // Calculate duration if not provided
    if (!record.duration && record.startedAt && record.completedAt) {
      const startTime = new Date(record.startedAt).getTime();
      const endTime = new Date(record.completedAt).getTime();
      record.duration = endTime - startTime;
    }

    // Resolve project name from store if not provided by caller
    if (!record.projectName) {
      try {
        const { projects } = useAppStore.getState();
        const project = projects.find(p => p.id === record.projectId);
        record.projectName = project?.name || `Project ${record.projectId}`;
      } catch (error) {
        console.warn('Failed to get project name:', error);
        record.projectName = `Project ${record.projectId}`;
      }
    }

    this.records.set(record.id, record);
    await this.saveHistory();
  }

  getBackupHistory(filter: BackupHistoryFilter = {}): BackupRecord[] {
    let records = Array.from(this.records.values());

    // Apply filters
    if (filter.scheduleId) {
      records = records.filter(r => r.scheduleId === filter.scheduleId);
    }

    if (filter.projectId) {
      records = records.filter(r => r.projectId === filter.projectId);
    }

    if (filter.status) {
      records = records.filter(r => r.status === filter.status);
    }

    if (filter.dateFrom) {
      const fromDate = new Date(filter.dateFrom);
      records = records.filter(r => new Date(r.completedAt) >= fromDate);
    }

    if (filter.dateTo) {
      const toDate = new Date(filter.dateTo);
      records = records.filter(r => new Date(r.completedAt) <= toDate);
    }

    // Sort by completion date (newest first)
    records.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    // Apply pagination
    if (filter.offset) {
      records = records.slice(filter.offset);
    }

    if (filter.limit) {
      records = records.slice(0, filter.limit);
    }

    return records;
  }

  getBackupRecord(id: string): BackupRecord | undefined {
    return this.records.get(id);
  }

  getBackupStats(filter: Omit<BackupHistoryFilter, 'limit' | 'offset'> = {}): BackupStats {
    const records = this.getBackupHistory({ ...filter, limit: undefined, offset: undefined });
    
    const stats: BackupStats = {
      totalBackups: records.length,
      successfulBackups: records.filter(r => r.status === 'completed').length,
      failedBackups: records.filter(r => r.status === 'failed').length,
      totalSize: records.reduce((sum, r) => sum + (r.fileSize || 0), 0),
      averageDuration: 0
    };

    // Calculate average duration
    const recordsWithDuration = records.filter(r => r.duration);
    if (recordsWithDuration.length > 0) {
      const totalDuration = recordsWithDuration.reduce((sum, r) => sum + (r.duration || 0), 0);
      stats.averageDuration = totalDuration / recordsWithDuration.length;
    }

    // Get date range
    if (records.length > 0) {
      stats.lastBackupAt = records[0].completedAt; // Already sorted newest first
      stats.oldestBackupAt = records[records.length - 1].completedAt;
    }

    return stats;
  }

  getScheduleStats(scheduleId: string): BackupStats {
    return this.getBackupStats({ scheduleId });
  }

  getProjectStats(projectId: string): BackupStats {
    return this.getBackupStats({ projectId });
  }

  getRecentBackups(limit: number = 10): BackupRecord[] {
    return this.getBackupHistory({ limit });
  }

  getFailedBackups(limit: number = 50): BackupRecord[] {
    return this.getBackupHistory({ status: 'failed', limit });
  }

  async deleteBackupRecord(id: string): Promise<void> {
    if (this.records.has(id)) {
      this.records.delete(id);
      await this.saveHistory();
    }
  }

  async deleteScheduleHistory(scheduleId: string): Promise<void> {
    const recordsToDelete = Array.from(this.records.values())
      .filter(r => r.scheduleId === scheduleId)
      .map(r => r.id);

    for (const id of recordsToDelete) {
      this.records.delete(id);
    }

    if (recordsToDelete.length > 0) {
      await this.saveHistory();
    }
  }

  async deleteProjectHistory(projectId: string): Promise<void> {
    const recordsToDelete = Array.from(this.records.values())
      .filter(r => r.projectId === projectId)
      .map(r => r.id);

    for (const id of recordsToDelete) {
      this.records.delete(id);
    }

    if (recordsToDelete.length > 0) {
      await this.saveHistory();
    }
  }

  async cleanupOldBackups(scheduleId: string, cutoffDate: string): Promise<void> {
    const cutoff = new Date(cutoffDate);
    const recordsToDelete = Array.from(this.records.values())
      .filter(r => r.scheduleId === scheduleId && new Date(r.completedAt) < cutoff)
      .map(r => r.id);

    for (const id of recordsToDelete) {
      this.records.delete(id);
    }

    if (recordsToDelete.length > 0) {
      await this.saveHistory();
    }
  }

  async clearAllHistory(): Promise<void> {
    this.records.clear();
    await this.saveHistory();
  }

  exportHistoryToCSV(): string {
    const records = this.getBackupHistory();
    const headers = [
      'ID',
      'Schedule Name',
      'Project ID',
      'Project Name',
      'Status',
      'Started At',
      'Completed At',
      'Duration (ms)',
      'File Size (bytes)',
      'Export Paths',
      'Destinations',
      'Error'
    ];

    const csvRows = [headers.join(',')];

    for (const record of records) {
      const row = [
        record.id,
        record.scheduleName,
        record.projectId,
        record.projectName || '',
        record.status,
        record.startedAt,
        record.completedAt,
        record.duration?.toString() || '',
        record.fileSize?.toString() || '',
        record.exportPaths?.join(';') || '',
        record.destinations.map(d => d.type).join(';'),
        record.error || ''
      ].map(field => `"${field.toString().replace(/"/g, '""')}"`); // Escape quotes

      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }

  getBackupTrends(days: number = 30): Array<{ date: string; successful: number; failed: number }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const records = this.getBackupHistory({
      dateFrom: startDate.toISOString(),
      dateTo: endDate.toISOString()
    });

    // Group by date
    const trends = new Map<string, { successful: number; failed: number }>();
    
    // Initialize all dates with zero counts
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      trends.set(dateStr, { successful: 0, failed: 0 });
    }

    // Count backups by date
    for (const record of records) {
      const recordDate = new Date(record.completedAt);
      const dateStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
      const trend = trends.get(dateStr);
      if (trend) {
        if (record.status === 'completed') {
          trend.successful++;
        } else {
          trend.failed++;
        }
      }
    }

    return Array.from(trends.entries()).map(([date, counts]) => ({
      date,
      ...counts
    }));
  }

  getStorageUsage(): { totalRecords: number; storageSize: number; maxRecords: number } {
    const totalRecords = this.records.size;
    const storageSize = new Blob([localStorage.getItem(this.STORAGE_KEY) || '']).size;
    
    return {
      totalRecords,
      storageSize,
      maxRecords: this.MAX_RECORDS
    };
  }
}

export { BackupHistoryService };
export default BackupHistoryService;