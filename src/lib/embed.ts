export interface EmbedInfo {
  /** Human label, e.g. "Google Sheet". */
  label: string;
  /** The iframe URL. Always built from a fixed host plus a validated file id, never from raw user input. */
  src: string;
}

const ID = '([A-Za-z0-9_-]{10,})';
const GOOGLE_LABELS: Record<string, string> = {
  document: 'Google Doc',
  spreadsheets: 'Google Sheet',
  presentation: 'Google Slides',
};

/**
 * Recognises links that can be shown inline. Only Google Docs/Sheets/Slides and Drive files/folders
 * are supported: their preview URLs are designed for framing. Many other sites forbid framing
 * (X-Frame-Options), so they fall back to a link card instead of showing a blank box.
 */
export function getEmbed(rawUrl: string): EmbedInfo | null {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();

  if (host === 'docs.google.com') {
    const m = new RegExp(`^/(document|spreadsheets|presentation)/(?:u/\\d+/)?d/${ID}`).exec(u.pathname);
    if (m) {
      const [, type, id] = m;
      const suffix = type === 'presentation' ? 'embed' : 'preview';
      return { label: GOOGLE_LABELS[type], src: `https://docs.google.com/${type}/d/${id}/${suffix}` };
    }
  }

  if (host === 'drive.google.com') {
    const file = new RegExp(`^/file/d/${ID}`).exec(u.pathname);
    if (file) return { label: 'Google Drive file', src: `https://drive.google.com/file/d/${file[1]}/preview` };
    const folder = new RegExp(`^/drive/(?:u/\\d+/)?folders/${ID}`).exec(u.pathname);
    if (folder) return { label: 'Google Drive folder', src: `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list` };
  }
  return null;
}

export function hostOf(rawUrl: string): string {
  try { return new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { return rawUrl; }
}
