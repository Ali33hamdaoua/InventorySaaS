import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Tags,
  Truck,
  ShoppingCart,
  ClipboardList,
  Receipt,
  TrendingUp,
  Users,
  Wrench,
  Settings,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/Logo';
import { Permission, useCanAccessSettings, useHasPermission } from '@/lib/permissions';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Produits', icon: Package },
  { to: '/categories', label: 'Catégories', icon: Tags },
  { to: '/suppliers', label: 'Fournisseurs', icon: Truck },
  { to: '/purchases', label: 'Achats', icon: ShoppingCart },
  { to: '/inventory', label: 'Inventaires', icon: ClipboardList },
  { to: '/stock-transfers', label: 'Transferts', icon: ArrowLeftRight, permission: Permission.MANAGE_TRANSFERS },
  { to: '/accounting', label: 'Comptabilité', icon: Receipt },
  { to: '/labor', label: 'Main-d\'œuvre', icon: Users },
  { to: '/repairs', label: 'Réparations', icon: Wrench },
  { to: '/financial-reports', label: 'Rapports financiers', icon: TrendingUp },
  { to: '/settings', label: 'Paramètres', icon: Settings, permission: Permission.ACCESS_SETTINGS },
];

export function Sidebar() {
  const canAccessSettings = useCanAccessSettings();
  const canManageTransfers = useHasPermission(Permission.MANAGE_TRANSFERS);
  const items = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.permission === Permission.ACCESS_SETTINGS) return canAccessSettings;
        if (item.permission === Permission.MANAGE_TRANSFERS) return canManageTransfers;
        return true;
      }),
    [canAccessSettings, canManageTransfers],
  );

  return (
    <aside className="hidden w-64 flex-col border-r border-border/60 bg-card md:flex">
      <div className="flex h-16 items-center justify-center border-b border-border/60 px-6">
        <Logo size={40} className="shrink-0" />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-[var(--subtle-overlay)] hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-colors',
                    isActive ? 'bg-primary' : 'bg-transparent',
                  )}
                />
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border/60 p-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        smartresto.tech
      </div>
    </aside>
  );
}
