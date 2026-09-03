import type { AnchorHTMLAttributes, PropsWithChildren } from 'react';

export function Container({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10 ${className}`}>{children}</div>;
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: 'primary' | 'secondary';
}

export function ButtonLink({ children, className = '', variant = 'primary', ...props }: ButtonLinkProps) {
  const styles = variant === 'primary'
    ? 'bg-deep text-white shadow-[0_10px_24px_rgba(47,93,53,0.22)] hover:bg-[#244d2b]'
    : 'border border-[#d7ddd3] bg-white text-ink shadow-sm hover:border-primary hover:text-deep';

  return (
    <a
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-base font-bold transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 ${styles} ${className}`}
      {...props}
    >
      {children}
    </a>
  );
}

export function LeafMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-0.5 ${className}`} aria-hidden="true">
      <span className="h-2.5 w-5 -rotate-[24deg] rounded-[100%_0_100%_0] bg-[#7FAE35]" />
      <span className="h-2 w-4 rotate-[22deg] rounded-[100%_0_100%_0] bg-primary" />
    </span>
  );
}
