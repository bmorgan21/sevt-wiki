import type { PageInput, PageLink } from '../types';

export const LIMITS = { title: 200, content: 200_000, tags: 20, tag: 40, folder: 100, links: 10, linkName: 100 } as const;

export function normalizeTags(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(',');
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Trims every link and drops rows that are completely blank. */
export function normalizeLinks(raw: PageLink[]): PageLink[] {
  return raw.map(l => ({ url: l.url.trim(), name: l.name.trim() })).filter(l => l.url || l.name);
}

/** Only http(s). Blocks javascript:, data:, etc. */
export function isSafeExternalUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Returns an error message, or null when valid. Used by the form AND the (mock) server. */
export function validatePageInput(i: PageInput): string | null {
  if (!i.title.trim()) return 'Add a title.';
  if (i.title.length > LIMITS.title) return `Titles can be at most ${LIMITS.title} characters.`;
  if (i.content.length > LIMITS.content) return 'This page is too long to save.';
  if (i.tags.length > LIMITS.tags) return `Use at most ${LIMITS.tags} tags.`;
  if (i.tags.some(t => t.length > LIMITS.tag)) return `Tags can be at most ${LIMITS.tag} characters.`;
  if (i.links.length > LIMITS.links) return `Add at most ${LIMITS.links} links.`;
  const seen = new Set<string>();
  for (const l of i.links) {
    if (!l.url) return `Add a URL for “${l.name}”.`;
    if (!isSafeExternalUrl(l.url)) return `“${l.url}” isn’t a valid link. Links must start with http:// or https://.`;
    if (l.name.length > LIMITS.linkName) return `Link names can be at most ${LIMITS.linkName} characters.`;
    if (seen.has(l.url)) return 'The same link is added more than once.';
    seen.add(l.url);
  }
  return null;
}

export function validateFolderName(name: string): string | null {
  if (!name.trim()) return 'Add a folder name.';
  if (name.length > LIMITS.folder) return `Folder names can be at most ${LIMITS.folder} characters.`;
  return null;
}
