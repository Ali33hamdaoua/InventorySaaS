import { Sparkles, ShoppingCart } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ManualPurchasesTab } from '@/components/purchases/ManualPurchasesTab';
import { AiImportComingSoonTab } from '@/components/purchases/AiImportComingSoonTab';

export default function PurchasesPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Achats fournisseurs
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Bons d'achat</h1>
        <p className="text-sm text-muted-foreground">
          Saisissez vos factures fournisseurs manuellement, ou (bientôt) laissez l'IA les analyser
          pour vous. Les achats alimentent automatiquement le calcul du food cost.
        </p>
      </header>

      <Tabs defaultValue="manual" className="space-y-2">
        <TabsList>
          <TabsTrigger value="manual" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Achats manuels
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Import IA
            <Badge variant="primary" className="ml-1 text-[9px]">
              Bientôt
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <ManualPurchasesTab />
        </TabsContent>

        <TabsContent value="ai">
          <AiImportComingSoonTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
