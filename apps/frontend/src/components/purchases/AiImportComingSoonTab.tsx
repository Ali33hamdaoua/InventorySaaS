import {
  Sparkles,
  Upload,
  ScanText,
  ListChecks,
  Link as LinkIcon,
  UserCheck,
  CheckCircle2,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { primaryAlpha } from '@/lib/brand';

interface Step {
  num: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    num: 1,
    icon: <Upload className="h-4 w-4" />,
    title: 'Importer la facture',
    description: 'Glissez-déposez un PDF ou une image (JPG/PNG) de facture fournisseur.',
  },
  {
    num: 2,
    icon: <ScanText className="h-4 w-4" />,
    title: 'Analyse IA',
    description: 'OCR + extraction structurée du fournisseur, numéro, date et lignes.',
  },
  {
    num: 3,
    icon: <ListChecks className="h-4 w-4" />,
    title: 'Extraction des lignes',
    description: 'Quantités, prix unitaires et totaux détectés automatiquement.',
  },
  {
    num: 4,
    icon: <LinkIcon className="h-4 w-4" />,
    title: 'Matching produits',
    description: 'Rapprochement avec votre catalogue (SKU, nom, unité). Suggestions par similarité.',
  },
  {
    num: 5,
    icon: <UserCheck className="h-4 w-4" />,
    title: 'Validation humaine',
    description: "Vous validez chaque ligne avant la création. Aucun achat n'est créé sans confirmation.",
  },
  {
    num: 6,
    icon: <CheckCircle2 className="h-4 w-4" />,
    title: 'Création de l\'achat',
    description: "L'achat est ajouté au mois en cours et apparaît dans le dashboard.",
  },
];

export function AiImportComingSoonTab() {
  return (
    <div className="space-y-6">
      {/* ===== Hero ===== */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary/60 to-transparent"
        />
        <CardContent className="flex flex-col gap-5 p-8 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
            style={{ boxShadow: `0 8px 24px ${primaryAlpha(0.18)}` }}>
            <Sparkles className="h-7 w-7" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Bientôt disponible</Badge>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Validation humaine obligatoire
              </Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Import IA des factures fournisseurs
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              L'import IA permettra bientôt d'analyser automatiquement vos factures fournisseurs.
              Téléversez un PDF ou une image, l'IA extrait fournisseur, numéro, date, lignes,
              quantités, prix unitaires et totaux — puis matche chaque ligne avec votre
              catalogue. Vous validez avant la création de l'achat.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Workflow steps ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Upload preview (disabled) */}
        <Card className="lg:col-span-1">
          <CardContent className="p-6">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Zone d'import
            </p>
            <div
              aria-disabled
              className="relative flex h-56 cursor-not-allowed flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-dashed border-border/60 bg-background/40"
              title="Disponible bientôt"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium">Glisser-déposer une facture</p>
                <p className="text-xs text-muted-foreground">PDF, JPG ou PNG · max 10 Mo</p>
              </div>
              <Badge variant="outline" className="absolute right-3 top-3 text-[10px]">
                Aperçu
              </Badge>
              <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px]" />
            </div>
          </CardContent>
        </Card>

        {/* Workflow */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <p className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Le futur workflow
            </p>
            <ol className="space-y-3">
              {STEPS.map((s) => (
                <li key={s.num} className="flex items-start gap-3 rounded-md border border-border/40 bg-background/30 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {s.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      <span className="mr-2 text-xs text-muted-foreground">{`0${s.num}`}</span>
                      {s.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {s.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* ===== Safety note ===== */}
      <Card className="border-emerald-500/20 bg-emerald-500/[0.04]">
        <CardContent className="flex items-start gap-3 p-5 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Aucun achat créé automatiquement</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Vous restez maître de la donnée : chaque facture analysée est proposée pour
              validation. Aucun achat n'est inséré dans le système sans votre confirmation
              explicite, ligne par ligne.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
