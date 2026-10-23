/**
 * Normalize step description whitespace before export.
 *
 * - Collapses 3+ consecutive blank lines → 1 blank line (plain text)
 * - Collapses 2+ consecutive empty paragraphs → 1 (HTML from rich text editor)
 * - Trims trailing whitespace per line
 * - Normalizes `\r\n` → `\n`
 *
 * Prevents users' excess spacing from blowing up exported page layouts.
 */
export function normalizeDescription(desc: string | null | undefined): string {
  if (!desc) return '';

  const hasHtmlTags = /<[^>]+>/.test(desc);

  if (hasHtmlTags) {
    return desc
      .replace(/\r\n/g, '\n')
      .replace(/(\s*<p>(\s*|&nbsp;|<br\s*\/?>)*<\/p>\s*){2,}/gi, '<p><br></p>');
  }

  return desc
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
