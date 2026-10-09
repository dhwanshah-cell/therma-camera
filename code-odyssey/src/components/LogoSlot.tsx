import { asset, type Logo } from '../config/site';

/** Renders a logo without stretching it, or a clearly labelled placeholder when no file is configured. */
export function LogoSlot({ logo, label, className = '' }: { logo: Logo; label: string; className?: string }) {
  if (logo.src) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <img src={asset(logo.src)} alt={logo.alt} className="max-h-full max-w-full object-contain" loading="lazy" decoding="async" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`${logo.alt} (placeholder)`}
      className={`logo-placeholder flex flex-col items-center justify-center text-center ${className}`}
    >
      <span className="text-[0.62em] font-semibold tracking-[0.3em] text-moon/80">{label}</span>
      <span className="mt-1 text-[0.45em] tracking-[0.35em] text-steel/60">LOGO PLACEHOLDER</span>
    </div>
  );
}
