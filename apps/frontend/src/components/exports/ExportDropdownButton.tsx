import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExportFormat } from '@/services/exports.service';

interface Props {
  /** Called with the chosen format. Should return a promise that resolves
   *  once the download has been triggered (or rejects on error). */
  onExport: (format: ExportFormat) => Promise<void>;
  /** Disables the button when there's no data to export. */
  disabled?: boolean;
  /** Optional override for the visible label. */
  label?: string;
}

export function ExportDropdownButton({ onExport, disabled, label = 'Exporter' }: Props) {
  const [running, setRunning] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    if (running) return;
    setRunning(format);
    try {
      await onExport(format);
      toast.success(`Export ${format === 'excel' ? 'Excel' : 'PDF'} prêt`);
    } catch (err) {
      const apiMsg =
        (typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          typeof (err as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
            'string' &&
          (err as { response: { data: { message: string } } }).response.data.message) ||
        null;
      toast.error(apiMsg || 'Échec de l\'export');
    } finally {
      setRunning(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || running !== null}
          className="gap-2"
        >
          {running !== null ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run('excel')} disabled={running !== null}>
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
          <span>Exporter Excel</span>
          {running === 'excel' && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('pdf')} disabled={running !== null}>
          <FileText className="h-4 w-4 text-primary" />
          <span>Exporter PDF</span>
          {running === 'pdf' && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
