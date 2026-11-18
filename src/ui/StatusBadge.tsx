export type StatusTone = 'ok' | 'attention' | 'progress' | 'error' | 'muted';

const TONES: Record<StatusTone, string> = {
  ok: 'text-green-800 bg-green-100 dark:text-green-200 dark:bg-green-900/50',
  attention: 'text-amber-800 bg-amber-100 dark:text-amber-200 dark:bg-amber-900/50',
  progress: 'text-sky-800 bg-sky-100 dark:text-sky-200 dark:bg-sky-900/50',
  error: 'text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-900/50',
  muted: 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-700',
};

export default function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }): React.ReactElement {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}
