import { LOGOS, SPONSOR_TIERS } from '../config/site';
import { LogoSlot } from './LogoSlot';

const tierBox = {
  lg: 'h-28 md:h-36 basis-full sm:basis-[28rem]',
  md: 'h-24 md:h-28 basis-[calc(50%-0.5rem)] sm:basis-64',
  sm: 'h-20 md:h-24 basis-[calc(50%-0.5rem)] sm:basis-48',
} as const;

export function SponsorsSection() {
  return (
    <section id="sponsors" aria-labelledby="sponsors-title" className="sponsors relative overflow-hidden">
      <div className="sponsors-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 pb-28 pt-28 md:pt-36">
        <header className="text-center">
          <p className="eyebrow">THE FINAL DESTINATION</p>
          <h2 id="sponsors-title" className="section-title mt-5">OUR SPONSORS</h2>
        </header>

        {/* Powered by: deliberately large and early, not tucked into the footer */}
        <div className="powered mx-auto mt-16 flex max-w-4xl flex-col items-center gap-6 px-6 py-10 text-center md:mt-20 md:flex-row md:justify-center md:gap-12 md:py-12">
          <p className="font-display text-xs font-semibold tracking-[0.5em] text-gold md:text-sm">POWERED BY</p>
          <LogoSlot logo={LOGOS.tataStrive} label="TATA STRIVE" className="h-24 w-64 text-[20px] md:h-28 md:w-80" />
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <p className="font-display text-[0.65rem] tracking-[0.45em] text-steel">ORGANISED BY</p>
          <LogoSlot logo={LOGOS.csiKjsit} label="CSI KJSIT" className="h-20 w-48 text-[16px]" />
        </div>

        <div className="mt-20 space-y-14">
          {SPONSOR_TIERS.map((tier) => (
            <div key={tier.name}>
              <h3 className="text-center font-display text-[0.65rem] tracking-[0.45em] text-steel">{tier.name.toUpperCase()}</h3>
              <ul className="mt-6 flex flex-wrap justify-center gap-4">
                {tier.sponsors.map((s) => (
                  <li key={s.name} className={`sponsor-tile grow-0 ${tierBox[tier.size]}`}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="block h-full w-full p-5" aria-label={s.name}>
                        <LogoSlot logo={s.logo} label={s.name.toUpperCase()} className="h-full w-full text-[14px]" />
                      </a>
                    ) : (
                      <LogoSlot logo={s.logo} label={s.name.toUpperCase()} className="h-full w-full p-5 text-[14px]" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
