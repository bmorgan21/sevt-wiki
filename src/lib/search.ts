/** Subsequence match for the command palette. Returns null when no match; higher is better. */
export function fuzzyScore(text: string, pattern: string): number | null {
  if (!pattern) return 0;
  const t = text.toLowerCase();
  const p = pattern.toLowerCase();
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let pi = 0; pi < p.length; pi++) {
    let found = false;
    while (ti < t.length) {
      const c = t[ti];
      ti++;
      if (c === p[pi]) {
        found = true;
        streak += 1;
        score += 1 + streak * 2;
        const prev = t[ti - 2];
        if (ti === 1 || prev === '/' || prev === ' ' || prev === '-') score += 5;
        break;
      }
      streak = 0;
    }
    if (!found) return null;
  }
  return score - t.length * 0.05;
}

export const tokenize = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(t => t.length > 0);

/** Every token must appear somewhere; title and tag hits weigh more than body hits. */
export function searchScore(f: { title: string; tags: string[]; content: string }, tokens: string[]): number {
  if (!tokens.length) return 0;
  const title = f.title.toLowerCase();
  const tags = f.tags.join(' ').toLowerCase();
  const body = f.content.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    const inTitle = title.includes(t);
    const inTags = tags.includes(t);
    const inBody = body.includes(t);
    if (!inTitle && !inTags && !inBody) return 0;
    score += (inTitle ? 5 : 0) + (inTags ? 3 : 0) + (inBody ? 1 : 0);
  }
  return score;
}

export function makeSnippet(content: string, tokens: string[], radius = 70): string {
  const flat = content.replace(/\s+/g, ' ');
  const lower = flat.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return flat.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + radius);
  return (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : '');
}
