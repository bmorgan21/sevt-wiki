import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Markdown from '../components/Markdown';
import Modal from '../components/Modal';
import { btnPrimary, ErrorPanel, Spinner } from '../components/ui';
import { errorMessage } from '../api';
import { useCars, useRevisions, useRollbackPage, useSubteams, useTree } from '../state/queries';
import { useToast } from '../state/toast';
import { diffWithContext, lineDiff } from '../lib/diff';
import { diffRevisionMeta } from '../lib/revisionDiff';
import { describeLocation, getIndex, type TreeIndex } from '../lib/tree';
import { isSafeExternalUrl } from '../lib/validation';
import { fmtDateTime } from '../lib/format';
import type { Page, Revision } from '../types';

const sameSpot = (a: Revision, b: Revision | Page) => a.carId === b.carId && a.subteamId === b.subteamId && a.folderId === b.folderId;

function Chips({ items, tone = 'slate' }: { items: string[]; tone?: 'slate' | 'green' | 'red' }) {
  const cls = tone === 'green' ? 'bg-green-100 text-green-900' : tone === 'red' ? 'bg-red-100 text-red-900 line-through' : 'bg-slate-200 text-slate-800';
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map(t => <span key={t} className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{t}</span>)}
    </span>
  );
}

function Details({ rev, location }: { rev: Revision; location: string }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-[6rem_1fr]">
      <dt className="font-semibold text-slate-700">Title</dt>
      <dd className="min-w-0 break-words text-slate-900">{rev.title}</dd>
      <dt className="font-semibold text-slate-700">Location</dt>
      <dd className="min-w-0 break-words text-slate-900">{location}</dd>
      <dt className="font-semibold text-slate-700">Tags</dt>
      <dd>{rev.tags.length ? <Chips items={rev.tags} /> : <span className="text-slate-600">None</span>}</dd>
      <dt className="font-semibold text-slate-700">Links</dt>
      <dd className="min-w-0">
        {rev.links.length === 0 ? <span className="text-slate-600">None</span> : (
          <ul className="space-y-1">
            {rev.links.map(l => (
              <li key={l.url} className="min-w-0 break-words">
                {isSafeExternalUrl(l.url)
                  ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-red-800 hover:underline">{l.name || l.url}</a>
                  : <span>{l.name || l.url}</span>}
                {l.name && <span className="block truncate text-xs text-slate-600">{l.url}</span>}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </dl>
  );
}

interface Props { page: Page; canEdit: boolean; onClose: () => void }

export default function HistoryDialog({ page, canEdit, onClose }: Props) {
  const { data: revisions, isLoading, error } = useRevisions(page.id);
  const { data: cars = [] } = useCars();
  const { data: subteams = [] } = useSubteams();
  const { data: tree } = useTree();
  const index: TreeIndex | null = useMemo(() => (tree ? getIndex(tree) : null), [tree]);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<'preview' | 'changes'>('preview');
  const rollback = useRollbackPage();
  const toast = useToast();

  const where = (r: Revision) =>
    index ? describeLocation(r, { index, cars, subteams }) : '…';

  return (
    <Modal title="Revision history" onClose={onClose} wide>
      {isLoading && <Spinner />}
      {error && <ErrorPanel error={error} />}
      {revisions && (() => {
        const current = revisions.find(r => r.version === (selected ?? page.version)) ?? revisions[0];
        const previous = revisions.find(r => r.version === current.version - 1);
        const isLatest = current.version === page.version;
        const folderGone = !!index && !!current.folderId && !index.foldersById.has(current.folderId);

        const metaChanges = previous
          ? diffRevisionMeta(previous, current, { changed: !sameSpot(previous, current), before: where(previous), after: where(current) })
          : [];
        const diff = previous ? lineDiff(previous.content, current.content) : null;
        const rows = diff ? diffWithContext(diff) : null;
        const textChanged = !!rows && rows.some(r => r.type === 'add' || r.type === 'del');

        return (
          <div className="grid h-full min-h-0 gap-4 md:grid-cols-[14rem_1fr]">
            <ul className="space-y-2 overflow-y-auto md:border-r md:border-slate-200 md:pr-3" aria-label="Versions">
              {revisions.map(r => (
                <li key={r.version}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.version)}
                    aria-current={r.version === current.version}
                    className={`w-full rounded-lg border p-3 text-left ${r.version === current.version ? 'border-red-700 bg-red-50 text-red-900' : 'border-transparent bg-slate-50 hover:border-slate-300'}`}
                  >
                    <span className="block text-sm font-semibold">v{r.version}{r.version === page.version ? ' (current)' : ''}</span>
                    <span className="block truncate text-xs text-slate-700">{r.title}</span>
                    <span className="block text-xs text-slate-600">{r.author.name}</span>
                    <span className="block text-xs text-slate-600">{fmtDateTime(r.createdAt)}</span>
                    {r.note && <span className="mt-1 block text-xs italic text-slate-600">{r.note}</span>}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="tablist" aria-label="View" className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  {(['preview', 'changes'] as const).map(m => (
                    <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-sm font-semibold ${mode === m ? 'bg-white text-red-800 shadow-sm' : 'text-slate-600'}`}>
                      {m === 'preview' ? 'This version' : 'Changes'}
                    </button>
                  ))}
                </div>
                {!isLatest && (
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={!canEdit || rollback.isPending}
                    title={canEdit ? undefined : 'You need editor access in this subteam'}
                    onClick={() => {
                      rollback.mutateAsync({ id: page.id, toVersion: current.version, expectedVersion: page.version })
                        .then(restored => {
                          const placed = sameSpot(current, restored);
                          toast.success(placed
                            ? `Restored v${current.version} as a new version`
                            : `Restored v${current.version}, but its original location is unavailable, so the page stayed where it was`);
                          onClose();
                        })
                        .catch(e => toast.error(errorMessage(e)));
                    }}
                  >
                    <RotateCcw size={15} />Restore v{current.version}
                  </button>
                )}
              </div>

              {!isLatest && (
                <p className="text-xs text-slate-600">
                  Restoring brings back this version’s title, location, tags, links and text, and saves them as a new version. Nothing is lost from the history.
                  {folderGone && ' Its folder has since been deleted, so the page will stay where it is now.'}
                </p>
              )}

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
                {mode === 'preview' && (
                  <>
                    <Details rev={current} location={where(current)} />
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-700">Text</h3>
                      {current.content.trim() ? <Markdown source={current.content} /> : <p className="text-sm text-slate-600">This version has no text.</p>}
                    </div>
                  </>
                )}

                {mode === 'changes' && (
                  !previous ? <p className="text-sm text-slate-600">This is the first version, so there is nothing to compare.</p> : (
                    <>
                      <section aria-label="Details that changed" className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-700">Title, location, tags and links</h3>
                        {metaChanges.length === 0 ? <p className="text-sm text-slate-600">None of these changed.</p> : (
                          <ul className="space-y-2">
                            {metaChanges.map(c => (
                              <li key={c.field} className="rounded border border-slate-200 bg-slate-50 p-2.5 text-sm">
                                <span className="font-semibold text-slate-800">{c.field}</span>
                                {c.before !== undefined && c.after !== undefined && (
                                  <div className="mt-1 space-y-1">
                                    <div className="break-words rounded bg-red-100 px-2 py-0.5 text-red-900"><span className="sr-only">Before: </span>− {c.before}</div>
                                    <div className="break-words rounded bg-green-100 px-2 py-0.5 text-green-900"><span className="sr-only">After: </span>+ {c.after}</div>
                                  </div>
                                )}
                                {c.field === 'Tags' && (
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    {c.added && c.added.length > 0 && <><span className="text-xs text-slate-600">Added</span><Chips items={c.added} tone="green" /></>}
                                    {c.removed && c.removed.length > 0 && <><span className="text-xs text-slate-600">Removed</span><Chips items={c.removed} tone="red" /></>}
                                  </div>
                                )}
                                {c.field === 'Links' && (
                                  <div className="mt-1 space-y-1">
                                    {c.added?.map(l => <div key={`a-${l}`} className="break-words rounded bg-green-100 px-2 py-0.5 text-green-900"><span className="sr-only">Added: </span>+ {l}</div>)}
                                    {c.removed?.map(l => <div key={`r-${l}`} className="break-words rounded bg-red-100 px-2 py-0.5 text-red-900"><span className="sr-only">Removed: </span>− {l}</div>)}
                                    {c.note && <div className="text-xs text-slate-600">{c.note}</div>}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>

                      <section aria-label="Text that changed" className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-700">Text</h3>
                        {!rows ? <p className="text-sm text-slate-600">This page is too large to compare line by line.</p>
                          : !textChanged ? <p className="text-sm text-slate-600">The text is unchanged in this version.</p>
                          : (
                            <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-50 text-xs leading-5">
                              {rows.map((r, i) => r.type === 'gap' ? (
                                <div key={i} className="bg-slate-100 px-3 py-0.5 text-slate-600">… {r.count} unchanged {r.count === 1 ? 'line' : 'lines'}</div>
                              ) : (
                                <div key={i} className={`whitespace-pre-wrap px-3 ${r.type === 'add' ? 'bg-green-100 text-green-900' : r.type === 'del' ? 'bg-red-100 text-red-900' : 'text-slate-700'}`}>
                                  <span aria-hidden className="mr-2 inline-block w-3 select-none">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span>
                                  <span className="sr-only">{r.type === 'add' ? 'Added: ' : r.type === 'del' ? 'Removed: ' : ''}</span>
                                  {r.text || ' '}
                                </div>
                              ))}
                            </pre>
                          )}
                      </section>
                    </>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
