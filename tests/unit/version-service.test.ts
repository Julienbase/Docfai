import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../../src/services/ProjectExportService', () => ({
  ProjectExportService: vi.fn().mockImplementation(() => ({})),
  default: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      projects: [],
      user: null,
      updateProject: vi.fn(),
    })),
  },
}));

import VersionService from '../../src/services/VersionService';

describe('VersionService', () => {
  let service: VersionService;

  beforeEach(() => {
    service = new VersionService();
  });

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(service.formatFileSize(0)).toBe('0 B');
      expect(service.formatFileSize(512)).toBe('512 B');
      expect(service.formatFileSize(1023)).toBe('1023 B');
    });

    it('formats kilobytes', () => {
      expect(service.formatFileSize(1024)).toBe('1.0 KB');
      expect(service.formatFileSize(1536)).toBe('1.5 KB');
      expect(service.formatFileSize(10240)).toBe('10.0 KB');
      expect(service.formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB');
    });

    it('formats megabytes', () => {
      expect(service.formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(service.formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(service.formatFileSize(100 * 1024 * 1024)).toBe('100.0 MB');
    });

    it('formats gigabytes', () => {
      expect(service.formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
      expect(service.formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('handles edge case at KB boundary', () => {
      expect(service.formatFileSize(1024)).toBe('1.0 KB');
    });

    it('handles edge case at MB boundary', () => {
      expect(service.formatFileSize(1024 * 1024)).toBe('1.0 MB');
    });

    it('handles edge case at GB boundary', () => {
      expect(service.formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    });
  });
});
