import { useEffect, type RefObject } from 'react';

export function useScrollAtmosphere(
  atmosphereRef: RefObject<HTMLDivElement | null>,
  depsKey: string,
): void {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let rafId: number | null = null;
    const updateScrollColor = (): void => {
      rafId = null;
      const el = atmosphereRef.current;
      if (!el) {
        return;
      }
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const maxRange = Math.max(
        320,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const progress = Math.min(1, Math.max(0, scrollY / maxRange));
      el.style.setProperty('--scroll-progress', progress.toFixed(3));
    };

    const onScroll = (): void => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateScrollColor);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateScrollColor();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [atmosphereRef, depsKey]);
}
