import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before importing the service
vi.mock('../../src/services/ProjectExportService', () => {
  return {
    default: class MockProjectExportService {},
    ProjectExportService: class MockProjectExportService {},
  };
});

vi.mock('../../src/services/BackupHistoryService', () => {
  return {
    BackupHistoryService: class MockBackupHistoryService {
      deleteScheduleHistory = vi.fn();
      cleanupOldBackups = vi.fn();
      recordBackup = vi.fn();
    },
    default: class MockBackupHistoryService {
      deleteScheduleHistory = vi.fn();
      cleanupOldBackups = vi.fn();
      recordBackup = vi.fn();
    },
  };
});

vi.mock('../../src/services/NotificationService', () => {
  return {
    NotificationService: class MockNotificationService {
      sendBackupNotification = vi.fn();
    },
  };
});

vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({ projects: [] })),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

import BackupSchedulerService, { type BackupSchedule } from '../../src/services/BackupSchedulerService';

function makeSchedule(overrides: Partial<BackupSchedule> = {}): BackupSchedule {
  return {
    id: 'test-1',
    name: 'Test Schedule',
    enabled: true,
    frequency: 'daily',
    projectIds: [],
    destinations: [],
    options: {} as any,
    nextRunAt: new Date().toISOString(),
    retentionDays: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('BackupSchedulerService - Date Calculations', () => {
  let service: BackupSchedulerService;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.getItem.mockReturnValue(null);
    service = new BackupSchedulerService();
  });

  afterEach(() => {
    service?.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Daily schedule with scheduleTime', () => {
    it('schedules for today if time has not passed yet', () => {
      // Now: Jan 15, 2025 at 08:00
      vi.setSystemTime(new Date(2025, 0, 15, 8, 0, 0));

      const schedule = makeSchedule({
        frequency: 'daily',
        scheduleTime: { hour: 14, minute: 30 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getFullYear()).toBe(2025);
      expect(nextRun.getMonth()).toBe(0);
      expect(nextRun.getDate()).toBe(15); // today
      expect(nextRun.getHours()).toBe(14);
      expect(nextRun.getMinutes()).toBe(30);
    });

    it('schedules for tomorrow if time has already passed', () => {
      // Now: Jan 15, 2025 at 16:00
      vi.setSystemTime(new Date(2025, 0, 15, 16, 0, 0));

      const schedule = makeSchedule({
        frequency: 'daily',
        scheduleTime: { hour: 8, minute: 0 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(16); // tomorrow
      expect(nextRun.getHours()).toBe(8);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('schedules for tomorrow at exact current time (<=)', () => {
      // Now: Jan 15, 2025 at exactly 10:30:00
      vi.setSystemTime(new Date(2025, 0, 15, 10, 30, 0, 0));

      const schedule = makeSchedule({
        frequency: 'daily',
        scheduleTime: { hour: 10, minute: 30 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(16); // tomorrow (uses <=)
    });

    it('handles midnight crossing (schedule for 00:00)', () => {
      // Now: Jan 15, 2025 at 23:59
      vi.setSystemTime(new Date(2025, 0, 15, 23, 59, 0));

      const schedule = makeSchedule({
        frequency: 'daily',
        scheduleTime: { hour: 0, minute: 0 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(16);
      expect(nextRun.getHours()).toBe(0);
      expect(nextRun.getMinutes()).toBe(0);
    });
  });

  describe('Weekly schedule with scheduleTime', () => {
    it('schedules for later this week if target day has not passed', () => {
      // Now: Monday Jan 13, 2025 at 10:00 (Monday = day 1)
      vi.setSystemTime(new Date(2025, 0, 13, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'weekly',
        scheduleTime: { hour: 9, minute: 0, dayOfWeek: 5 }, // Friday
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(17); // Friday Jan 17
      expect(nextRun.getDay()).toBe(5); // Friday
      expect(nextRun.getHours()).toBe(9);
    });

    it('schedules for next week if target day is today but time passed', () => {
      // Now: Wednesday Jan 15, 2025 at 14:00 (Wednesday = day 3)
      vi.setSystemTime(new Date(2025, 0, 15, 14, 0, 0));

      const schedule = makeSchedule({
        frequency: 'weekly',
        scheduleTime: { hour: 9, minute: 0, dayOfWeek: 3 }, // Wednesday
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(22); // next Wednesday
      expect(nextRun.getDay()).toBe(3);
      expect(nextRun.getHours()).toBe(9);
    });

    it('schedules for today if target day is today and time has not passed', () => {
      // Now: Wednesday Jan 15, 2025 at 07:00
      vi.setSystemTime(new Date(2025, 0, 15, 7, 0, 0));

      const schedule = makeSchedule({
        frequency: 'weekly',
        scheduleTime: { hour: 9, minute: 0, dayOfWeek: 3 }, // Wednesday
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(15); // today
      expect(nextRun.getHours()).toBe(9);
    });

    it('schedules for Sunday (day 0) correctly from a weekday', () => {
      // Now: Thursday Jan 16, 2025 (Thursday = day 4)
      vi.setSystemTime(new Date(2025, 0, 16, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'weekly',
        scheduleTime: { hour: 8, minute: 0, dayOfWeek: 0 }, // Sunday
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDay()).toBe(0); // Sunday
      expect(nextRun.getDate()).toBe(19); // next Sunday = Jan 19
    });

    it('defaults to Sunday when dayOfWeek is undefined', () => {
      vi.setSystemTime(new Date(2025, 0, 13, 10, 0, 0)); // Monday

      const schedule = makeSchedule({
        frequency: 'weekly',
        scheduleTime: { hour: 9, minute: 0 }, // no dayOfWeek
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDay()).toBe(0); // defaults to Sunday (0)
    });
  });

  describe('Monthly schedule with scheduleTime', () => {
    it('schedules for this month if target day has not passed', () => {
      // Now: Jan 5, 2025 at 08:00
      vi.setSystemTime(new Date(2025, 0, 5, 8, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: { hour: 10, minute: 0, dayOfMonth: 15 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getMonth()).toBe(0); // January
      expect(nextRun.getDate()).toBe(15);
      expect(nextRun.getHours()).toBe(10);
    });

    it('schedules for next month if target day has passed', () => {
      // Now: Jan 20, 2025 at 12:00
      vi.setSystemTime(new Date(2025, 0, 20, 12, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: { hour: 10, minute: 0, dayOfMonth: 15 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getMonth()).toBe(1); // February
      expect(nextRun.getDate()).toBe(15);
    });

    it('clamps day 31 to month max when in current month', () => {
      // Now: Jan 20, 2025 at 12:00
      vi.setSystemTime(new Date(2025, 0, 20, 12, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: { hour: 10, minute: 0, dayOfMonth: 31 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      // Jan has 31 days, Jan 31 hasn't passed yet (we're on Jan 20)
      expect(nextRun.getMonth()).toBe(0); // still January
      expect(nextRun.getDate()).toBe(31);
    });

    it('clamps day 31 to Feb 29 (leap year)', () => {
      // Now: Feb 1, 2024 at 08:00 (2024 is a leap year)
      vi.setSystemTime(new Date(2024, 1, 1, 8, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: { hour: 10, minute: 0, dayOfMonth: 31 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      // Feb 2024 has 29 days, clamped from 31 to 29
      expect(nextRun.getMonth()).toBe(1); // February
      expect(nextRun.getDate()).toBe(29);
    });

    it('handles last day of month (-1)', () => {
      // Now: Jan 15, 2025 at 08:00
      vi.setSystemTime(new Date(2025, 0, 15, 8, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: { hour: 10, minute: 0, dayOfMonth: -1 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getMonth()).toBe(0); // January
      expect(nextRun.getDate()).toBe(31); // last day of Jan
    });

    it('handles last day of month (-1) rolling to next month', () => {
      // Now: Jan 31, 2025 at 12:00 (already past the last day)
      vi.setSystemTime(new Date(2025, 0, 31, 12, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: { hour: 10, minute: 0, dayOfMonth: -1 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getMonth()).toBe(1); // February
      expect(nextRun.getDate()).toBe(28); // last day of Feb 2025
    });

    it('defaults to day 1 when dayOfMonth is undefined', () => {
      vi.setSystemTime(new Date(2025, 0, 5, 8, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: { hour: 10, minute: 0 }, // no dayOfMonth
      });

      const nextRun = service.calculateNextRunTime(schedule);
      // dayOfMonth defaults to 1, but Jan 1 already passed → next month
      expect(nextRun.getDate()).toBe(1);
    });
  });

  describe('Custom interval', () => {
    it('adds custom hours to current time', () => {
      // Now: Jan 15, 2025 at 10:00
      vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'custom',
        customInterval: 6, // 6 hours
        scheduleTime: { hour: 0, minute: 0 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getHours()).toBe(16); // 10 + 6
    });

    it('defaults to 24 hours when customInterval is not set', () => {
      vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'custom',
        scheduleTime: { hour: 0, minute: 0 },
      });

      const nextRun = service.calculateNextRunTime(schedule);
      // Should be 24 hours later
      expect(nextRun.getDate()).toBe(16);
      expect(nextRun.getHours()).toBe(10);
    });
  });

  describe('Without scheduleTime (fallback logic)', () => {
    it('daily without scheduleTime schedules for tomorrow', () => {
      vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'daily',
        scheduleTime: undefined,
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(16);
    });

    it('weekly without scheduleTime schedules for 7 days later', () => {
      vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'weekly',
        scheduleTime: undefined,
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getDate()).toBe(22);
    });

    it('monthly without scheduleTime schedules for next month', () => {
      vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'monthly',
        scheduleTime: undefined,
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getMonth()).toBe(1); // February
    });

    it('custom without scheduleTime uses customInterval hours', () => {
      vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

      const schedule = makeSchedule({
        frequency: 'custom',
        customInterval: 12,
        scheduleTime: undefined,
      });

      const nextRun = service.calculateNextRunTime(schedule);
      expect(nextRun.getHours()).toBe(22); // 10 + 12
    });
  });
});
