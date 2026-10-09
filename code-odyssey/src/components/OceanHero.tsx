import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EVENT, SHIP_IMAGE, asset, registerHref, registerIsExternal } from '../config/site';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { ScrollTrigger, gsap, isMobile, prefersReducedMotion } from '../motion';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The moonlit sea. Pinned while the visitor scrolls through it:
 *  1. the sea rises up the frame and the ship sails out of the mist,
 *  2. the tagline surfaces,
 *  3. the waterline climbs across the lens and the camera sinks beneath the surface,
 *     handing over to the voyage timeline below.
 */
export function OceanHero({ revealed }: { revealed: boolean }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    const scene = { rise: 0, grow: 0, fog: 1, surface: -0.12 };
    const renderer = OceanRenderer.create(
      canvas.current!,
      { horizon: 0.18, surface: -0.12, moonX: 0.76, moonY: 0.8, shipX: 0.38, shipH: 0.05, fog: 1 },
      { scale: isMobile() ? 0.5 : 0.7, octaves: isMobile() ? 3 : 4, animate: !reduced },
    );
    if (!renderer) setFallback(true);
    renderer?.loadShip(asset(SHIP_IMAGE));

    // Map the normalised scroll scene onto screen-space values for the current viewport.
    const apply = () => {
      if (!renderer) return;
      const aspect = window.innerWidth / window.innerHeight;
      const narrow = aspect < 0.9;
      const H0 = 0.18;
      const H = lerp(H0, narrow ? 0.36 : 0.35, scene.rise);
      const horizon = Math.max(H, scene.surface); // once the lens is under, the eye-line rides the waterline
      const s = renderer.state;
      s.horizon = horizon;
      s.surface = scene.surface;
      s.shipH = lerp(0.045, Math.min(0.22, (0.5 * aspect) / 1.364), scene.grow);
      s.shipX = narrow ? 0.5 : lerp(0.38, 0.3, scene.grow);
      // keep the moon clear of the title: low on the right on desktop, high corner on portrait
      s.moonX = narrow ? 0.8 : 0.8;
      s.moonY = narrow ? 0.9 + (horizon - H0) * 0.9 : 0.6 + (horizon - H0) * 0.5;
      s.fog = scene.fog;
      renderer.render();
    };
    apply();

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(stage);
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate: apply,
        scrollTrigger: {
          trigger: stage.current,
          start: 'top top',
          end: reduced ? '+=150%' : '+=260%',
          pin: true,
          scrub: reduced ? true : 0.8,
          onRefresh: apply,
        },
      });
      tl.to(scene, { rise: 1, grow: 1, fog: 0.12, duration: 0.45, ease: 'power1.out' }, 0)
        .to(q('[data-hero="cue"]'), { opacity: 0, duration: 0.05 }, 0)
        .fromTo(
          q('[data-hero="reveal"]'),
          { opacity: 0, y: 24, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.18, stagger: 0.06, ease: 'power2.out' },
          0.06,
        )
        .fromTo(q('[data-hero="tagline"]'), { letterSpacing: '0.6em' }, { letterSpacing: '0.32em', duration: 0.24, ease: 'power2.out' }, 0.06)
        .to(q('[data-hero="copy"]'), { opacity: 0, y: -60, duration: 0.12, ease: 'power1.in' }, 0.52)
        .to(scene, { surface: 1.25, duration: 0.48, ease: 'power1.in' }, 0.52);
    }, stage);

    // Only render while the stage is on screen.
    const io = new IntersectionObserver(([e]) => {
      if (!renderer || reduced) return;
      if (e?.isIntersecting) renderer.start();
      else renderer.stop();
    });
    io.observe(stage.current!);
    const onResize = () => {
      renderer?.resize();
      apply();
    };
    window.addEventListener('resize', onResize);

    return () => {
      io.disconnect();
      window.removeEventListener('resize', onResize);
      ctx.revert();
      renderer?.destroy();
    };
  }, []);

  // Title, date and CTA arrive as the intro's black lifts.
  useEffect(() => {
    if (!revealed) return;
    const tween = gsap.fromTo(
      stage.current!.querySelectorAll('[data-hero="arrive"]'),
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: prefersReducedMotion() ? 0.01 : 1.4, stagger: 0.15, ease: 'power2.out', delay: 0.3 },
    );
    ScrollTrigger.refresh();
    return () => {
      tween.kill();
    };
  }, [revealed]);

  const external = registerIsExternal();

  return (
    <section id="home" ref={section} aria-label="Code Odyssey 5.0" className="relative">
      <div ref={stage} className="hero-stage relative h-[100svh] w-full overflow-hidden bg-night">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
        {fallback && (
          <div className="ocean-fallback absolute inset-0" aria-hidden>
            <img src={asset(SHIP_IMAGE)} alt="" className="absolute bottom-[22%] left-1/2 w-[min(70vw,420px)] -translate-x-1/2 opacity-80" />
          </div>
        )}
        <div className="hero-shade pointer-events-none absolute inset-0" aria-hidden />

        <div data-hero="copy" className="relative z-10 flex h-full flex-col items-center justify-between px-5 pb-[12svh] pt-[17svh] text-center">
          <div className="flex flex-col items-center">
            <h1 data-hero="arrive" className="title-track font-display text-[clamp(1.7rem,6.4vw,5rem)] font-bold leading-[1.15] text-moon/90 text-glow">
              {EVENT.title}
            </h1>
            <p
              data-hero="reveal"
              className="mt-6 max-w-[44rem] text-balance font-display text-[0.7rem] font-medium tracking-[0.32em] text-moon/85 md:text-sm"
            >
              <span data-hero="tagline" className="inline-block">{EVENT.tagline}</span>
            </p>
            <p data-hero="reveal" className="mt-4 max-w-[30ch] font-serif text-lg italic text-mist md:text-2xl">
              {EVENT.description}
            </p>
          </div>

          <div className="flex flex-col items-center gap-5">
            <p data-hero="arrive" className="font-display text-[0.7rem] font-semibold tracking-[0.42em] text-steel md:text-xs">
              <time dateTime={EVENT.dateISO}>{EVENT.dateLong}</time>
              <span className="mx-3 text-gold/80" aria-hidden>·</span>
              {EVENT.organiser}
            </p>
            <a
              data-hero="arrive"
              href={registerHref()}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="cta"
            >
              BEGIN YOUR VOYAGE
            </a>
          </div>
        </div>

        <div data-hero="cue" className="scroll-cue absolute bottom-6 left-1/2 z-10 -translate-x-1/2" aria-hidden>
          <span />
        </div>
      </div>
    </section>
  );
}
