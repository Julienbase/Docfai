import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../../src/services/ProjectExportService', () => ({
  default: vi.fn(),
}));

vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      projects: [{ id: 'proj-1', name: 'Test Project' }],
    })),
  },
}));

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

import { BackupHistoryService, type BackupRecord } from '../../src/services/BackupHistoryService';

function makeRecord(overrides: Partial<BackupRecord> = {}): BackupRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    scheduleId: 'sched-1',
    scheduleName: 'Daily Backup',
    projectId: 'proj-1',
    projectName: 'Test Project',
    status: 'completed',
    startedAt: '2025-01-15T08:00:00.000Z',
    completedAt: '2025-01-15T08:01:00.000Z',
    duration: 60000,
    destinations: [{ type: 'local' as const }],
    fileSize: 1024 * 1024,
    ...overrides,
  };
}

describe('BackupHistoryService', () => {
  let service: BackupHistoryService;

  beforeEach(() => {
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    service = new BackupHistoryService();
  });

  describe('recordBackup', () => {
    it('stores a backup record', async () => {
      const record = makeRecord({ id: 'rec-1' });
      await service.recordBackup(record);

      const retrieved = service.getBackupRecord('rec-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('rec-1');
    });

    it('calculates duration automatically if not provided', async () => {
      const record = makeRecord({
        id: 'rec-2',
        startedAt: '2025-01-15T08:00:00.000Z',
        completedAt: '2025-01-15T08:02:30.000Z',
        duration: undefined,
      });

      await service.recordBackup(record);
      const retrieved = service.getBackupRecord('rec-2');
      expect(retrieved!.duration).toBe(150000); // 2 min 30 sec
    });
  });

  describe('getBackupHistory - filtering', () => {
    beforeEach(async () => {
      await service.recordBackup(makeRecord({
        id: 'rec-a',
        scheduleId: 'sched-1',
        projectId: 'proj-1',
        status: 'completed',
        completedAt: '2025-01-15T10:00:00.000Z',
      }));
      await service.recordBackup(makeRecord({
        id: 'rec-b',
        scheduleId: 'sched-2',
        projectId: 'proj-1',
        status: 'failed',
        completedAt: '2025-01-16T10:00:00.000Z',
        error: 'Disk full',
      }));
      await service.recordBackup(makeRecord({
        id: 'rec-c',
        scheduleId: 'sched-1',
        projectId: 'proj-2',
        status: 'completed',
        completedAt: '2025-01-17T10:00:00.000Z',
      }));
    });

    it('returns all records when no filter', () => {
      const results = service.getBackupHistory();
      expect(results.length).toBe(3);
    });

    it('sorts newest first', () => {
      const results = service.getBackupHistory();
      expect(results[0].id).toBe('rec-c');
      expect(results[2].id).toBe('rec-a');
    });

    it('filters by scheduleId', () => {
      const results = service.getBackupHistory({ scheduleId: 'sched-1' });
      expect(results.length).toBe(2);
      expect(results.every(r => r.scheduleId === 'sched-1')).toBe(true);
    });

    it('filters by projectId', () => {
      const results = service.getBackupHistory({ projectId: 'proj-2' });
      expect(results.length).toBe(1);
      expect(results[0].projectId).toBe('proj-2');
    });

    it('filters by status', () => {
      const results = service.getBackupHistory({ status: 'failed' });
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('failed');
    });

    it('filters by date range', () => {
      const results = service.getBackupHistory({
        dateFrom: '2025-01-16T00:00:00.000Z',
        dateTo: '2025-01-16T23:59:59.000Z',
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('rec-b');
    });

    it('applies limit', () => {
      const results = service.getBackupHistory({ limit: 2 });
      expect(results.length).toBe(2);
    });

    it('applies offset', () => {
      const results = service.getBackupHistory({ offset: 1 });
      expect(results.length).toBe(2);
      expect(results[0].id).toBe('rec-b'); // skipped rec-c (newest)
    });

    it('combines multiple filters', () => {
      const results = service.getBackupHistory({
        scheduleId: 'sched-1',
        status: 'completed',
      });
      expect(results.length).toBe(2);
    });
  });

  describe('getBackupStats', () => {
    beforeEach(async () => {
      await service.recordBackup(makeRecord({
        id: 'rec-1',
        status: 'completed',
        duration: 5000,
        fileSize: 1000,
        completedAt: '2025-01-15T10:00:00.000Z',
      }));
      await service.recordBackup(makeRecord({
        id: 'rec-2',
        status: 'completed',
        duration: 15000,
        fileSize: 3000,
        completedAt: '2025-01-16T10:00:00.000Z',
      }));
      await service.recordBackup(makeRecord({
        id: 'rec-3',
        status: 'failed',
        duration: 2000,
        fileSize: 0,
        completedAt: '2025-01-17T10:00:00.000Z',
        error: 'Network error',
      }));
    });

    it('calculates correct totals', () => {
      const stats = service.getBackupStats();
      expect(stats.totalBackups).toBe(3);
      expect(stats.successfulBackups).toBe(2);
      expect(stats.failedBackups).toBe(1);
    });

    it('calculates total size', () => {
      const stats = service.getBackupStats();
      expect(stats.totalSize).toBe(4000);
    });

    it('calculates average duration', () => {
      const stats = service.getBackupStats();
      // (5000 + 15000 + 2000) / 3 = 7333.33...
      expect(Math.round(stats.averageDuration)).toBe(7333);
    });

    it('returns date range', () => {
      const stats = service.getBackupStats();
      expect(stats.lastBackupAt).toBe('2025-01-17T10:00:00.000Z');
      expect(stats.oldestBackupAt).toBe('2025-01-15T10:00:00.000Z');
    });

    it('returns zero stats for empty history', () => {
      const emptyService = new BackupHistoryService();
      const stats = emptyService.getBackupStats();
      expect(stats.totalBackups).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.lastBackupAt).toBeUndefined();
    });

    it('filters stats by schedule', () => {
      const stats = service.getScheduleStats('sched-1');
      expect(stats.totalBackups).toBe(3); // all have sched-1 by default
    });
  });

  describe('exportHistoryToCSV', () => {
    it('generates CSV with headers', async () => {
      await service.recordBackup(makeRecord({ id: 'rec-1' }));

      const csv = service.exportHistoryToCSV();
      const lines = csv.split('\n');

      expect(lines[0]).toContain('ID');
      expect(lines[0]).toContain('Schedule Name');
      expect(lines[0]).toContain('Status');
      expect(lines.length).toBe(2); // header + 1 data row
    });

    it('escapes double quotes in CSV fields', async () => {
      await service.recordBackup(makeRecord({
        id: 'rec-1',
        error: 'Error with "quotes" inside',
      }));

      const csv = service.exportHistoryToCSV();
      expect(csv).toContain('""quotes""'); // CSV double-quote escaping
    });

    it('returns only headers for empty history', () => {
      const csv = service.exportHistoryToCSV();
      const lines = csv.split('\n');
      expect(lines.length).toBe(1);
    });
  });

  describe('cleanupOldBackups', () => {
    it('removes records before cutoff date', async () => {
      await service.recordBackup(makeRecord({
        id: 'old',
        scheduleId: 'sched-1',
        completedAt: '2025-01-01T10:00:00.000Z',
      }));
      await service.recordBackup(makeRecord({
        id: 'recent',
        scheduleId: 'sched-1',
        completedAt: '2025-01-20T10:00:00.000Z',
      }));

      await service.cleanupOldBackups('sched-1', '2025-01-10T00:00:00.000Z');

      expect(service.getBackupRecord('old')).toBeUndefined();
      expect(service.getBackupRecord('recent')).toBeDefined();
    });

    it('only cleans up the specified schedule', async () => {
      await service.recordBackup(makeRecord({
        id: 'other-sched',
        scheduleId: 'sched-2',
        completedAt: '2025-01-01T10:00:00.000Z',
      }));

      await service.cleanupOldBackups('sched-1', '2025-01-10T00:00:00.000Z');

      expect(service.getBackupRecord('other-sched')).toBeDefined();
    });
  });

  describe('deleteScheduleHistory', () => {
    it('deletes all records for a schedule', async () => {
      await service.recordBackup(makeRecord({ id: 'rec-1', scheduleId: 'sched-1' }));
      await service.recordBackup(makeRecord({ id: 'rec-2', scheduleId: 'sched-1' }));
      await service.recordBackup(makeRecord({ id: 'rec-3', scheduleId: 'sched-2' }));

      await service.deleteScheduleHistory('sched-1');

      expect(service.getBackupHistory().length).toBe(1);
      expect(service.getBackupRecord('rec-3')).toBeDefined();
    });
  });

  describe('getRecentBackups and getFailedBackups', () => {
    beforeEach(async () => {
      for (let i = 0; i < 15; i++) {
        await service.recordBackup(makeRecord({
          id: `rec-${i}`,
          status: i % 3 === 0 ? 'failed' : 'completed',
          completedAt: new Date(2025, 0, i + 1, 10, 0, 0).toISOString(),
        }));
      }
    });

    it('getRecentBackups returns limited results', () => {
      const recent = service.getRecentBackups(5);
      expect(recent.length).toBe(5);
    });

    it('getFailedBackups returns only failures', () => {
      const failed = service.getFailedBackups();
      expect(failed.every(r => r.status === 'failed')).toBe(true);
    });
  });

  describe('getStorageUsage', () => {
    it('returns storage metrics', () => {
      const usage = service.getStorageUsage();
      expect(usage.totalRecords).toBe(0);
      expect(usage.maxRecords).toBe(10000);
      expect(typeof usage.storageSize).toBe('number');
    });
  });
});
