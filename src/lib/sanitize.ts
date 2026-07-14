/**
 * Sanitize user input to prevent XSS and layout-breaking characters.
 * Strips HTML tags and trims excessive whitespace.
 */
export function sanitizeMessage(text: string): string {
  // Remove HTML tags
  const noHtml = text.replace(/<[^>]*>/g, '');
  // Remove null bytes and control chars (except newline/tab)
  const noControl = noHtml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Collapse excessive whitespace/newlines
  const collapsed = noControl.replace(/\n{3,}/g, '\n\n').trim();
  // Limit length to prevent abuse
  return collapsed.slice(0, 5000);
}

/**
 * Escape content for safe rendering (double protection).
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}
