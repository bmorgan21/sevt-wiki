import { Link } from 'react-router-dom';
import { FileText, Folder, Globe, Lock } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import { ErrorPanel, Spinner } from '../components/ui';
import { useActiveCar } from '../state/car';
import { useSubteams, useTree } from '../state/queries';
import { inCar } from '../lib/tree';
import { fmtDate } from '../lib/format';

export default function HomeView() {
  const car = useActiveCar();
  const { data: tree, isLoading, error, refetch } = useTree();
  const { data: subteams = [] } = useSubteams();
  if (isLoading) return <Spinner />;
  if (error || !tree) return <ErrorPanel error={error} onRetry={() => { void refetch(); }} />;

  const pages = tree.pages.filter(p => inCar(p.carId, car.id));
  const recent = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Breadcrumbs items={[{ label: car.name }]} />
        <h1 className="text-2xl font-bold text-slate-900">{car.name} workspace</h1>
        <p className="mt-1 text-sm text-slate-600">{car.status} · includes global pages shared across cars</p>
      </div>

      <section aria-labelledby="subteams-h">
        <h2 id="subteams-h" className="mb-3 text-base font-semibold text-slate-900">Subteams</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subteams.map(sub => {
            const count = pages.filter(p => p.subteamId === sub.id).length;
            return (
              <Link key={sub.id} to={`/c/${car.id}/s/${sub.id}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-red-700">
                <span className="rounded bg-red-50 p-2 text-red-700">{sub.globalOnly ? <Globe size={18} /> : <Folder size={18} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <span className="truncate">{sub.name}</span>
                    {sub.restricted && <Lock size={12} aria-label="Restricted" className="shrink-0 text-amber-700" />}
                  </span>
                  <span className="text-xs text-slate-600">{count} {count === 1 ? 'page' : 'pages'}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 text-base font-semibold text-slate-900">Recently updated</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-600">No pages yet. Open a subteam to create the first one.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {recent.map(p => (
              <li key={p.id}>
                <Link to={`/c/${car.id}/p/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <FileText size={16} aria-hidden className="shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{p.title}</span>
                    <span className="block truncate text-xs text-slate-600">{p.excerpt}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">{p.updatedBy.name} · {fmtDate(p.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
