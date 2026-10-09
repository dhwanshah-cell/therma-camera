import { useLayoutEffect, useRef } from 'react';
import { MILESTONES, SHIP_IMAGE, asset } from '../config/site';
import { ScrollTrigger, gsap, prefersReducedMotion } from '../motion';

/**
 * The voyage: a sea route drawn through every milestone. Scrolling lights the route
 * and sails the ship along it. The route is rebuilt from the measured marker positions,
 * so it follows the zig-zag layout on desktop and the single rail on mobile.
 */
export function VoyageTimeline() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const base = useRef<SVGPathElement>(null);
  const glow = useRef<SVGPathElement>(null);
  const ship = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    let len = 1;
    let progress = 0;

    const place = () => {
      const g = glow.current!;
      g.style.strokeDashoffset = String(len * (1 - progress));
      const at = progress * len;
      const p = g.getPointAtLength(at);
      const ahead = g.getPointAtLength(Math.min(len, at + 4));
      const behind = g.getPointAtLength(Math.max(0, at - 4));
      const dx = ahead.x - behind.x;
      const dy = ahead.y - behind.y;
      // Keep the hull upright: face the direction of travel and lean gently into turns.
      const dir = Math.abs(dx) > 0.5 ? Math.sign(dx) : 1;
      const lean = Math.max(-8, Math.min(8, (Math.atan2(dy, Math.abs(dx) + 1e-3) * 180) / Math.PI / 8));
      ship.current!.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -78%) scaleX(${dir}) rotate(${lean}deg)`;
    };

    const build = () => {
      const t = track.current!;
      const box = t.getBoundingClientRect();
      const pts = [...t.querySelectorAll<HTMLElement>('[data-marker]')].map((m) => {
        const r = m.getBoundingClientRect();
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      });
      if (!pts.length) return;
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const all = [{ x: first.x, y: 0 }, ...pts, { x: last.x, y: box.height }];
      let d = `M ${all[0]!.x} ${all[0]!.y}`;
      for (let i = 1; i < all.length; i++) {
        const a = all[i - 1]!;
        const b = all[i]!;
        const h = (b.y - a.y) * 0.55;
        d += ` C ${a.x} ${a.y + h}, ${b.x} ${b.y - h}, ${b.x} ${b.y}`;
      }
      svg.current!.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      base.current!.setAttribute('d', d);
      glow.current!.setAttribute('d', d);
      len = glow.current!.getTotalLength();
      glow.current!.style.strokeDasharray = String(len);
      place();
    };

    const ctx = gsap.context(() => {
      build();
      ScrollTrigger.create({
        trigger: track.current,
        start: 'top 55%',
        end: 'bottom 55%',
        scrub: reduced ? true : 0.6,
        onUpdate: (self) => {
          progress = self.progress;
          place();
        },
        onRefresh: build,
      });

      gsap.utils.toArray<HTMLElement>('[data-milestone]', root.current).forEach((el) => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 62%',
          onEnter: () => el.classList.add('is-reached'),
          onLeaveBack: () => el.classList.remove('is-reached'),
        });
      });

      if (!reduced) {
        gsap.utils.toArray<HTMLElement>('[data-parallax]', root.current).forEach((el) => {
          gsap.fromTo(
            el,
            { yPercent: -Number(el.dataset.parallax) },
            { yPercent: Number(el.dataset.parallax), ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true } },
          );
        });
      }
    }, root);

    const ro = new ResizeObserver(build);
    ro.observe(track.current!);
    return () => {
      ro.disconnect();
      ctx.revert();
    };
  }, []);

  return (
    <section id="voyage" ref={root} aria-labelledby="voyage-title" className="voyage relative overflow-hidden">
      {/* atmosphere: coastlines and mist drifting at different depths */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <svg data-parallax="6" className="coast coast-left" viewBox="0 0 300 900" preserveAspectRatio="none">
          <path d="M0 0 H120 C150 80 90 140 130 220 C170 300 110 360 150 450 C190 540 120 600 160 700 C190 780 140 840 170 900 H0 Z" />
        </svg>
        <svg data-parallax="10" className="coast coast-right" viewBox="0 0 300 900" preserveAspectRatio="none">
          <path d="M300 0 H190 C160 100 220 160 180 260 C140 350 210 420 170 520 C130 610 200 680 160 780 C140 840 180 870 170 900 H300 Z" />
        </svg>
        <div data-parallax="18" className="mist mist-a" />
        <div data-parallax="28" className="mist mist-b" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pb-32 pt-28 md:pt-40">
        <header className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">THE VOYAGE</p>
          <h2 id="voyage-title" className="section-title mt-5">CHART THE COURSE</h2>
          <p className="mt-6 font-serif text-xl italic text-mist md:text-2xl">
            Five passages stand between the harbour and home.
          </p>
          <p className="mt-3 font-display text-[0.65rem] tracking-[0.3em] text-steel/70">THE FULL SCHEDULE WILL BE ANNOUNCED SOON</p>
        </header>

        <div ref={track} className="voyage-track relative mt-20 md:mt-28">
          <svg ref={svg} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <defs>
              <filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path ref={base} className="route-base" />
            <path ref={glow} className="route-glow" filter="url(#route-glow)" />
          </svg>

          <div ref={ship} className="voyage-ship pointer-events-none absolute left-0 top-0 z-10" aria-hidden>
            <img src={asset(SHIP_IMAGE)} alt="" width={1200} height={880} decoding="async" loading="lazy" />
          </div>

          <ol className="relative">
            {MILESTONES.map((m, i) => (
              <li key={m.numeral} data-milestone className={`milestone ${i % 2 ? 'milestone-right' : 'milestone-left'}`}>
                <span data-marker className="milestone-marker" aria-hidden />
                <div className="milestone-body">
                  <p className="milestone-num">{m.numeral}</p>
                  <p className="mt-2 font-display text-[0.62rem] tracking-[0.4em] text-gold/80">{m.place.toUpperCase()}</p>
                  <h3 className="mt-3 font-display text-base font-semibold tracking-[0.24em] text-moon md:text-lg">{m.title}</h3>
                  <p className="mt-3 font-serif text-lg leading-snug text-mist/90">{m.story}</p>
                  <p className="mt-4 font-display text-[0.62rem] tracking-[0.3em] text-steel/70">{m.detail.toUpperCase()}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
