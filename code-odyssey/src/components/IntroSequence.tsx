import { useEffect, useLayoutEffect, useRef } from 'react';
import { EVENT, LOGOS } from '../config/site';
import { gsap, prefersReducedMotion } from '../motion';
import { LogoSlot } from './LogoSlot';

/**
 * Title-card opening: black screen, logo, presenter line, the title assembling letter
 * by letter, the date, a horizon line drawing across, then the black lifts off the sea.
 * About 5s; any click, key, wheel or touch (or the Skip button) fast-forwards it.
 */
export function IntroSequence({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline>();

  useLayoutEffect(() => {
    const q = gsap.utils.selector(root);
    const reduced = prefersReducedMotion();
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: onDone });
      tlRef.current = tl;
      if (reduced) {
        gsap.set(q('[data-intro]'), { opacity: 1 });
        tl.to({}, { duration: 1.2 })
          .add(onReveal)
          .to(root.current, { opacity: 0, duration: 0.4 });
        return;
      }
      tl.set(q('[data-intro]:not([data-intro="copy"])'), { opacity: 0 })
        .to(q('[data-intro="logo"]'), { opacity: 1, duration: 0.9, ease: 'power1.out' }, 0.3)
        .to(q('[data-intro="presenter"]'), { opacity: 1, duration: 0.8 }, 0.8)
        .set(q('[data-intro="title"]'), { opacity: 1 }, 1.3)
        .fromTo(
          q('.intro-char'),
          { opacity: 0, filter: 'blur(8px)', y: 6 },
          { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.9, stagger: 0.05, ease: 'power2.out' },
          1.3,
        )
        .fromTo(q('[data-intro="title"]'), { letterSpacing: '0.5em' }, { letterSpacing: '0.28em', duration: 2, ease: 'power3.out' }, 1.3)
        .to(q('[data-intro="date"]'), { opacity: 1, duration: 0.8 }, 2.6)
        .set(q('[data-intro="line"]'), { opacity: 1 }, 3.0)
        .fromTo(q('[data-intro="line"]'), { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power2.inOut' }, 3.0)
        .add(onReveal, 4.1)
        .to(q('[data-intro="copy"]'), { opacity: 0, y: -14, filter: 'blur(4px)', duration: 0.8, ease: 'power2.in' }, 4.1)
        .to(q('[data-intro="line"]'), { opacity: 0, duration: 0.6 }, 4.4)
        .to(root.current, { opacity: 0, duration: 1.1, ease: 'power1.inOut' }, 4.4);
    }, root);
    return () => ctx.revert();
  }, [onDone, onReveal]);

  useEffect(() => {
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key === 'Tab') return;
      const tl = tlRef.current;
      if (tl && tl.progress() < 0.8) tl.timeScale(6);
    };
    const opts = { passive: true } as const;
    window.addEventListener('wheel', skip, opts);
    window.addEventListener('touchstart', skip, opts);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('wheel', skip);
      window.removeEventListener('touchstart', skip);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, []);

  return (
    <div ref={root} className="fixed inset-0 z-[60] bg-night" role="dialog" aria-label="Code Odyssey 5.0 opening titles">
      <div data-intro="logo" className="safe-pad absolute left-0 top-0">
        <LogoSlot logo={LOGOS.csiKjsit} label="CSI KJSIT" className="h-10 w-20 text-[13px] sm:h-12 sm:w-28 sm:text-[16px] md:h-14 md:w-32" />
      </div>

      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <div data-intro="copy" className="flex flex-col items-center">
          <p data-intro="presenter" className="font-display text-[0.62rem] font-semibold tracking-[0.55em] text-steel md:text-xs">
            {EVENT.presenter}
          </p>
          <p
            data-intro="title"
            aria-label={EVENT.title}
            className="title-track mt-4 font-display text-[clamp(1.7rem,6.4vw,5rem)] font-bold leading-[1.15] text-steel"
          >
            {EVENT.title.split(' ').map((word, w) => (
              <span key={w} className="inline-block whitespace-nowrap" aria-hidden>
                {[...word].map((ch, i) => (
                  <span key={i} className="intro-char inline-block">
                    {ch}
                  </span>
                ))}
                {w < EVENT.title.split(' ').length - 1 && <span className="inline-block">&nbsp;</span>}
              </span>
            ))}
          </p>
          <p data-intro="date" className="mt-6 font-display text-base font-semibold tracking-[0.3em] text-steel md:text-2xl">
            <time dateTime={EVENT.dateISO}>{EVENT.dateShort}</time>
          </p>
        </div>
        <span data-intro="line" className="intro-line mt-14 block h-px w-[min(60vw,520px)] origin-center" aria-hidden />
      </div>

      <button
        type="button"
        onClick={() => tlRef.current?.timeScale(6)}
        className="safe-pad-br absolute bottom-0 right-0 font-display text-[0.65rem] tracking-[0.4em] text-steel/70 transition-colors hover:text-moon focus-visible:text-moon"
      >
        SKIP INTRO
      </button>
    </div>
  );
}
