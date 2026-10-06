import { describe, it, expect } from 'vitest';
import {
  NAV_ITEMS,
  SETTINGS_ITEM,
  MOBILE_NAV_ITEMS,
  NET_WORTH_TABS,
  INSIGHTS_TABS,
  SETTINGS_TABS,
  LEGACY_REDIRECTS,
} from '../navigation';

describe('navigation', () => {
  it('has the six main items the sidebar was simplified to', () => {
    expect(NAV_ITEMS.map(item => item.label)).toEqual([
      'Dashboard',
      'Transactions',
      'Plan',
      'Net Worth',
      'Insights',
      'Accounts',
    ]);
  });

  it('gives every item its own icon, so two destinations never look alike', () => {
    // Insights and Investments used to share one icon, and Investments used another on mobile.
    const icons = [...NAV_ITEMS, SETTINGS_ITEM].map(item => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('gives every item its own route', () => {
    const routes = [...NAV_ITEMS, SETTINGS_ITEM].map(item => item.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('builds the mobile bar from the same items, so it cannot drift from the sidebar', () => {
    for (const item of MOBILE_NAV_ITEMS) {
      expect(NAV_ITEMS).toContain(item);
    }
    expect(MOBILE_NAV_ITEMS.length).toBeGreaterThanOrEqual(4);
    expect(MOBILE_NAV_ITEMS.length).toBeLessThanOrEqual(5);
  });

  it('keeps the dashboard first on mobile, labelled Home', () => {
    expect(MOBILE_NAV_ITEMS[0].to).toBe('/');
    expect(MOBILE_NAV_ITEMS[0].mobileLabel).toBe('Home');
  });
});

describe('section tabs', () => {
  it('puts the section\'s own page first and matches it exactly, so it is not active on its sub pages', () => {
    for (const tabs of [NET_WORTH_TABS, INSIGHTS_TABS, SETTINGS_TABS]) {
      expect(tabs[0].end).toBe(true);
      expect(tabs.length).toBeGreaterThan(1);
    }
  });

  it('keeps every tab under its section\'s main route, so the sidebar item stays highlighted', () => {
    const under = (tabs: typeof NET_WORTH_TABS, base: string) =>
      tabs.every(tab => tab.to === base || tab.to.startsWith(`${base}/`));

    expect(under(NET_WORTH_TABS, '/net-worth')).toBe(true);
    expect(under(INSIGHTS_TABS, '/insights')).toBe(true);
    expect(under(SETTINGS_TABS, '/settings')).toBe(true);
  });

  it('puts the pages that used to be separate under the right section', () => {
    expect(NET_WORTH_TABS.map(t => t.to)).toContain('/net-worth/investments');
    expect(INSIGHTS_TABS.map(t => t.to)).toContain('/insights/year');
    expect(SETTINGS_TABS.map(t => t.to)).toContain('/settings/tags');
  });
});

describe('legacy redirects', () => {
  it('sends each old address to where that page lives now', () => {
    expect(Object.fromEntries(LEGACY_REDIRECTS.map(r => [r.from, r.to]))).toEqual({
      '/investments': '/net-worth/investments',
      '/year': '/insights/year',
      '/tags': '/settings/tags',
    });
  });

  it('only redirects to a tab that exists', () => {
    const tabRoutes = new Set([...NET_WORTH_TABS, ...INSIGHTS_TABS, ...SETTINGS_TABS].map(t => t.to));
    for (const redirect of LEGACY_REDIRECTS) {
      expect(tabRoutes.has(redirect.to)).toBe(true);
    }
  });
});
