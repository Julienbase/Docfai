import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock window.electronAPI before importing the service
Object.defineProperty(globalThis, 'window', {
  value: {
    electronAPI: undefined,
  },
  configurable: true,
  writable: true,
});

import { NotesEncryptionService, type ProjectNote } from '../../src/services/NotesEncryptionService';

function makeNote(overrides: Partial<ProjectNote> = {}): ProjectNote {
  return {
    id: 'note-1',
    content: 'Test note content',
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:00:00.000Z',
    author: {
      id: 'user-1',
      name: 'Julien',
      email: 'julien@test.com',
    },
    ...overrides,
  };
}

describe('NotesEncryptionService', () => {
  let service: NotesEncryptionService;

  beforeEach(() => {
    service = new NotesEncryptionService();
  });

  describe('sanitizeNoteContent', () => {
    it('escapes ampersands', () => {
      expect(service.sanitizeNoteContent('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('escapes angle brackets', () => {
      expect(service.sanitizeNoteContent('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('escapes double quotes', () => {
      expect(service.sanitizeNoteContent('He said "hello"')).toBe('He said &quot;hello&quot;');
    });

    it('escapes single quotes', () => {
      expect(service.sanitizeNoteContent("It's fine")).toBe('It&#039;s fine');
    });

    it('escapes all special characters together', () => {
      const input = '<div class="test">&\'hello\'</div>';
      const result = service.sanitizeNoteContent(input);
      expect(result).toBe('&lt;div class=&quot;test&quot;&gt;&amp;&#039;hello&#039;&lt;/div&gt;');
    });

    it('returns empty string for empty input', () => {
      expect(service.sanitizeNoteContent('')).toBe('');
    });

    it('does not alter safe content', () => {
      const safe = 'Hello World 123 abc @#$%^*()';
      expect(service.sanitizeNoteContent(safe)).toBe(safe);
    });

    it('handles multiple consecutive special characters', () => {
      expect(service.sanitizeNoteContent('<<<>>>')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;');
    });
  });

  describe('validateNote', () => {
    it('returns true for valid note', () => {
      expect(service.validateNote(makeNote())).toBe(true);
    });

    it('returns false for null', () => {
      expect(service.validateNote(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(service.validateNote(undefined)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(service.validateNote('string')).toBe(false);
      expect(service.validateNote(42)).toBe(false);
    });

    it('returns false if id is missing', () => {
      const note = makeNote();
      delete (note as any).id;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if id is not a string', () => {
      expect(service.validateNote({ ...makeNote(), id: 123 })).toBe(false);
    });

    it('returns false if content is missing', () => {
      const note = makeNote();
      delete (note as any).content;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if createdAt is missing', () => {
      const note = makeNote();
      delete (note as any).createdAt;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if updatedAt is missing', () => {
      const note = makeNote();
      delete (note as any).updatedAt;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if author is missing', () => {
      const note = makeNote();
      delete (note as any).author;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if author is null', () => {
      expect(service.validateNote({ ...makeNote(), author: null })).toBe(false);
    });

    it('returns false if author.id is missing', () => {
      const note = makeNote();
      delete (note as any).author.id;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if author.name is missing', () => {
      const note = makeNote();
      delete (note as any).author.name;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if author.email is missing', () => {
      const note = makeNote();
      delete (note as any).author.email;
      expect(service.validateNote(note)).toBe(false);
    });

    it('returns false if author.email is not a string', () => {
      expect(service.validateNote({
        ...makeNote(),
        author: { id: 'u1', name: 'Test', email: 123 },
      })).toBe(false);
    });

    it('accepts note with optional isEncrypted field', () => {
      const note = makeNote({ isEncrypted: true });
      expect(service.validateNote(note)).toBe(true);
    });
  });

  describe('isEncryptionAvailable', () => {
    it('returns false when electronAPI is not available', () => {
      (globalThis as any).window = { electronAPI: undefined };
      const svc = new NotesEncryptionService();
      expect(svc.isEncryptionAvailable()).toBe(false);
    });

    it('returns false when encrypt/decrypt methods are missing', () => {
      (globalThis as any).window = { electronAPI: {} };
      const svc = new NotesEncryptionService();
      expect(svc.isEncryptionAvailable()).toBe(false);
    });

    it('returns true when encrypt and decrypt are available', () => {
      (globalThis as any).window = {
        electronAPI: {
          encryptData: vi.fn(),
          decryptData: vi.fn(),
        },
      };
      const svc = new NotesEncryptionService();
      expect(svc.isEncryptionAvailable()).toBe(true);
    });
  });

  describe('encryptNotes / decryptNotes without Electron API (fallback)', () => {
    beforeEach(() => {
      (globalThis as any).window = { electronAPI: undefined };
    });

    it('stores unencrypted JSON in fallback mode', async () => {
      const notes = [makeNote()];
      const encrypted = await service.encryptNotes(notes);

      expect(encrypted.version).toBe('1.0.0');
      expect(encrypted.checksum).toBeTruthy();
      // In fallback, encryptedNotes is just JSON
      const parsed = JSON.parse(encrypted.encryptedNotes);
      expect(parsed[0].id).toBe('note-1');
    });

    it('decrypts fallback (unencrypted) data', async () => {
      const notes = [makeNote({ id: 'note-abc' })];
      const encrypted = await service.encryptNotes(notes);
      const decrypted = await service.decryptNotes(encrypted);

      expect(decrypted.length).toBe(1);
      expect(decrypted[0].id).toBe('note-abc');
    });

    it('returns empty array on decrypt failure', async () => {
      const badData = {
        version: '1.0.0',
        encryptedNotes: 'not valid json {{{',
        checksum: 'abc',
      };

      const result = await service.decryptNotes(badData);
      expect(result).toEqual([]);
    });
  });
});
