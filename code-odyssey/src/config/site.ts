// Single source of truth for event content, links, logos, timeline and sponsors.
// Edit this file; components read everything from here.

export type Logo = {
  /** Path relative to /public, e.g. 'assets/logos/csi-kjsit.svg'. null shows a labelled placeholder. */
  src: string | null;
  alt: string;
};

export const EVENT = {
  presenter: 'A CSI HACKATHON',
  title: 'CODE ODYSSEY 5.0',
  organiser: 'CSI KJSIT',
  dateShort: '17 · 10 · 2026',
  dateLong: '17 OCTOBER 2026',
  dateISO: '2026-10-17',
  tagline: 'EVERY GREAT JOURNEY BEGINS WITH A SINGLE STEP.',
  description: 'An epic voyage into innovation, code, and discovery.',
};

export const LINKS = {
  /** Registration URL. Leave '' until the real form exists: CTAs then point to the #register note in the footer. */
  register: '',
};

export const registerHref = () => LINKS.register || '#register';
export const registerIsExternal = () => LINKS.register.startsWith('http');

export const LOGOS = {
  csiKjsit: { src: null, alt: 'CSI KJSIT logo' } as Logo,
  tataStrive: { src: null, alt: 'TATA STRIVE logo' } as Logo,
};

export const SHIP_IMAGE = 'assets/ships/greek-ship.svg';

export const NAV: { label: string; href: string; short?: string; hideOnMobile?: boolean }[] = [
  { label: 'Home', href: '#home', hideOnMobile: true },
  { label: 'The Voyage', short: 'Voyage', href: '#voyage' },
  { label: 'Sponsors', href: '#sponsors' },
];

export type Milestone = {
  numeral: string;
  title: string;
  /** Mythic waypoint shown as flavour text, not a real venue. */
  place: string;
  story: string;
  /** Real schedule detail goes here (time, venue, activity). */
  detail: string;
};

// Placeholder storytelling labels; replace with the real hackathon timeline.
export const MILESTONES: Milestone[] = [
  {
    numeral: '01',
    title: 'THE CALL TO ADVENTURE',
    place: 'Troy',
    story: 'Twelve ships leave the shore with the war behind them and home somewhere ahead.',
    detail: 'Details to be announced',
  },
  {
    numeral: '02',
    title: 'CHARTING THE UNKNOWN',
    place: 'Aeolia',
    story: 'With the winds sealed in a single bag, the crew sets a course across open water.',
    detail: 'Details to be announced',
  },
  {
    numeral: '03',
    title: 'INTO THE STORM',
    place: 'Scylla & Charybdis',
    story: 'A narrow strait between a monster and a whirlpool. Every choice has a cost.',
    detail: 'Details to be announced',
  },
  {
    numeral: '04',
    title: 'THE TRIALS',
    place: 'Thrinacia',
    story: 'Hunger, temptation and the patience of the gods are tested on a quiet island.',
    detail: 'Details to be announced',
  },
  {
    numeral: '05',
    title: 'THE FINAL DESTINATION',
    place: 'Ithaca',
    story: 'The long way home ends where it began, changed by everything in between.',
    detail: 'Details to be announced',
  },
];

export type Sponsor = { name: string; logo: Logo; url?: string };
export type SponsorTier = { name: string; size: 'lg' | 'md' | 'sm'; sponsors: Sponsor[] };

const slot = (n: number): Sponsor => ({
  name: `Sponsor slot ${String(n).padStart(2, '0')}`,
  logo: { src: null, alt: `Sponsor ${n} logo` },
});

// Add, remove or reorder tiers and sponsors freely. Logos keep their aspect ratio.
export const SPONSOR_TIERS: SponsorTier[] = [
  { name: 'Title Sponsor', size: 'lg', sponsors: [slot(1)] },
  { name: 'Sponsors', size: 'md', sponsors: [slot(2), slot(3), slot(4)] },
  { name: 'Partners', size: 'sm', sponsors: [slot(5), slot(6), slot(7), slot(8)] },
];

/** Resolves a /public path against Vite's base so builds work from any sub-path. */
export const asset = (path: string) => import.meta.env.BASE_URL + path;
