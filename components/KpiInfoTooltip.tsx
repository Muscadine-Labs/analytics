'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiInfoTooltipProps {
  children: React.ReactNode;
  label?: string;
}

export function KpiInfoTooltip({ children, label = 'More information' }: KpiInfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="group/info relative inline-flex align-middle">
      <button
        type="button"
        className={cn(
          'inline-flex h-11 w-11 -m-3.5 items-center justify-center rounded-full',
          'text-muted-foreground hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'touch-manipulation'
        )}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      <span
        id={panelId}
        role="tooltip"
        className={cn(
          'absolute z-50 rounded-md border border-slate-200 bg-slate-100 p-3 text-xs font-normal text-slate-900 shadow-lg',
          'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
          'left-1/2 top-full mt-1 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2',
          'sm:left-0 sm:translate-x-0 sm:w-56 sm:bottom-full sm:top-auto sm:mb-2 sm:mt-0',
          open
            ? 'block'
            : 'hidden md:group-hover/info:block md:group-focus-within/info:block'
        )}
      >
        {children}
      </span>
    </span>
  );
}
