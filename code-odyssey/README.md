# Code Odyssey 5.0 website

Cinematic single-page site for the CSI KJSIT hackathon (17 October 2026).
React 18 + Vite + TypeScript + Tailwind, GSAP ScrollTrigger for scroll-driven motion,
and a single raw-WebGL fragment shader for the ocean (no 3D engine).

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # typecheck + production build into dist/
```

## Experiences

| Section | File | Notes |
|---|---|---|
| Opening titles | `src/components/IntroSequence.tsx` | ~5s. Click, key, wheel, touch or **Skip intro** fast-forwards it. Skipped for deep links (`/#sponsors`). |
| Moonlit sea | `src/components/OceanHero.tsx`, `src/ocean/OceanRenderer.ts` | Pinned while you scroll: the sea rises, the ship sails out of the mist, the tagline surfaces, then the waterline climbs across the lens and the view goes underwater. |
| The voyage | `src/components/VoyageTimeline.tsx` | The route is built from the measured milestone markers. Scroll lights the route and sails the ship along it. On mobile it becomes a single left rail. |
| Sponsors | `src/components/SponsorsSection.tsx` | Large *Powered by TATA STRIVE* band, CSI KJSIT slot, and sponsor tiers from config. |

## Editing content

Everything lives in **`src/config/site.ts`**: event text, the registration link, logos,
timeline milestones and sponsor tiers.

- **Registration:** set `LINKS.register`. While it is empty, CTAs scroll to a "Registration opens soon" note.
- **Logos:** drop files into `public/assets/logos/` (sponsors go in `public/assets/sponsors/`) and set `src`, e.g. `'assets/logos/csi-kjsit.svg'`. A `null` src renders a labelled placeholder. Logos are `object-contain`, so any aspect ratio works.
- **Timeline:** the milestones are placeholder storytelling labels. Replace `detail` with the real schedule.
- **Ship:** `public/assets/ships/greek-ship.svg` is an original illustration. To swap it, keep the waterline about 13.6% up from the bottom of the image, or update `WL` in `OceanRenderer.ts`.

## Performance and accessibility

- The ocean renders at 0.7x (desktop) or 0.5x (mobile) resolution with fewer noise octaves on mobile, and only while on screen.
- If WebGL is unavailable, a static CSS sea with the ship image is shown instead.
- `prefers-reduced-motion`: a short static intro, frozen waves, no grain or parallax. Scroll-linked changes still apply.
- The intro does not autoplay any audio.
