import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import Markdown from '../components/Markdown';
import { AccessDenied, btn, btnPrimary, ErrorPanel, inputCls, labelCls, Spinner } from '../components/ui';
import { ApiError, errorMessage } from '../api';
import { usePermissions } from '../state/auth';
import { useActiveCar } from '../state/car';
import { useToast } from '../state/toast';
import { useCreatePage, usePage, useSubteams, useTree, useUpdatePage } from '../state/queries';
import { getIndex, locationOptions, type TreeIndex } from '../lib/tree';
import { storage } from '../lib/storage';
import { getEmbed } from '../lib/embed';
import { LIMITS, normalizeLinks, normalizeTags, validatePageInput } from '../lib/validation';
import type { Car, Page, PageInput, Subteam } from '../types';

interface LinkDraft { url: string; name: string }
interface LinkRow extends LinkDraft { id: number }
interface Draft { title: string; content: string; tags: string; links: LinkDraft[]; locValue: string }

const readDraft = (key: string): Draft | null => {
  const raw = storage.get(key);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      title: d.title ?? '',
      content: d.content ?? '',
      tags: d.tags ?? '',
      locValue: d.locValue ?? '',
      links: Array.isArray(d.links) ? d.links.map(l => ({ url: String(l?.url ?? ''), name: String(l?.name ?? '') })) : [],
    };
  } catch {
    return null;
  }
};

interface FormProps { page?: Page; car: Car; index: TreeIndex; subteams: Subteam[] }

