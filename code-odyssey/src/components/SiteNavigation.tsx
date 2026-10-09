import { useEffect, useState } from 'react';
import { LOGOS, NAV, registerHref, registerIsExternal } from '../config/site';
import { LogoSlot } from './LogoSlot';

export function SiteNavigation({ visible }: { visible: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 80);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const external = registerIsExternal();

  return (
    <header className={`site-nav fixed inset-x-0 top-0 z-50 ${visible ? 'is-visible' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
      <nav aria-label="Primary" className="safe-pad flex items-center justify-between gap-4">
        <a href="#home" aria-label="Code Odyssey 5.0, back to top" className="shrink-0">
          <LogoSlot logo={LOGOS.csiKjsit} label="CSI KJSIT" className="h-10 w-20 text-[13px] sm:h-12 sm:w-28 sm:text-[16px] md:h-14 md:w-32" />
        </a>
        <ul className="flex items-center gap-3 whitespace-nowrap font-display text-[0.6rem] font-medium tracking-[0.2em] sm:gap-8 sm:tracking-[0.28em] md:text-[0.7rem]">
          {NAV.map((l) => (
            <li key={l.href} className={l.hideOnMobile ? 'hidden sm:block' : ''}>
              <a href={l.href} className="nav-link">
                {l.short ? (
                  <>
                    <span className="sm:hidden">{l.short.toUpperCase()}</span>
                    <span className="hidden sm:inline">{l.label.toUpperCase()}</span>
                  </>
                ) : (
                  l.label.toUpperCase()
                )}
              </a>
            </li>
          ))}
          <li>
            <a href={registerHref()} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="nav-register">
              REGISTER
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
