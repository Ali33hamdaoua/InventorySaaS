import { Pencil, Power, PowerOff } from 'lucide-react';
import type { User } from '@/services/users.service';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserRoleBadge } from './UserRoleBadge';
import { UserStatusBadge } from './UserStatusBadge';
import { UserBranchBadge } from './UserBranchBadge';

interface Props {
  users: User[];
  loading?: boolean;
  currentUserId: string | null;
  onEdit: (user: User) => void;
  onToggle: (user: User) => void;
}

const dateFormatter = new Intl.DateTimeFormat('fr-CA', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function UsersTable({ users, loading, currentUserId, onEdit, onToggle }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-3 pb-2 font-medium">Nom</th>
            <th className="px-3 pb-2 font-medium">Email</th>
            <th className="px-3 pb-2 font-medium">Rôle</th>
            <th className="px-3 pb-2 font-medium">Succursale</th>
            <th className="hidden px-3 pb-2 font-medium md:table-cell">Créé le</th>
            <th className="px-3 pb-2 font-medium">Statut</th>
            <th className="px-3 pb-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : users.map((u) => {
                const isSelf = currentUserId === u.id;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-3 font-medium">
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-primary">
                          · vous
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {u.email}
                    </td>
                    <td className="px-3 py-3">
                      <UserRoleBadge role={u.role} />
                    </td>
                    <td className="px-3 py-3">
                      <UserBranchBadge branch={u.branch} />
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-muted-foreground md:table-cell">
                      {dateFormatter.format(new Date(u.createdAt))}
                    </td>
                    <td className="px-3 py-3">
                      <UserStatusBadge isActive={u.isActive} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(u)}
                          aria-label="Modifier l'utilisateur"
                          title="Modifier"
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggle(u)}
                          disabled={isSelf}
                          aria-label={u.isActive ? 'Désactiver' : 'Réactiver'}
                          title={
                            isSelf
                              ? 'Vous ne pouvez pas modifier votre propre statut'
                              : u.isActive
                                ? 'Désactiver'
                                : 'Réactiver'
                          }
                          className={
                            'h-8 w-8 ' +
                            (u.isActive ? 'hover:text-destructive' : 'hover:text-emerald-400')
                          }
                        >
                          {u.isActive ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
