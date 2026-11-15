import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Copy, Edit3, History, Lock, Trash2 } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import Markdown from '../components/Markdown';
import Modal, { ConfirmDialog } from '../components/Modal';
import HistoryDialog from './HistoryDialog';
import { DocFrame, LinkCard } from '../components/LinkedDocument';
import { btn, btnPrimary, ErrorPanel, inputCls, labelCls, Spinner } from '../components/ui';
import { errorMessage } from '../api';
import { usePermissions } from '../state/auth';
import { useActiveCar } from '../state/car';
import { useToast } from '../state/toast';
import { useDeletePage, useDuplicatePage, usePage, useSubteams, useTree } from '../state/queries';
import { buildCrumbs, getIndex } from '../lib/tree';
import { fmtDateTime } from '../lib/format';
import { getEmbed } from '../lib/embed';
import type { Page } from '../types';

function DuplicateDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const car = useActiveCar();
  const navigate = useNavigate();
  const toast = useToast();
  const dup = useDuplicatePage();
  const [title, setTitle] = useState(`${page.title} (copy)`);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const copy = await dup.mutateAsync({ id: page.id, title });
      toast.success(`Created “${copy.title}”`);
      onClose();
      navigate(`/c/${car.id}/p/${copy.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title="Duplicate page" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="dup-title" className={labelCls}>Title for the copy</label>
          <input id="dup-title" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
          {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={dup.isPending}>{dup.isPending ? 'Duplicating…' : 'Duplicate page'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function PageView() {
  const { pageId } = useParams();
  const car = useActiveCar();
  const navigate = useNavigate();
  const toast = useToast();
  const perms = usePermissions();
  const { data: page, error, isLoading, refetch } = usePage(pageId);
  const { data: tree } = useTree();
  const { data: subteams = [] } = useSubteams();
  const [modal, setModal] = useState<null | 'history' | 'duplicate' | 'delete'>(null);
  const [tab, setTab] = useState<'page' | 'doc' | null>(null);
  const del = useDeletePage();

  if (isLoading) return <Spinner />;
  if (error || !page) return <ErrorPanel error={error} onRetry={() => { void refetch(); }} />;
  if (page.carId && page.carId !== car.id) return <Navigate to={`/c/${page.carId}/p/${page.id}`} replace />;

  const subteam = subteams.find(s => s.id === page.subteamId);
  const canEdit = perms.canEdit(page.subteamId);
  const hint = canEdit ? undefined : 'You need editor access in this subteam';
  const embed = page.externalLink ? getEmbed(page.externalLink) : null;
  // Pages with no notes open straight onto their document.
  const activeTab = tab ?? (embed && !page.content.trim() ? 'doc' : 'page');
  const crumbs = tree
    ? buildCrumbs(getIndex(tree), car, subteam, page.folderId, page.title)
    : [{ label: car.name, to: `/c/${car.id}` }, { label: page.title }];

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <div>
        <Breadcrumbs items={crumbs} />
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {subteam?.restricted && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"><Lock size={11} />Restricted subteam</span>}
              {page.tags.map(tag => (
                <Link key={tag} to={`/c/${car.id}/search?q=${encodeURIComponent(tag)}`} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200">{tag}</Link>
              ))}
            </div>
            <h1 className="text-3xl font-bold text-slate-900">{page.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>Created by <b className="font-semibold text-slate-800">{page.createdBy.name}</b></span>
              <span>Updated by <b className="font-semibold text-slate-800">{page.updatedBy.name}</b>, {fmtDateTime(page.updatedAt)}</span>
              <span>Version <b className="font-semibold text-red-800">{page.version}</b></span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Link to={`/c/${car.id}/p/${page.id}/edit`} className={btn}><Edit3 size={15} />Edit page</Link>
            ) : (
              <button type="button" className={btn} disabled title={hint}><Edit3 size={15} />Edit page</button>
            )}
            <button type="button" className={btn} disabled={!canEdit} title={hint} onClick={() => setModal('duplicate')}><Copy size={15} />Duplicate</button>
            <button type="button" className={btn} onClick={() => setModal('history')}><History size={15} />History ({page.version})</button>
            <button type="button" className={btn} disabled={!canEdit} title={hint} onClick={() => setModal('delete')}><Trash2 size={15} />Delete</button>
          </div>
        </div>
      </div>

      {embed ? (
        <div className="space-y-4">
          <div role="tablist" aria-label="Page sections" className="flex gap-1 border-b border-slate-200">
            {([['page', 'Notes'], ['doc', embed.label]] as const).map(([id, label]) => (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${activeTab === id ? 'border-red-800 text-red-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div id="panel-page" role="tabpanel" aria-labelledby="tab-page" hidden={activeTab !== 'page'}>
            {page.content.trim() ? <Markdown source={page.content} /> : <p className="text-sm text-slate-600">This page has no notes. The document is in the other tab.</p>}
          </div>
          <div id="panel-doc" role="tabpanel" aria-labelledby="tab-doc" hidden={activeTab !== 'doc'}>
            {activeTab === 'doc' && <DocFrame embed={embed} url={page.externalLink} />}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {page.externalLink && <LinkCard url={page.externalLink} />}
          <Markdown source={page.content} />
        </div>
      )}

      {modal === 'history' && <HistoryDialog page={page} canEdit={canEdit} onClose={() => setModal(null)} />}
      {modal === 'duplicate' && <DuplicateDialog page={page} onClose={() => setModal(null)} />}
      {modal === 'delete' && (
        <ConfirmDialog
          title="Delete this page?" confirmLabel="Delete page" busy={del.isPending} onClose={() => setModal(null)}
          onConfirm={() => {
            del.mutateAsync(page.id)
              .then(() => {
                toast.success(`Deleted “${page.title}”`);
                setModal(null);
                navigate(page.folderId ? `/c/${car.id}/f/${page.folderId}` : `/c/${car.id}/s/${page.subteamId}`, { replace: true });
              })
              .catch(e => toast.error(errorMessage(e)));
          }}
        >
          <p>“{page.title}” will be removed from the wiki.</p>
        </ConfirmDialog>
      )}
    </article>
  );
}
