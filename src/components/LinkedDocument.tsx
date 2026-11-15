import { useState } from 'react';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import { btn, Spinner } from './ui';
import { hostOf, type EmbedInfo } from '../lib/embed';

/** Inline viewer for a recognised document. The iframe is sandboxed and only ever loads a vetted URL. */
export function DocFrame({ embed, url }: { embed: EmbedInfo; url: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <section aria-label={embed.label} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
          <FileText size={16} aria-hidden className="shrink-0 text-red-700" />
          <span className="truncate">{embed.label}</span>
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink size={14} />Open in new tab</a>
      </div>
      <div className="relative">
        {!loaded && <div className="absolute inset-0 grid place-items-center"><Spinner label="Loading document…" /></div>}
        <iframe
          src={embed.src}
          title={embed.label}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          onLoad={() => setLoaded(true)}
          className="block h-[75vh] min-h-[480px] w-full bg-white"
        />
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Seeing a sign-in or access message? The file has to be shared with your Google account. Use “Open in new tab” if it won’t load here.
      </p>
    </section>
  );
}

/** Fallback for links that can't be embedded. */
export function LinkCard({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-red-700">
      <span className="rounded bg-red-50 p-2 text-red-700"><Link2 size={18} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">Linked document</span>
        <span className="block truncate text-xs text-slate-600">{hostOf(url)}</span>
      </span>
      <ExternalLink size={16} aria-hidden className="shrink-0 text-slate-500" />
    </a>
  );
}
