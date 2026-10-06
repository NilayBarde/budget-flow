import { NavLink } from 'react-router-dom';
import { PiggyBank, X } from 'lucide-react';
import clsx from 'clsx';
import { NAV_ITEMS, SETTINGS_ITEM, MOBILE_NAV_ITEMS } from '../../utils/navigation';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Drawer */}
      <aside
        className={clsx(
          "fixed left-0 top-0 h-full w-72 bg-midnight-900 border-r border-midnight-700 flex flex-col z-50",
          "transition-transform duration-300 ease-out",
          // Mobile: slide in/out
          isOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: always visible
          "md:translate-x-0 md:w-64"
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-midnight-700 flex items-center justify-between">
          <h1 className="text-xl font-display font-bold text-slate-100 flex items-center gap-2">
            <span className="p-2 bg-accent-500 rounded-lg">
              <PiggyBank className="h-5 w-5 text-white" />
            </span>
            BudgetFlow
          </h1>
          {/* Close button - mobile only */}
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-800 rounded-lg transition-colors md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-4 py-3 md:py-2.5 rounded-lg font-medium transition-colors',
                'active:bg-midnight-700', // Touch feedback
                isActive
                  ? 'bg-accent-500/20 text-accent-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-midnight-800'
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Settings - bottom of sidebar */}
        <div className="p-4 border-t border-midnight-700">
          <NavLink
            to={SETTINGS_ITEM.to}
            onClick={onClose}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-4 py-3 md:py-2.5 rounded-lg font-medium transition-colors',
              'active:bg-midnight-700',
              isActive
                ? 'bg-accent-500/20 text-accent-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-midnight-800'
            )}
          >
            <SETTINGS_ITEM.icon className="h-5 w-5 flex-shrink-0" />
            {SETTINGS_ITEM.label}
          </NavLink>
        </div>
      </aside>

      {/* Bottom Tab Navigation - Mobile Only */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-midnight-900 border-t border-midnight-700 z-40 md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-full px-2 pb-2">
          {MOBILE_NAV_ITEMS.map(({ to, icon: Icon, label, mobileLabel }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => clsx(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[64px] transition-colors',
                'active:bg-midnight-700',
                isActive
                  ? 'text-accent-400'
                  : 'text-slate-500'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{mobileLabel ?? label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
};
