import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { FilePlus, FileText, Folder, FolderPlus, Lock, Pencil, Trash2 } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import Modal, { ConfirmDialog } from '../components/Modal';
import { btn, btnPrimary, ErrorPanel, inputCls, labelCls, NotFoundPanel, Spinner } from '../components/ui';
import { errorMessage } from '../api';
import { usePermissions } from '../state/auth';
import { useActiveCar } from '../state/car';
import { useToast } from '../state/toast';
import { useCreateFolder, useDeleteFolder, useRenameFolder, useSubteams, useTree } from '../state/queries';
import { buildCrumbs, getIndex } from '../lib/tree';
import { validateFolderName } from '../lib/validation';
import { fmtDate } from '../lib/format';
import type { Location } from '../types';

type ModalKind = null | 'new' | 'rename' | 'delete';

function NameDialog({ title, initial, submitLabel, onSubmit, onClose }: { title: string; initial: string; submitLabel: string; onSubmit: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const bad = validateFolderName(name);
    if (bad) { setError(bad); return; }
    setBusy(true);
    try { await onSubmit(name.trim()); } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="folder-name" className={labelCls}>Folder name</label>
          <input id="folder-name" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function FolderView() {
  const { folderId, subteamId: subteamParam } = useParams();
  const car = useActiveCar();
  const navigate = useNavigate();
  const toast = useToast();
  const perms = usePermissions();
  const { data: tree, isLoading, error, refetch } = useTree();
  const { data: subteams = [] } = useSubteams();
  const [modal, setModal] = useState<ModalKind>(null);
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  if (isLoading) return <Spinner />;
  if (error || !tree) return <ErrorPanel error={error} onRetry={() => { void refetch(); }} />;

  const index = getIndex(tree);
  const folder = folderId ? index.foldersById.get(folderId) : undefined;
  const subteam = subteams.find(s => s.id === (folder ? folder.subteamId : subteamParam));
  if ((folderId && !folder) || !subteam) return <NotFoundPanel what="folder" />;
  if (folder?.carId && folder.carId !== car.id) return <Navigate to={`/c/${folder.carId}/f/${folder.id}`} replace />;

  const canEdit = perms.canEdit(subteam.id);
  const noEditHint = canEdit ? undefined : 'You need editor access in this subteam';
  const here: Location = { carId: subteam.globalOnly ? null : car.id, subteamId: subteam.id, folderId: folder?.id ?? null };
  const childFolders = index.foldersIn(subteam.id, folder?.id ?? null, car.id);
  const childPages = index.pagesIn(subteam.id, folder?.id ?? null, car.id);
  const newPageHref = `/c/${car.id}/new?subteam=${subteam.id}${folder ? `&folder=${folder.id}` : ''}`;
  const counts = folder ? index.descendantCounts(folder.id) : { folders: 0, pages: 0 };

  const afterDelete = () => navigate(folder?.parentId ? `/c/${car.id}/f/${folder.parentId}` : `/c/${car.id}/s/${subteam.id}`);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Breadcrumbs items={buildCrumbs(index, car, subteam, folder?.id ?? null)} />
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Folder size={26} aria-hidden className="text-red-700" />
              <span>{folder ? folder.name : subteam.name}</span>
              {subteam.restricted && <Lock size={18} aria-label="Restricted subteam" className="text-amber-700" />}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {folder ? `Folder in ${subteam.name}` : subteam.globalOnly ? 'Global subteam, shared by every car' : `Top level of ${subteam.name} for ${car.name}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={!canEdit} title={noEditHint} onClick={() => setModal('new')}><FolderPlus size={15} />New folder</button>
            {canEdit ? (
              <Link to={newPageHref} className={btnPrimary}><FilePlus size={15} />New page</Link>
            ) : (
              <button type="button" className={btnPrimary} disabled title={noEditHint}><FilePlus size={15} />New page</button>
            )}
            {folder && (
              <>
                <button type="button" className={btn} disabled={!canEdit} title={noEditHint} onClick={() => setModal('rename')}><Pencil size={15} />Rename</button>
                <button type="button" className={btn} disabled={!canEdit} title={noEditHint} onClick={() => setModal('delete')}><Trash2 size={15} />Delete</button>
              </>
            )}
          </div>
        </div>
      </div>

      {childFolders.length > 0 && (
        <section aria-labelledby="folders-h">
          <h2 id="folders-h" className="mb-3 text-sm font-semibold text-slate-700">Folders</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {childFolders.map(f => (
              <Link key={f.id} to={`/c/${car.id}/f/${f.id}`} className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-red-700">
                <span className="rounded bg-red-50 p-2 text-red-700 group-hover:bg-red-700 group-hover:text-white"><Folder size={20} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{f.name}</span>
                  <span className="text-xs text-slate-600">{f.carId === null ? 'Global' : car.name}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="pages-h">
        <h2 id="pages-h" className="mb-3 text-sm font-semibold text-slate-700">Pages</h2>
        {childPages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center">
            <FileText size={32} aria-hidden className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">No pages here yet.</p>
            {canEdit && <Link to={newPageHref} className={`${btnPrimary} mt-3`}>Create the first page</Link>}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {childPages.map(p => (
              <Link key={p.id} to={`/c/${car.id}/p/${p.id}`} className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-red-700">
                <div>
                  <span className="mb-2 inline-block rounded bg-red-50 p-1.5 text-red-700 group-hover:bg-red-700 group-hover:text-white"><FileText size={18} /></span>
                  <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{p.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{p.excerpt}</p>
                </div>
                <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span>v{p.version}</span>
                  <span>{fmtDate(p.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {modal === 'new' && (
        <NameDialog
          title="New folder" initial="" submitLabel="Create folder" onClose={() => setModal(null)}
          onSubmit={async name => { await createFolder.mutateAsync({ parent: here, name }); toast.success(`Created folder “${name}”`); setModal(null); }}
        />
      )}
      {modal === 'rename' && folder && (
        <NameDialog
          title="Rename folder" initial={folder.name} submitLabel="Save name" onClose={() => setModal(null)}
          onSubmit={async name => { await renameFolder.mutateAsync({ id: folder.id, name }); toast.success('Folder renamed'); setModal(null); }}
        />
      )}
      {modal === 'delete' && folder && (
        <ConfirmDialog
          title="Delete this folder?" confirmLabel="Delete folder" busy={deleteFolder.isPending} onClose={() => setModal(null)}
          onConfirm={() => {
            deleteFolder.mutateAsync(folder.id)
              .then(() => { toast.success(`Deleted “${folder.name}”`); setModal(null); afterDelete(); })
              .catch(e => toast.error(errorMessage(e)));
          }}
        >
          <p>“{folder.name}” will be deleted{counts.folders + counts.pages > 0 ? `, along with ${counts.pages} ${counts.pages === 1 ? 'page' : 'pages'} and ${counts.folders} ${counts.folders === 1 ? 'subfolder' : 'subfolders'} inside it` : ''}.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
