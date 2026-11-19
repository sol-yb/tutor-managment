import type { ReactNode } from 'react';

export function DataPanel({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-emerald-950/5 bg-white p-5 shadow-card">
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between">
          {title && <h2 className="font-bold text-forest-950">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
