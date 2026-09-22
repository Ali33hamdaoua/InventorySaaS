import { z } from 'zod';
import { ExportFormat } from '../enums';

export const exportReportSchema = z.object({
  periodId: z.string().uuid(),
  format: z.nativeEnum(ExportFormat),
});
export type ExportReportDto = z.infer<typeof exportReportSchema>;