function EditorForm({ page, car, index, subteams }: FormProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const perms = usePermissions();
  const [params] = useSearchParams();
  const createPage = useCreatePage();
  const updatePage = useUpdatePage();
  const uid = useId();

  // The version we started from. Never changes while editing, even if the page refetches.
  const baseVersion = useRef(page?.version ?? 0);
  const saved = useRef(false);
  const nextLinkId = useRef(1);

  const carContext = page?.carId ?? car.id;
  const options = useMemo(() => locationOptions(index, subteams, perms.canEdit, carContext), [index, subteams, perms, carContext]);

  const requested = params.get('folder') ? `f:${params.get('folder')}` : params.get('subteam') ? `s:${params.get('subteam')}` : '';
  const pageLoc = page ? (page.folderId ? `f:${page.folderId}` : `s:${page.subteamId}`) : requested;
  const startLoc = options.some(o => o.value === pageLoc) ? pageLoc : options[0]?.value ?? '';

  const initial = useRef<Draft>({
    title: page?.title ?? '',
    content: page?.content ?? '',
    tags: page ? page.tags.join(', ') : '',
    links: page ? page.links.map(l => ({ url: l.url, name: l.name })) : [],
    locValue: startLoc,
  });
  const [title, setTitle] = useState(initial.current.title);
  const [content, setContent] = useState(initial.current.content);
  const [tags, setTags] = useState(initial.current.tags);
  const [links, setLinks] = useState<LinkRow[]>(() => initial.current.links.map(l => ({ id: nextLinkId.current++, ...l })));
  const [locValue, setLocValue] = useState(initial.current.locValue);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [error, setError] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const draftKey = `sev-wiki:draft:${page?.id ?? 'new'}`;
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(() => {
    const d = readDraft(draftKey);
    return d && JSON.stringify(d) !== JSON.stringify(initial.current) ? d : null;
  });

  const current = useMemo<Draft>(
    () => ({ title, content, tags, locValue, links: links.map(l => ({ url: l.url, name: l.name })) }),
    [title, content, tags, locValue, links],
  );
  const dirty = JSON.stringify(current) !== JSON.stringify(initial.current);

  // Autosave a local draft so a closed tab or a failed save never loses work.
  useEffect(() => {
    if (pendingDraft || saved.current) return;
    const t = window.setTimeout(() => {
      if (dirty) storage.set(draftKey, JSON.stringify(current));
      else storage.remove(draftKey);
    }, 600);
    return () => window.clearTimeout(t);
  }, [current, dirty, draftKey, pendingDraft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setTitle(pendingDraft.title);
    setContent(pendingDraft.content);
    setTags(pendingDraft.tags);
    setLinks(pendingDraft.links.map(l => ({ id: nextLinkId.current++, ...l })));
    if (options.some(o => o.value === pendingDraft.locValue)) setLocValue(pendingDraft.locValue);
    setPendingDraft(null);
  };
  const discardDraft = () => { storage.remove(draftKey); setPendingDraft(null); };

  const addLink = () => setLinks(ls => [...ls, { id: nextLinkId.current++, url: '', name: '' }]);
  const removeLink = (id: number) => setLinks(ls => ls.filter(l => l.id !== id));
  const editLink = (id: number, patch: Partial<LinkDraft>) => setLinks(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const save = async (expected: number) => {
    setError(null);
    const input: PageInput = {
      title: title.trim(),
      content,
      tags: normalizeTags(tags),
      links: normalizeLinks(links.map(l => ({ url: l.url, name: l.name }))),
    };
    const invalid = validatePageInput(input);
    if (invalid) { setError(invalid); return; }
    const opt = options.find(o => o.value === locValue);
    if (!opt) { setError('Choose where this page should live.'); return; }
    setBusy(true);
    try {
      let target: Page;
      if (page) {
        const moved = locValue !== pageLoc;
        target = await updatePage.mutateAsync({ id: page.id, input: { ...input, location: moved ? opt.loc : undefined }, expectedVersion: expected });
        toast.success(`Saved as version ${target.version}`);
      } else {
        target = await createPage.mutateAsync({ loc: opt.loc, input });
        toast.success(`Created “${target.title}”`);
      }
      saved.current = true;
      storage.remove(draftKey);
      navigate(`/c/${car.id}/p/${target.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') setConflictVersion(Number(e.details?.currentVersion) || null);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void save(baseVersion.current); };
  const cancelTo = page ? `/c/${car.id}/p/${page.id}` : `/c/${car.id}`;

  if (options.length === 0) return <AccessDenied message="You don’t have editor access in any subteam yet. Ask a subteam lead to add you." />;

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <Breadcrumbs items={[{ label: car.name, to: `/c/${car.id}` }, { label: page ? `Edit “${page.title}”` : 'New page' }]} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{page ? 'Edit page' : 'New page'}</h1>
          <div className="flex items-center gap-2">
            <Link to={cancelTo} className={btn}>Cancel</Link>
            <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : page ? 'Save changes' : 'Create page'}</button>
          </div>
        </div>
      </div>

      {pendingDraft && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>You have unsaved changes from an earlier session.</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={restoreDraft}>Restore changes</button>
            <button type="button" className={btn} onClick={discardDraft}>Discard them</button>
          </span>
        </div>
      )}

      {conflictVersion !== null && (
        <div role="alert" className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p>Someone else saved version {conflictVersion} while you were editing. Your text is still here and kept as a draft.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => { void save(conflictVersion); }}>Save mine over theirs</button>
            {page && <a href={`#/c/${car.id}/p/${page.id}`} target="_blank" rel="noreferrer" className={btn}>Open their version in a new tab</a>}
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${uid}-title`} className={labelCls}>Title</label>
          <input id={`${uid}-title`} value={title} onChange={e => setTitle(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label htmlFor={`${uid}-loc`} className={labelCls}>Location</label>
          <select id={`${uid}-loc`} value={locValue} onChange={e => setLocValue(e.target.value)} className={inputCls}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-tags`} className={labelCls}>Tags (comma separated)</label>
          <input id={`${uid}-tags`} value={tags} onChange={e => setTags(e.target.value)} className={inputCls} />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className={labelCls}>Linked documents (optional)</legend>
        <p className="text-xs text-slate-600">
          Google Docs, Sheets, Slides and Drive files or folders are embedded on the page as tabs. Other links appear as link cards.
          The name is shown on the tab or card; leave it blank to use a default.
        </p>
        {links.length === 0 && <p className="text-sm text-slate-600">No links yet.</p>}
        {links.map((row, i) => {
          const url = row.url.trim();
          const embed = url ? getEmbed(url) : null;
          return (
            <div key={row.id} className="rounded border border-slate-200 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input
                  aria-label={`Link ${i + 1} name`}
                  value={row.name}
                  maxLength={LIMITS.linkName}
                  onChange={e => editLink(row.id, { name: e.target.value })}
                  placeholder="Name, e.g. Budget workbook"
                  className={inputCls}
                />
                <input
                  aria-label={`Link ${i + 1} URL`}
                  type="url"
                  value={row.url}
                  onChange={e => editLink(row.id, { url: e.target.value })}
                  placeholder="https://docs.google.com/…"
                  className={inputCls}
                />
                <button type="button" className={btn} onClick={() => removeLink(row.id)} aria-label={`Remove link ${i + 1}`}><Trash2 size={15} /></button>
              </div>
              {url && <p className="mt-1.5 text-xs text-slate-600">{embed ? `Embedded on the page as a ${embed.label}.` : 'Shown as a link card.'}</p>}
            </div>
          );
        })}
        <button type="button" className={btn} onClick={addLink} disabled={links.length >= LIMITS.links}><Plus size={15} />Add link</button>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor={`${uid}-body`} className={labelCls + ' mb-0'}>Content</label>
          <div role="tablist" aria-label="Editor mode" className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['write', 'preview'] as const).map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-sm font-semibold ${tab === t ? 'bg-white text-red-800 shadow-sm' : 'text-slate-600'}`}>
                {t === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
        </div>
        {tab === 'write' ? (
          <>
            <textarea id={`${uid}-body`} value={content} onChange={e => setContent(e.target.value)} className="min-h-[50vh] w-full rounded border border-slate-300 bg-white p-3 font-mono text-sm focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/30" />
            <p className="text-xs text-slate-600">
              Markdown with tables and fenced code (add a language after the backticks). Math uses $inline$ and $$block$$; write \$ for a literal dollar sign.
            </p>
          </>
        ) : (
          <div className="min-h-[50vh] rounded border border-slate-300 bg-white p-4">
            {content.trim() ? <Markdown source={content} /> : <p className="text-sm text-slate-600">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </form>
  );
}

export default function PageEditorView() {
  const { pageId } = useParams();
  const car = useActiveCar();
  const perms = usePermissions();
  const { data: page, error, isLoading, refetch } = usePage(pageId);
  const { data: tree, isLoading: treeLoading, error: treeError } = useTree();
  const { data: subteams = [] } = useSubteams();

  if (isLoading || treeLoading) return <Spinner />;
  if (error) return <ErrorPanel error={error} onRetry={() => { void refetch(); }} />;
  if (treeError || !tree) return <ErrorPanel error={treeError} />;
  if (page && !perms.canEdit(page.subteamId)) return <AccessDenied message="You need editor access in this subteam to edit its pages." />;

  return <EditorForm key={page?.id ?? 'new'} page={page} car={car} index={getIndex(tree)} subteams={subteams} />;
}
