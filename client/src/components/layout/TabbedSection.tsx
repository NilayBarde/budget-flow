import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import type { SectionTab } from '../../utils/navigation';

interface TabbedSectionProps {
  /** Accessible name of the tab bar, for example "Net worth sections". */
  label: string;
  tabs: SectionTab[];
}

// A section made of several pages: the tabs sit above whichever page is open. Each tab is its own
// route, so every page keeps a shareable address and the browser's back button works between them.
export const TabbedSection = ({ label, tabs }: TabbedSectionProps) => (
  <div className="space-y-4 md:space-y-6">
    <nav aria-label={label} className="flex gap-1 border-b border-midnight-700 overflow-x-auto">
      {tabs.map(({ to, label: tabLabel, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            clsx(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-accent-400 text-accent-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-midnight-600',
            )
          }
        >
          {tabLabel}
        </NavLink>
      ))}
    </nav>
    <Outlet />
  </div>
);
