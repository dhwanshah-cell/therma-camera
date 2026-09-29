import { NavLink } from 'react-router-dom';

export const NAV_ITEMS: { to: string; label: string; short: string; glyph: string }[] = [
  { to: '/', label: 'Dashboard', short: 'Dash', glyph: '▣' },
  { to: '/live', label: 'Live', short: 'Live', glyph: '●' },
  { to: '/thermal', label: 'Thermal', short: 'Therm', glyph: '♨' },
  { to: '/sensors', label: 'Sensors', short: 'Sens', glyph: '∿' },
  { to: '/alerts', label: 'Alerts', short: 'Alerts', glyph: '⚠' },
  { to: '/map', label: 'Map', short: 'Map', glyph: '⌖' },
  { to: '/map3d', label: '3D Map', short: '3D', glyph: '▧' },
  { to: '/storage', label: 'Storage', short: 'Store', glyph: '▤' },
  { to: '/missions', label: 'Missions', short: 'Miss', glyph: '⚑' },
  { to: '/robot', label: 'Robot', short: 'Robot', glyph: '⚙' },
  { to: '/settings', label: 'Settings', short: 'Set', glyph: '≡' },
];

export function SidebarNav() {
  return (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <span className="w-4 text-center text-sm" aria-hidden>
            {item.glyph}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Bottom tab bar for mobile/tablet; scrolls horizontally when tabs overflow. */
export function BottomTabs() {
  return (
    <nav className="flex overflow-x-auto border-t border-line bg-panel" aria-label="Primary mobile">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex min-w-[64px] flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[9px] font-semibold uppercase tracking-wider ${
              isActive ? 'text-thermal' : 'text-muted'
            }`
          }
        >
          <span className="text-base leading-none" aria-hidden>
            {item.glyph}
          </span>
          {item.short}
        </NavLink>
      ))}
    </nav>
  );
}

/** Collapsible menu list used inside the mobile top bar. */
export function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="grid grid-cols-2 gap-1 border-t border-line p-2 sm:grid-cols-3" aria-label="Primary menu">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <span className="w-4 text-center" aria-hidden>
            {item.glyph}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
