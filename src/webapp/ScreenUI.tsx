import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-3xl font-black tracking-[-0.035em] text-ink sm:text-4xl">{title}</h1>
        <p className="mt-2 text-base font-medium leading-7 text-muted sm:text-lg">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`rounded-3xl border border-deep/10 bg-white p-5 shadow-[0_10px_30px_rgba(47,93,53,0.06)] sm:p-6 ${className}`}>{children}</section>;
}

export function PanelHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-black tracking-tight text-ink sm:text-2xl">{title}</h2>
      {aside}
    </div>
  );
}

export function StatusBadge({ children, tone = 'green' }: PropsWithChildren<{ tone?: 'green' | 'yellow' | 'blue' | 'gray' }>) {
  const styles = {
    green: 'bg-sage text-deep',
    yellow: 'bg-[#FFF0BF] text-[#805D09]',
    blue: 'bg-[#E2F2FF] text-[#236A9E]',
    gray: 'bg-[#EEF0EC] text-muted',
  };
  return <span className={`inline-flex min-h-8 items-center rounded-full px-3 py-1 text-sm font-extrabold ${styles[tone]}`}>{children}</span>;
}

export function FactRow({ label, value, last = false }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <div className={`grid gap-2 py-3 sm:grid-cols-[110px_1fr] sm:gap-5 ${last ? '' : 'border-b border-deep/10'}`}>
      <span className="font-bold text-muted">{label}</span>
      <strong className="font-extrabold leading-7 text-ink">{value}</strong>
    </div>
  );
}

export function Callout({ children, safe = false }: PropsWithChildren<{ safe?: boolean }>) {
  const Icon = safe ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${safe ? 'border-deep/20 bg-sage/60 text-deep' : 'border-[#D89B25]/40 bg-[#FFF3CF] text-[#654B16]'}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="font-bold leading-7">{children}</div>
    </div>
  );
}

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
}

export function ActionButton({ children, className = '', variant = 'primary', type = 'button', ...props }: ActionButtonProps) {
  const styles = {
    primary: 'border-deep bg-deep text-white shadow-[0_8px_20px_rgba(47,93,53,0.16)] hover:bg-[#244D2B]',
    secondary: 'border-primary/35 bg-white text-deep hover:bg-sage/35',
    quiet: 'border-transparent bg-sage/55 text-deep hover:bg-sage',
    danger: 'border-[#9A3732] bg-[#9A3732] text-white hover:bg-[#7E2925]',
  };
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-base font-extrabold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-[#DCE4D9]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
