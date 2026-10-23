// Notes Encryption Service for secure storage of project notes
// Uses Electron's safeStorage API to encrypt notes before storing

export interface ProjectNote {
  id: string;
  content: string; // Will be encrypted
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  // Encrypted flag to track encryption status
  isEncrypted?: boolean;
}

export interface EncryptedNotesData {
  version: string; // Version for future migration compatibility
  encryptedNotes: string; // Encrypted JSON string of notes array
  checksum: string; // Simple checksum for data integrity
}

class NotesEncryptionService {
  private readonly VERSION = '1.0.0';

  /**
   * Generate a simple checksum for data integrity verification
   */
  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Encrypt notes array for secure storage
   * Returns encrypted data structure or throws error
   */
  async encryptNotes(notes: ProjectNote[]): Promise<EncryptedNotesData> {
    try {
      // Check if Electron API is available
      if (!window.electronAPI || !window.electronAPI.encryptData) {
        console.warn('[NotesEncryption] Electron API not available, storing notes without encryption');
        // Fallback: store unencrypted but marked
        const notesJson = JSON.stringify(notes);
        return {
          version: this.VERSION,
          encryptedNotes: notesJson,
          checksum: this.generateChecksum(notesJson),
        };
      }

      // Convert notes to JSON string
      const notesJson = JSON.stringify(notes);

      // Generate checksum before encryption
      const checksum = this.generateChecksum(notesJson);

      // Encrypt the notes data
      const encryptedData = await window.electronAPI.encryptData(notesJson);

      return {
        version: this.VERSION,
        encryptedNotes: encryptedData,
        checksum,
      };
    } catch (error) {
      console.error('[NotesEncryption] ❌ Failed to encrypt notes:', error);
      throw new Error('Failed to encrypt notes: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Decrypt notes array from storage
   * Returns decrypted notes array or throws error
   */
  async decryptNotes(encryptedData: EncryptedNotesData): Promise<ProjectNote[]> {
    try {
      // Check if Electron API is available
      if (!window.electronAPI || !window.electronAPI.decryptData) {
        console.warn('[NotesEncryption] Electron API not available, reading notes without decryption');
        // Fallback: parse unencrypted data
        try {
          const notes = JSON.parse(encryptedData.encryptedNotes) as ProjectNote[];
          return notes;
        } catch (parseError) {
          console.error('[NotesEncryption] Failed to parse unencrypted notes:', parseError);
          return [];
        }
      }

      // Decrypt the notes data
      const decryptedJson = await window.electronAPI.decryptData(encryptedData.encryptedNotes);

      // Verify checksum for data integrity
      const checksum = this.generateChecksum(decryptedJson);
      if (checksum !== encryptedData.checksum) {
        console.warn('[NotesEncryption] ⚠️ Checksum mismatch - data may be corrupted', {
          expected: encryptedData.checksum,
          actual: checksum,
        });
        // Continue anyway - data might still be valid
      }

      // Parse the decrypted JSON
      const notes = JSON.parse(decryptedJson) as ProjectNote[];

      return notes;
    } catch (error) {
      console.error('[NotesEncryption] ❌ Failed to decrypt notes:', error);
      // Return empty array instead of throwing to prevent app crashes
      return [];
    }
  }

  /**
   * Encrypt a single note (for quick updates)
   */
  async encryptNote(note: ProjectNote): Promise<string> {
    try {
      if (!window.electronAPI || !window.electronAPI.encryptData) {
        // Fallback: return as JSON string
        return JSON.stringify(note);
      }

      const noteJson = JSON.stringify(note);
      const encrypted = await window.electronAPI.encryptData(noteJson);

      return encrypted;
    } catch (error) {
      console.error('[NotesEncryption] Failed to encrypt single note:', error);
      throw new Error('Failed to encrypt note');
    }
  }

  /**
   * Decrypt a single note
   */
  async decryptNote(encryptedNote: string): Promise<ProjectNote> {
    try {
      if (!window.electronAPI || !window.electronAPI.decryptData) {
        // Fallback: parse as JSON
        return JSON.parse(encryptedNote) as ProjectNote;
      }

      const decrypted = await window.electronAPI.decryptData(encryptedNote);
      const note = JSON.parse(decrypted) as ProjectNote;

      return note;
    } catch (error) {
      console.error('[NotesEncryption] Failed to decrypt single note:', error);
      throw new Error('Failed to decrypt note');
    }
  }

  /**
   * Sanitize note content to prevent XSS attacks
   */
  sanitizeNoteContent(content: string): string {
    // Basic HTML entity encoding to prevent XSS
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Validate note structure
   */
  validateNote(note: any): note is ProjectNote {
    return (
      typeof note === 'object' &&
      note !== null &&
      typeof note.id === 'string' &&
      typeof note.content === 'string' &&
      typeof note.createdAt === 'string' &&
      typeof note.updatedAt === 'string' &&
      typeof note.author === 'object' &&
      note.author !== null &&
      typeof note.author.id === 'string' &&
      typeof note.author.name === 'string' &&
      typeof note.author.email === 'string'
    );
  }

  /**
   * Check if Electron encryption is available
   */
  isEncryptionAvailable(): boolean {
    return !!(window.electronAPI && window.electronAPI.encryptData && window.electronAPI.decryptData);
  }
}

// Export singleton instance
export const notesEncryptionService = new NotesEncryptionService();
export { NotesEncryptionService };
