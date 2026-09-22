import { Building2, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BranchesSettingsTab } from '@/components/settings/branches/BranchesSettingsTab';
import { UsersSettingsTab } from '@/components/settings/users/UsersSettingsTab';
import { useCanAccessSettings } from '@/lib/permissions';

export default function SettingsPage() {
  // Route is already guarded by <ProtectedRoute permission={ACCESS_SETTINGS}/>,
  // but a defensive check here protects against future routing mistakes —
  // never trust a single layer for authorization UX.
  const canAccess = useCanAccessSettings();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Gérez les succursales, les utilisateurs et les accès. Les changements ici sont audités
          et synchronisés immédiatement dans toute l'application.
        </p>
      </header>

      {!canAccess ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          Cette page est réservée au rôle <strong>Owner</strong>.
        </div>
      ) : (
        <Tabs defaultValue="branches" className="space-y-2">
          <TabsList>
            <TabsTrigger value="branches" className="gap-2">
              <Building2 className="h-4 w-4" />
              Succursales
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Utilisateurs & accès
            </TabsTrigger>
          </TabsList>

          <TabsContent value="branches">
            <BranchesSettingsTab />
          </TabsContent>

          <TabsContent value="users">
            <UsersSettingsTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
