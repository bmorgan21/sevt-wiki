import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Markdown from '../components/Markdown';
import Modal from '../components/Modal';
import { btnPrimary, ErrorPanel, Spinner } from '../components/ui';
import { errorMessage } from '../api';
import { useRevisions, useRollbackPage } from '../state/queries';
import { useToast } from '../state/toast';
import { diffWithContext, lineDiff } from '../lib/diff';
import { fmtDateTime } from '../lib/format';
import type { Page } from '../types';

export default function HistoryDialog({ page, canEdit, onClose }: { page: Page; canEdit: boolean; onClose: () => void }) {
  const { data: revisions, isLoading, error } = useRevisions(page.id);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<'preview' | 'changes'>('preview');
  const rollback = useRollbackPage();
  const toast = useToast();

  return (
    <Modal title="Revision history" onClose={onClose} wide>
      {isLoading && <Spinner />}
      {error && <ErrorPanel error={error} />}
      {revisions && (() => {
        const current = revisions.find(r => r.version === (selected ?? page.version)) ?? revisions[0];
        const previous = revisions.find(r => r.version === current.version - 1);
        const diff = previous ? lineDiff(previous.content, current.content) : null;
        const rows = diff ? diffWithContext(diff) : null;
        const isLatest = current.version === page.version;
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
                      {m === 'preview' ? 'Preview' : 'Changes'}
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
                        .then(() => { toast.success(`Restored v${current.version} as a new version`); onClose(); })
                        .catch(e => toast.error(errorMessage(e)));
                    }}
                  >
                    <RotateCcw size={15} />Restore v{current.version}
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
                {mode === 'preview' && (
                  <>
                    <h3 className="mb-3 text-xl font-bold text-slate-900">{current.title}</h3>
                    <Markdown source={current.content} />
                  </>
                )}
                {mode === 'changes' && (
                  !previous ? <p className="text-sm text-slate-600">This is the first version, so there is nothing to compare.</p>
                  : !rows ? <p className="text-sm text-slate-600">This page is too large to compare line by line.</p>
                  : (
                    <div className="space-y-2">
                      {previous.title !== current.title && <p className="text-sm text-slate-700">Title changed from “{previous.title}” to “{current.title}”.</p>}
                      {rows.every(r => r.type === 'gap' || r.type === 'same') && <p className="text-sm text-slate-600">The text is unchanged in this version.</p>}
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
                    </div>
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
