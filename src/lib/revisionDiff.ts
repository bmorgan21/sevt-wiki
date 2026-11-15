import type { PageLink } from '../types';

export interface RevisionMeta { title: string; tags: string[]; links: PageLink[] }

export interface MetaChange {
  field: string;
  /** For single-value fields (title, location). */
  before?: string;
  after?: string;
  /** For list fields (tags, links). */
  added?: string[];
  removed?: string[];
  note?: string;
}

const linkLabel = (l: PageLink) => (l.name ? `${l.name} (${l.url})` : l.url);
const linkKey = (l: PageLink) => `${l.url}\n${l.name}`;

/** What changed between two versions, apart from the page text. */
export function diffRevisionMeta(
  prev: RevisionMeta,
  curr: RevisionMeta,
  loc: { changed: boolean; before: string; after: string },
): MetaChange[] {
  const out: MetaChange[] = [];
  if (prev.title !== curr.title) out.push({ field: 'Title', before: prev.title, after: curr.title });
  if (loc.changed) out.push({ field: 'Location', before: loc.before, after: loc.after });

  const addedTags = curr.tags.filter(t => !prev.tags.includes(t));
  const removedTags = prev.tags.filter(t => !curr.tags.includes(t));
  if (addedTags.length || removedTags.length) out.push({ field: 'Tags', added: addedTags, removed: removedTags });

  const prevKeys = prev.links.map(linkKey);
  const currKeys = curr.links.map(linkKey);
  const added = curr.links.filter(l => !prevKeys.includes(linkKey(l))).map(linkLabel);
  const removed = prev.links.filter(l => !currKeys.includes(linkKey(l))).map(linkLabel);
  const reordered = !added.length && !removed.length && prevKeys.join('|') !== currKeys.join('|');
  if (added.length || removed.length || reordered) {
    out.push({ field: 'Links', added, removed, note: reordered ? 'Order changed' : undefined });
  }
  return out;
}
