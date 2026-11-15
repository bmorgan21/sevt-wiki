import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Crumb } from '../lib/tree';

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${c.label}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-slate-400" />}
              {c.to && !last ? (
                <Link to={c.to} className="max-w-[220px] truncate hover:text-red-800 hover:underline">{c.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={`max-w-[320px] truncate ${last ? 'font-semibold text-slate-900' : ''}`}>{c.label}</span>
              )}
              {c.badge && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-800">{c.badge}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
