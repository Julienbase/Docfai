import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (input: string, options?: { ALLOWED_TAGS?: string[] }) => {
      const withoutScripts = input
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '')
        .replace(/\son\w+=[^\s>]*/gi, '');

      return options?.ALLOWED_TAGS?.length === 0
        ? withoutScripts.replace(/<[^>]*>/g, '')
        : withoutScripts;
    }
  }
}));

const { createImportPreview, validateAndSanitizeProjectExportData } = await import('../../src/services/ProjectImportValidation');

function baseProjectData() {
  return {
    metadata: {
      exportedAt: '2026-05-06T00:00:00.000Z',
      exportedBy: 'Docfai',
      version: '1.0.0',
      projectId: 'project-1',
      projectName: 'Imported Project'
    },
    project: {
      id: 'project-1',
      name: 'Imported Project',
      description: 'Safe description',
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '2026-05-06T00:00:00.000Z',
      settings: {}
    },
    recordings: [],
    screenshots: [],
    documentationSteps: [],
    exports: [],
    uploads: []
  };
}

describe('ProjectImportValidation', () => {
  it('rejects unknown top-level keys in imported .docfai data', () => {
    expect(() => validateAndSanitizeProjectExportData({
      ...baseProjectData(),
      unexpectedPayload: true
    })).toThrow(/unknown top-level keys/i);
  });

  it('sanitizes imported project and step fields before persistence', () => {
    const sanitized = validateAndSanitizeProjectExportData({
      ...baseProjectData(),
      project: {
        ...baseProjectData().project,
        name: '<img src=x onerror=alert(1)>Trusted Name',
        description: '<b onclick=alert(1)>Project</b>'
      },
      documentationSteps: [
        {
          id: 'step-1',
          timestamp: 10,
          title: '<img src=x onerror=alert(1)>Click Save',
          description: '<p>Keep text</p><img src=x onerror=alert(1)><script>alert(1)</script>',
          actionType: 'click',
          isGenerated: false
        }
      ]
    });

    expect(sanitized.project.name).toBe('Trusted Name');
    expect(sanitized.project.description).toBe('Project');
    expect(sanitized.documentationSteps[0].title).toBe('Click Save');
    expect(sanitized.documentationSteps[0].description).toContain('<p>Keep text</p>');
    expect(sanitized.documentationSteps[0].description).not.toContain('onerror');
    expect(sanitized.documentationSteps[0].description).not.toContain('<script>');
  });

  it('builds preview data from sanitized project data', () => {
    const sanitized = validateAndSanitizeProjectExportData({
      ...baseProjectData(),
      recordings: [{ id: 'r1', name: 'Recording', duration: 1, resolution: '1080p', fps: 30, createdAt: '2026-05-06T00:00:00.000Z', filePath: 'recording.mp4', fileData: '' }],
      screenshots: [{ id: 's1', name: 'Screenshot', createdAt: '2026-05-06T00:00:00.000Z', filePath: 'screenshot.png', fileData: '' }],
      documentationSteps: [{ id: 'step-1', timestamp: 0, title: 'Step', description: 'Desc', actionType: 'click', isGenerated: false }]
    });

    expect(createImportPreview(sanitized, 'fallback.docfai', 1234)).toMatchObject({
      name: 'Imported Project',
      recordingsCount: 1,
      screenshotsCount: 1,
      stepsCount: 1,
      size: 1234,
      version: '1.0.0'
    });
  });
});
