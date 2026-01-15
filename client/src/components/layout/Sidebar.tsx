import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Receipt, 
  PiggyBank, 
  CreditCard, 
  Calendar,
  Repeat,
  Tags,
  Settings
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/budget', icon: PiggyBank, label: 'Budget' },
  { to: '/year', icon: Calendar, label: 'Year Overview' },
  { to: '/subscriptions', icon: Repeat, label: 'Subscriptions' },
  { to: '/accounts', icon: CreditCard, label: 'Accounts' },
  { to: '/tags', icon: Tags, label: 'Tags' },
];

export const Sidebar = () => {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-midnight-900 border-r border-midnight-700 flex flex-col">
      <div className="p-6 border-b border-midnight-700">
        <h1 className="text-xl font-display font-bold text-slate-100 flex items-center gap-2">
          <span className="p-2 bg-accent-500 rounded-lg">
            <PiggyBank className="h-5 w-5 text-white" />
          </span>
          BudgetFlow
        </h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-colors',
              isActive 
                ? 'bg-accent-500/20 text-accent-400' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-midnight-800'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
      
      <div className="p-4 border-t border-midnight-700">
        <NavLink
          to="/settings"
          className={({ isActive }) => clsx(
            'flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-colors',
            isActive 
              ? 'bg-accent-500/20 text-accent-400' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-midnight-800'
          )}
        >
          <Settings className="h-5 w-5" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
};

