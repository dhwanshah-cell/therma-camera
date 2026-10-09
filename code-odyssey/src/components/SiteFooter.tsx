import { EVENT, LINKS, registerHref } from '../config/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-steel/10 bg-night">
      <div id="register" className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-16 text-center">
        <p className="font-display text-sm font-bold tracking-[0.4em] text-moon/90">{EVENT.title}</p>
        <p className="font-display text-[0.65rem] tracking-[0.4em] text-steel">
          <time dateTime={EVENT.dateISO}>{EVENT.dateLong}</time> · {EVENT.organiser}
        </p>
        {LINKS.register ? (
          <a href={registerHref()} target="_blank" rel="noopener noreferrer" className="cta">REGISTER NOW</a>
        ) : (
          <p className="font-serif text-lg italic text-mist">Registration opens soon. The harbour is being prepared.</p>
        )}
      </div>
      <p className="pb-8 text-center font-display text-[0.6rem] tracking-[0.3em] text-steel/50">
        © 2026 {EVENT.organiser}
      </p>
    </footer>
  );
}
