import type { PropsWithChildren } from 'react';
import { LeafMark } from './ui';

interface SectionTitleProps extends PropsWithChildren {
  eyebrow?: string;
}

export function SectionTitle({ eyebrow, children }: SectionTitleProps) {
  return (
    <div className="mx-auto mb-11 max-w-3xl text-center">
      {eyebrow && (
        <div className="mb-3 flex items-center justify-center gap-2 text-sm font-extrabold text-primary">
          <LeafMark />
          <span>{eyebrow}</span>
        </div>
      )}
      <h2 className="text-3xl font-black tracking-[-0.035em] text-ink sm:text-4xl">{children}</h2>
    </div>
  );
}
