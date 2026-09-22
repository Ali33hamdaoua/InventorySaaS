import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

const ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function ProductImportDropzone({ file, onFileChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const open = () => inputRef.current?.click();

  const handleFile = (f: File | null) => {
    if (!f) {
      onFileChange(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      // Soft client-side check — backend validates again.
      onFileChange(null);
      return;
    }
    onFileChange(f);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        disabled={disabled}
      />

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {(file.size / 1024).toFixed(1)} Ko
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFileChange(null)}
            disabled={disabled}
            className="gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Retirer
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0] ?? null);
          }}
          disabled={disabled}
          className={cn(
            'group relative flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 transition-colors',
            dragOver
              ? 'border-primary/60 bg-primary/[0.05]'
              : 'border-border/60 bg-background/40 hover:border-primary/40 hover:bg-primary/[0.03]',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="h-5 w-5" />
          </div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium">Glissez-déposez votre fichier Excel</p>
            <p className="text-xs text-muted-foreground">
              ou cliquez pour sélectionner · .xlsx uniquement · max 4 Mo
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
