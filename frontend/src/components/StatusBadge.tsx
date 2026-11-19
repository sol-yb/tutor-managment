export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const style = normalized.includes('approve') || normalized.includes('paid') || normalized.includes('active') || normalized.includes('present')
    ? 'bg-emerald-100 text-emerald-800'
    : normalized.includes('reject') || normalized.includes('fail') || normalized.includes('cancel') || normalized.includes('absent')
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-800';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{value.replaceAll('_', ' ')}</span>;
}
