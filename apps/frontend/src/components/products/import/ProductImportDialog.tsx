import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Upload, CheckCircle2 } from 'lucide-react';
import type {
  ProductImportInactiveAction,
  ProductImportPreviewResponse,
} from '@inventorymdb/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { productsService } from '@/services/products.service';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { ProductImportInstructions } from './ProductImportInstructions';
import { ProductImportDropzone } from './ProductImportDropzone';
import { ProductImportPreviewTable } from './ProductImportPreviewTable';
import { ProductImportSummary } from './ProductImportSummary';

type Step = 'instructions' | 'preview';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ProductImportDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { branchId } = useActiveBranch();
  const [step, setStep] = useState<Step>('instructions');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportPreviewResponse | null>(null);
  const [downloading, setDownloading] = useState(false);

  const reset = () => {
    setStep('instructions');
    setFile(null);
    setPreview(null);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await productsService.downloadTemplate();
      toast.success('Template téléchargé');
    } catch {
      toast.error('Échec du téléchargement du template');
    } finally {
      setDownloading(false);
    }
  };

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!file) return Promise.reject(new Error('Aucun fichier'));
      return productsService.previewImport(file);
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
    },
    onError: (e: unknown) => {
      const apiMsg =
        (typeof e === 'object' &&
          e !== null &&
          'response' in e &&
          typeof (e as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
            'string' &&
          (e as { response: { data: { message: string } } }).response.data.message) ||
        null;
      toast.error(apiMsg || 'Échec de l\'analyse du fichier');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!preview) return Promise.reject(new Error('Aucune prévisualisation'));
      if (!branchId) return Promise.reject(new Error('Aucune succursale sélectionnée'));
      // Backend revalidates — we can send all rows; errors will be ignored.
      return productsService.confirmImport(preview.rows, branchId);
    },
    onSuccess: (data) => {
      const parts: string[] = [
        `${data.summary.createCount} créé${data.summary.createCount > 1 ? 's' : ''}`,
        `${data.summary.updateCount} mis à jour`,
      ];
      if (data.summary.reactivatedCount > 0) {
        parts.push(`${data.summary.reactivatedCount} réactivé(s)`);
      }
      if (data.summary.ignoredCount > 0) {
        parts.push(`${data.summary.ignoredCount} ignoré(s)`);
      }
      toast.success(`Import terminé : ${parts.join(' · ')}`);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
      reset();
    },
    onError: (e: unknown) => {
      const apiMsg =
        (typeof e === 'object' &&
          e !== null &&
          'response' in e &&
          typeof (e as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
            'string' &&
          (e as { response: { data: { message: string } } }).response.data.message) ||
        null;
      toast.error(apiMsg || 'Échec de l\'import');
    },
  });

  // Décisions par ligne pour les INACTIVE_MATCH. IGNORE par défaut : la
  // règle métier interdit la réactivation silencieuse.
  const handleInactiveActionChange = (
    rowNumber: number,
    action: ProductImportInactiveAction,
  ) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) =>
          r.rowNumber === rowNumber ? { ...r, inactiveAction: action } : r,
        ),
      };
    });
  };

  const importableCount = preview
    ? preview.summary.validRows +
      preview.summary.warningRows +
      preview.rows.filter(
        (r) =>
          r.status === 'INACTIVE_MATCH' && r.inactiveAction === 'REACTIVATE_AND_UPDATE',
      ).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'instructions' ? 'Importer des produits' : 'Prévisualisation de l\'import'}
          </DialogTitle>
          <DialogDescription>
            {step === 'instructions'
              ? 'Téléchargez le template, remplissez-le avec vos produits, puis importez-le.'
              : 'Vérifiez les lignes détectées avant de confirmer. Les lignes en erreur ne seront pas importées.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'instructions' && (
          <div className="space-y-4">
            <ProductImportInstructions
              onDownloadTemplate={handleDownloadTemplate}
              downloading={downloading}
            />
            <ProductImportDropzone
              file={file}
              onFileChange={setFile}
              disabled={previewMutation.isPending}
            />
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <ProductImportSummary summary={preview.summary} />
            <ProductImportPreviewTable
              rows={preview.rows}
              onInactiveActionChange={handleInactiveActionChange}
            />
            {preview.summary.errorRows > 0 && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
                <strong className="text-amber-300">Note :</strong> les{' '}
                {preview.summary.errorRows} ligne(s) en erreur ne seront pas importées. Vous
                pouvez quand même confirmer l'import des autres lignes.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'instructions' && (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={!file || previewMutation.isPending}
                className="btn-brand-glow gap-2"
              >
                {previewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {previewMutation.isPending ? 'Analyse…' : 'Analyser le fichier'}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep('instructions');
                  setPreview(null);
                }}
                disabled={confirmMutation.isPending}
                className="gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour
              </Button>
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={importableCount === 0 || confirmMutation.isPending}
                className="btn-brand-glow gap-2"
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {confirmMutation.isPending
                  ? 'Import en cours…'
                  : `Importer ${importableCount} ligne${importableCount > 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
