import {
  BarChart3,
  Gamepad2,
  LayoutDashboard,
  Plus,
  Settings,
  Shield,
  Trophy,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { cn } from '@utils/cn';

import type { LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** `end` stops "/" from matching as active on every nested route. */
  end?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/tournaments', labelKey: 'nav.tournaments', icon: Trophy },
  { to: '/teams', labelKey: 'nav.teams', icon: Shield },
  { to: '/games', labelKey: 'nav.games', icon: Gamepad2 },
  { to: '/statistics', labelKey: 'nav.statistics', icon: BarChart3 },
];

const SECONDARY_NAV: NavItem[] = [
  { to: '/transfer', labelKey: 'nav.transfer', icon: Upload },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export interface SidebarProps {
  /** When collapsed, only icons are shown (below 1024px). */
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const { t } = useTranslation();

  const renderItem = ({ to, labelKey, icon: Icon, end }: NavItem) => (
    <li key={to}>
      <NavLink
        to={to}
        end={end ?? false}
        title={collapsed ? t(labelKey) : undefined}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium',
            'transition-colors duration-[120ms]',
            collapsed && 'justify-center px-0',
            isActive
              ? 'bg-accent-subtle text-accent'
              : 'text-fg-secondary hover:bg-hover hover:text-fg',
          )
        }
      >
        <Icon size={18} aria-hidden className="shrink-0" />
        {!collapsed && <span>{t(labelKey)}</span>}
      </NavLink>
    </li>
  );

  return (
    <nav
      aria-label={t('nav.mainNavigation')}
      className={cn(
        'flex h-full flex-col border-r border-line bg-surface transition-[width] duration-200',
        collapsed ? 'w-16 px-2' : 'w-[260px] px-3',
      )}
    >
      <ul className="mt-4 flex flex-col gap-1">{PRIMARY_NAV.map(renderItem)}</ul>

      <div className="my-4 border-t border-line" />

      <ul className="flex flex-col gap-1">{SECONDARY_NAV.map(renderItem)}</ul>

      <div className="mt-auto mb-4">
        <Button
          variant="primary"
          size={collapsed ? 'icon' : 'md'}
          className={collapsed ? '' : 'w-full justify-center'}
          icon={<Plus size={18} aria-hidden />}
          aria-label={collapsed ? t('nav.newTournament') : undefined}
        >
          {t('nav.newTournament')}
        </Button>
      </div>
    </nav>
  );
}
