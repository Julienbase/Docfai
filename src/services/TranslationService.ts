/**
 * Translation Service using Argos Translate (Python + Electron)
 * Offline, Free EN↔DE Translation - No API Keys Required
 * Uses bundled Python runtime and pre-downloaded language models
 */

import DOMPurify from 'dompurify';

export interface TranslationConfig {
  sourceLang: 'EN' | 'DE';
  targetLang: 'EN' | 'DE';
}

export interface TranslationResult {
  translatedText: string;
  detectedSourceLang?: string;
}

// Helper to extract text nodes from HTML while preserving structure
function extractTextNodes(html: string): { textNodes: string[]; template: string } {
  if (!html || typeof html !== 'string') {
    return { textNodes: [], template: '' };
  }

  // Check if content contains HTML tags
  const hasHtmlTags = /<[^>]+>/.test(html);

  if (!hasHtmlTags) {
    // Plain text - return as-is
    return { textNodes: [html], template: '{{0}}' };
  }

  // Use browser DOM parser if available
  if (typeof document !== 'undefined') {
    const tempDiv = document.createElement('div');
    // Security: Sanitize HTML to prevent XSS attacks
    tempDiv.innerHTML = DOMPurify.sanitize(html);

    const textNodes: string[] = [];
    let placeholderIndex = 0;

    // Recursively replace text nodes with placeholders
    const replaceTextNodes = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.trim()) {
          textNodes.push(text);
          node.textContent = `{{${placeholderIndex}}}`;
          placeholderIndex++;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.childNodes).forEach(child => replaceTextNodes(child));
      }
    };

    Array.from(tempDiv.childNodes).forEach(child => replaceTextNodes(child));

    return { textNodes, template: tempDiv.innerHTML };
  }

  // Fallback: return plain text
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { textNodes: [plainText], template: '{{0}}' };
}

// Helper to reconstruct HTML with translated text nodes
function reconstructHTML(translatedTexts: string[], template: string): string {
  let result = template;

  // Replace placeholders with translated text
  translatedTexts.forEach((text, index) => {
    const placeholder = `{{${index}}}`;
    result = result.replace(placeholder, text);
  });

  return result;
}

export class TranslationService {
  /**
   * Translate text using Argos Translate (via Electron IPC)
   */
  static async translateText(
    text: string,
    targetLang: 'EN' | 'DE',
    sourceLang?: 'EN' | 'DE'
  ): Promise<TranslationResult> {
    if (!text || text.trim().length === 0) {
      return { translatedText: text };
    }

    try {
      // Check if running in Electron
      if (!window.electronAPI?.translateText) {
        console.warn('[Translation] Electron API not available, returning original text');
        return { translatedText: text, detectedSourceLang: sourceLang };
      }

      const result = await window.electronAPI.translateText({
        text,
        targetLang: targetLang.toLowerCase(),
        sourceLang: sourceLang?.toLowerCase()
      });

      if (result.error) {
        console.error('[Translation] Error:', result.error);
        return { translatedText: text, detectedSourceLang: sourceLang };
      }

      return {
        translatedText: result.translatedText || text,
        detectedSourceLang: result.detectedSourceLang?.toUpperCase() as 'EN' | 'DE'
      };
    } catch (error) {
      console.error('[Translation] Failed:', error);
      return { translatedText: text, detectedSourceLang: sourceLang };
    }
  }

  /**
   * Translate multiple texts in batch
   */
  static async translateBatch(
    texts: string[],
    targetLang: 'EN' | 'DE',
    sourceLang?: 'EN' | 'DE'
  ): Promise<string[]> {
    try {
      // Check if running in Electron
      if (!window.electronAPI?.translateBatch) {
        console.warn('[Translation] Electron API not available, returning original texts');
        return texts;
      }

      const result = await window.electronAPI.translateBatch({
        texts,
        targetLang: targetLang.toLowerCase(),
        sourceLang: sourceLang?.toLowerCase()
      });

      if (result.error) {
        console.error('[Translation] Batch error:', result.error);
        return texts;
      }

      return result.translatedTexts || texts;
    } catch (error) {
      console.error('[Translation] Batch failed:', error);
      return texts;
    }
  }

  /**
   * Translate export content (step descriptions, titles, etc.)
   */
  static async translateExportContent(
    content: {
      projectTitle?: string;
      projectSource?: string;
      steps: Array<{
        title?: string;
        description?: string;
        [key: string]: any;
      }>;
    },
    targetLang: 'EN' | 'DE'
  ): Promise<typeof content> {
    try {
      // Store text extraction info for reconstruction
      interface TextExtractionInfo {
        type: 'projectTitle' | 'projectSource' | 'stepTitle' | 'stepDescription';
        index?: number;
        textNodes: string[];
        template: string;
      }

      const extractionInfos: TextExtractionInfo[] = [];
      const allTextsToTranslate: string[] = [];

      // Extract project title
      if (content.projectTitle) {
        const { textNodes, template } = extractTextNodes(content.projectTitle);
        extractionInfos.push({ type: 'projectTitle', textNodes, template });
        allTextsToTranslate.push(...textNodes);
      }

      // Extract project source
      if (content.projectSource) {
        const { textNodes, template } = extractTextNodes(content.projectSource);
        extractionInfos.push({ type: 'projectSource', textNodes, template });
        allTextsToTranslate.push(...textNodes);
      }

      // Extract step titles and descriptions
      content.steps.forEach((step, index) => {
        if (step.title) {
          const { textNodes, template } = extractTextNodes(step.title);
          extractionInfos.push({ type: 'stepTitle', index, textNodes, template });
          allTextsToTranslate.push(...textNodes);
        }
        if (step.description && step.description !== step.title) {
          const { textNodes, template } = extractTextNodes(step.description);
          extractionInfos.push({ type: 'stepDescription', index, textNodes, template });
          allTextsToTranslate.push(...textNodes);
        }
      });

      if (allTextsToTranslate.length === 0) {
        return content;
      }

      // Translate all text nodes in batch
      const translatedTexts = await this.translateBatch(allTextsToTranslate, targetLang);

      // Reconstruct HTML with translated texts
      const translatedContent = JSON.parse(JSON.stringify(content)); // Deep clone
      let translatedIndex = 0;

      for (const info of extractionInfos) {
        // Get the translated texts for this item
        const itemTranslatedTexts = translatedTexts.slice(
          translatedIndex,
          translatedIndex + info.textNodes.length
        );
        translatedIndex += info.textNodes.length;

        // Reconstruct HTML with translated texts
        const reconstructed = reconstructHTML(itemTranslatedTexts, info.template);

        // Apply to content
        if (info.type === 'projectTitle') {
          translatedContent.projectTitle = reconstructed;
        } else if (info.type === 'projectSource') {
          translatedContent.projectSource = reconstructed;
        } else if (info.type === 'stepTitle' && info.index !== undefined) {
          translatedContent.steps[info.index].title = reconstructed;
        } else if (info.type === 'stepDescription' && info.index !== undefined) {
          translatedContent.steps[info.index].description = reconstructed;
        }
      }

      return translatedContent;
    } catch (error) {
      console.error('[Translation] Export content translation error:', error);
      throw error;
    }
  }
}
