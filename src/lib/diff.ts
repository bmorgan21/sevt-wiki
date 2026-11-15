export type DiffLine = { type: 'same' | 'add' | 'del'; text: string };
export type DiffGap = { type: 'gap'; count: number };

/** Line diff via LCS. Returns null when the inputs are too large to diff cheaply. */
export function lineDiff(a: string, b: string): DiffLine[] | null {
  const x = a.split('\n');
  const y = b.split('\n');
  if (x.length * y.length > 4_000_000) return null;
  const dp: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ type: 'same', text: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: x[i] }); i++; }
    else { out.push({ type: 'add', text: y[j] }); j++; }
  }
  while (i < x.length) out.push({ type: 'del', text: x[i++] });
  while (j < y.length) out.push({ type: 'add', text: y[j++] });
  return out;
}

/** Collapse long unchanged runs, keeping `ctx` lines around each change. */
export function diffWithContext(diff: DiffLine[], ctx = 2): Array<DiffLine | DiffGap> {
  const keep = new Array<boolean>(diff.length).fill(false);
  diff.forEach((d, i) => {
    if (d.type === 'same') return;
    for (let k = Math.max(0, i - ctx); k <= Math.min(diff.length - 1, i + ctx); k++) keep[k] = true;
  });
  const out: Array<DiffLine | DiffGap> = [];
  let gap = 0;
  diff.forEach((d, i) => {
    if (keep[i]) {
      if (gap) { out.push({ type: 'gap', count: gap }); gap = 0; }
      out.push(d);
    } else gap++;
  });
  if (gap) out.push({ type: 'gap', count: gap });
  return out;
}
