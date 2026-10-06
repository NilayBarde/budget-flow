import {
  LayoutDashboard,
  Receipt,
  Target,
  TrendingUp,
  BarChart3,
  CreditCard,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Shorter label for the mobile bar, when the full one does not fit. */
  mobileLabel?: string;
  /** Shown in the bottom bar on mobile; everything else is reached through the drawer. */
  mobile?: boolean;
}

// The one list the sidebar and the mobile bar are both built from. Every item has its own icon.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', mobileLabel: 'Home', mobile: true },
  { to: '/transactions', icon: Receipt, label: 'Transactions', mobile: true },
  { to: '/plan', icon: Target, label: 'Plan' },
  { to: '/net-worth', icon: TrendingUp, label: 'Net Worth', mobile: true },
  { to: '/insights', icon: BarChart3, label: 'Insights', mobile: true },
  { to: '/accounts', icon: CreditCard, label: 'Accounts', mobile: true },
];

// Settings sits apart at the bottom of the sidebar.
export const SETTINGS_ITEM: NavItem = { to: '/settings', icon: Settings, label: 'Settings' };

export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter(item => item.mobile);

export interface SectionTab {
  to: string;
  label: string;
  /** Match the route exactly, so a section's own tab is not also active on its sub pages. */
  end?: boolean;
}

// Pages that used to be separate sidebar items now live as tabs inside their section. Every tab is under
// the section's main route, so the section's sidebar item stays highlighted on all of them.
export const NET_WORTH_TABS: SectionTab[] = [
  { to: '/net-worth', label: 'Net Worth', end: true },
  { to: '/net-worth/investments', label: 'Investments' },
];

export const INSIGHTS_TABS: SectionTab[] = [
  { to: '/insights', label: 'Insights', end: true },
  { to: '/insights/year', label: 'Year Overview' },
];

export const SETTINGS_TABS: SectionTab[] = [
  { to: '/settings', label: 'Settings', end: true },
  { to: '/settings/tags', label: 'Tags' },
];

// The old addresses keep working (bookmarks, the browser history) and land on the page's new home.
export const LEGACY_REDIRECTS = [
  { from: '/investments', to: '/net-worth/investments' },
  { from: '/year', to: '/insights/year' },
  { from: '/tags', to: '/settings/tags' },
] as const;
