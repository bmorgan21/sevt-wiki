import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import { btnPrimary, ErrorPanel, inputCls, Spinner } from '../components/ui';
import { useActiveCar } from '../state/car';
import { useCars, useSearch } from '../state/queries';
import { inCar } from '../lib/tree';
import { fmtDate } from '../lib/format';

export default function SearchView() {
  const car = useActiveCar();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const [allCars, setAllCars] = useState(false);
  const { data: cars = [] } = useCars();
  const { data: hits, isFetching, error, refetch } = useSearch(q);

  useEffect(() => { setText(q); }, [q]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(text.trim() ? { q: text.trim() } : {});
  };

  const shown = (hits ?? []).filter(h => allCars || inCar(h.page.carId, car.id));
  const hidden = (hits?.length ?? 0) - shown.length;
  const carName = (id: string | null) => (id === null ? 'Global' : cars.find(c => c.id === id)?.name ?? id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Breadcrumbs items={[{ label: car.name, to: `/c/${car.id}` }, { label: 'Search' }]} />
        <h1 className="text-2xl font-bold text-slate-900">Search</h1>
      </div>
      <form onSubmit={submit} role="search" className="flex gap-2">
        <input type="search" aria-label="Search page contents" value={text} onChange={e => setText(e.target.value)} className={inputCls} placeholder="Titles, tags and page text" autoFocus />
        <button type="submit" className={btnPrimary}><Search size={15} />Search</button>
      </form>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={allCars} onChange={e => setAllCars(e.target.checked)} />
        Include other cars
      </label>

      {q.trim().length < 2 && <p className="text-sm text-slate-600">Type at least two characters to search.</p>}
      {q.trim().length >= 2 && isFetching && <Spinner label="Searching…" />}
      {error && <ErrorPanel error={error} onRetry={() => { void refetch(); }} />}
      {hits && !isFetching && (
        <>
          <p className="text-sm text-slate-600" role="status">
            {shown.length} {shown.length === 1 ? 'result' : 'results'} for “{q}”{hidden > 0 && !allCars ? ` (${hidden} more in other cars)` : ''}
          </p>
          <ul className="space-y-3">
            {shown.map(h => (
              <li key={h.page.id}>
                <Link to={`/c/${h.page.carId ?? car.id}/p/${h.page.id}`} className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-red-700">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText size={15} aria-hidden className="text-red-700" />{h.page.title}</span>
                  <span className="mt-1 block text-sm text-slate-700">{h.snippet}</span>
                  <span className="mt-2 block text-xs text-slate-600">{carName(h.page.carId)} · updated {fmtDate(h.page.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
