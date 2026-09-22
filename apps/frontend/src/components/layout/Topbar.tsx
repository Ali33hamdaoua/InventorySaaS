import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { BranchSwitcher } from './BranchSwitcher';

export function Topbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  const initial = user?.name?.[0]?.toUpperCase() ?? '?';

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/60 bg-[#141414] px-6">
      <div className="flex items-center gap-3 text-sm">
        <BranchSwitcher />
        <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:inline">
          La Maison du Burger · suivi multi-sites
        </span>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm sm:block">
              <div className="font-medium leading-tight">{user.name}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {user.role}
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {initial}
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="rounded-md border border-border/60 p-2 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          aria-label="Déconnexion"
          type="button"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
