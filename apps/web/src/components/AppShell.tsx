import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthProvider';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/agents', label: 'Agents', icon: 'bot' },
  { to: '/activity', label: 'Activity', icon: 'pulse' },
  { to: '/roadmap', label: 'Roadmap', icon: 'map' },
  { to: '/settings', label: 'Settings', icon: 'cog' },
] as const;

function Icon({ name }: { name: (typeof NAV_ITEMS)[number]['icon'] }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'bot':
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="12" rx="3" />
          <path d="M12 3v4M9 13h.01M15 13h.01M9.5 16.5h5" />
        </svg>
      );
    case 'pulse':
      return (
        <svg {...common}>
          <path d="M3 12h3.5l2-5 3 10 2.5-5H21" />
        </svg>
      );
    case 'map':
      return (
        <svg {...common}>
          <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case 'cog':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10.65 3V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 16.2 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20.6 9v.09A1.7 1.7 0 0 0 22 10.65H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
      );
    default:
      return null;
  }
}

export function AppShell() {
  const { me, logout } = useAuth();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the new page heading on navigation for screen readers.
  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  const initials = (me?.user.name ?? me?.user.email ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="min-h-dvh bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-xs font-semibold text-white">
              AI
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink">Store Manager</p>
              <p className="text-2xs text-muted">{me?.environment ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="grid h-9 w-9 place-items-center rounded-full bg-surface text-xs font-semibold text-ink ring-1 ring-line"
              title={me?.user.email}
            >
              {initials || '?'}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="hidden h-9 rounded-lg border border-line px-3 text-xs font-medium text-muted hover:text-ink sm:inline-flex sm:items-center"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5">
        <nav aria-label="Primary" className="hidden w-52 shrink-0 md:block">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm transition ${
                      isActive
                        ? 'bg-white font-medium text-ink shadow-card ring-1 ring-line'
                        : 'text-muted hover:bg-white hover:text-ink'
                    }`
                  }
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="mt-6 px-3 text-2xs leading-relaxed text-muted">
            Phase 01 foundation. Shopify and AI integrations are not connected yet — the roadmap
            shows exactly what exists.
          </p>
        </nav>

        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-safe backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 pt-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-2xs ${
                    isActive ? 'text-ink' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'rounded-lg bg-brand-50 p-1' : 'p-1'}>
                      <Icon name={item.icon} />
                    </span>
                    <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
