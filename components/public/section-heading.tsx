import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion/reveal';

/** En-tête de section EtSmart : étiquette cyan, titre sur deux lignes (la seconde en dégradé), sous-titre. */
export function SectionHeading({
  eyebrow,
  title,
  accent,
  subtitle,
  id,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  accent?: ReactNode;
  subtitle?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <Reveal className={cn('mb-16 text-center', className)}>
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 id={id} className="text-3xl/tight font-bold text-fg sm:text-4xl/tight md:text-5xl/tight">
        {title}
        {accent ? (
          <>
            <br />
            <span className="text-gradient-live">{accent}</span>
          </>
        ) : null}
      </h2>
      {subtitle ? <p className="mx-auto mt-4 max-w-xl text-base text-muted">{subtitle}</p> : null}
    </Reveal>
  );
}
