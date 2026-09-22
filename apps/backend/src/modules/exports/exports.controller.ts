import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PeriodStatus } from '@prisma/client';
import { ExportsService } from './exports.service';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ListProductsDto } from '../products/dto/list-products.dto';
import { ListCategoriesDto } from '../categories/dto/list-categories.dto';
import { ListSuppliersDto } from '../suppliers/dto/list-suppliers.dto';
import { ListPurchasesDto } from '../purchases/dto/list-purchases.dto';
import { ListAccountingExpensesDto } from '../accounting/dto/list-accounting-expenses.dto';
import { isoStamp } from './exports.helpers';

type Format = 'excel' | 'pdf';

const exportLogger = new Logger('Exports');

/**
 * Strip diacritics + filesystem-hostile chars. Safari rejects fancy names in
 * Content-Disposition; the explicit ̀-ͯ range matches Unicode
 * combining diacriticals reliably regardless of source-file encoding.
 */
function safeFileName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/\s+/g, '-')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'export'
  );
}

/**
 * Single source of truth for streaming a binary export back to the browser.
 *
 * Headers we set and why Safari cares:
 *   - `Content-Type`: must be the EXACT Excel/PDF MIME, not octet-stream.
 *     Safari sniffs the body and refuses to download when the type is wrong.
 *   - `Content-Disposition: attachment; filename="…"`: tells Safari to
 *     download instead of navigate. Filename is ASCII-only — Safari rejects
 *     UTF-8 names in the basic form and the RFC 5987 `filename*=` form is
 *     overkill since we already sanitize accents.
 *   - `Content-Length`: required by Safari to show a progress bar AND to
 *     decide "this is a download, not a stream".
 *   - `Cache-Control: no-store`: belt + braces — Safari has been known to
 *     serve a cached Blob URL with a stale Content-Type otherwise.
 */
function sendExportResponse(
  res: Response,
  buf: Buffer,
  format: Format,
  baseName: string,
) {
  const ext = format === 'excel' ? 'xlsx' : 'pdf';
  const mime =
    format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
  const fileName = safeFileName(`${baseName}-${isoStamp()}.${ext}`);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', 'no-store');
  exportLogger.log(
    `Export OK — format=${format} bytes=${buf.length} file=${fileName}`,
  );
  res.end(buf);
}

/**
 * Wraps every export handler so a backend failure logs context + returns
 * a clean 500 with a real message (instead of the silent generic one that
 * burned the user before).
 */
async function runExport(
  res: Response,
  ctx: { module: string; format: Format; baseName: string; meta?: Record<string, unknown> },
  build: () => Promise<Buffer>,
): Promise<void> {
  try {
    const buf = await build();
    // Empty buffer → Safari shows a blank page instead of a download. Surface
    // a real 500 so the frontend toast picks it up.
    if (!buf || buf.length === 0) {
      throw new Error('Export buffer is empty (0 bytes generated).');
    }
    sendExportResponse(res, buf, ctx.format, ctx.baseName);
  } catch (e) {
    const err = e as Error;
    exportLogger.error(
      `Export failed — module=${ctx.module} format=${ctx.format} meta=${JSON.stringify(
        ctx.meta ?? {},
      )} : ${err.message}`,
      err.stack,
    );
    throw new InternalServerErrorException(
      `Échec de l'export ${ctx.module} (${ctx.format}). Détail technique enregistré dans les logs.`,
    );
  }
}

@ApiTags('exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  // -------------------- Products --------------------
  @Get('products/excel')
  @ApiOperation({ summary: 'Export Excel des produits (mêmes filtres que /products)' })
  @Audit({ action: 'EXPORT', entity: 'InventoryProduct' })
  productsExcel(
    @Query() q: ListProductsDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      { module: 'products', format: 'excel', baseName: 'produits' },
      () => this.service.products('excel', q, user),
    );
  }

  @Get('products/pdf')
  @ApiOperation({ summary: 'Export PDF des produits' })
  @Audit({ action: 'EXPORT', entity: 'InventoryProduct' })
  productsPdf(
    @Query() q: ListProductsDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      { module: 'products', format: 'pdf', baseName: 'produits' },
      () => this.service.products('pdf', q, user),
    );
  }

  // -------------------- Categories --------------------
  @Get('categories/excel')
  @ApiOperation({ summary: 'Export Excel des catégories' })
  @Audit({ action: 'EXPORT', entity: 'Category' })
  categoriesExcel(@Query() q: ListCategoriesDto, @Res() res: Response) {
    return runExport(
      res,
      { module: 'categories', format: 'excel', baseName: 'categories' },
      () => this.service.categories('excel', q),
    );
  }

  @Get('categories/pdf')
  @ApiOperation({ summary: 'Export PDF des catégories' })
  @Audit({ action: 'EXPORT', entity: 'Category' })
  categoriesPdf(@Query() q: ListCategoriesDto, @Res() res: Response) {
    return runExport(
      res,
      { module: 'categories', format: 'pdf', baseName: 'categories' },
      () => this.service.categories('pdf', q),
    );
  }

  // -------------------- Suppliers --------------------
  @Get('suppliers/excel')
  @ApiOperation({ summary: 'Export Excel des fournisseurs' })
  @Audit({ action: 'EXPORT', entity: 'Supplier' })
  suppliersExcel(@Query() q: ListSuppliersDto, @Res() res: Response) {
    return runExport(
      res,
      { module: 'suppliers', format: 'excel', baseName: 'fournisseurs' },
      () => this.service.suppliers('excel', q),
    );
  }

  @Get('suppliers/pdf')
  @ApiOperation({ summary: 'Export PDF des fournisseurs' })
  @Audit({ action: 'EXPORT', entity: 'Supplier' })
  suppliersPdf(@Query() q: ListSuppliersDto, @Res() res: Response) {
    return runExport(
      res,
      { module: 'suppliers', format: 'pdf', baseName: 'fournisseurs' },
      () => this.service.suppliers('pdf', q),
    );
  }

  // -------------------- Purchases --------------------
  @Get('purchases/excel')
  @ApiOperation({ summary: 'Export Excel des achats' })
  @Audit({ action: 'EXPORT', entity: 'Purchase' })
  purchasesExcel(
    @Query() q: ListPurchasesDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      { module: 'purchases', format: 'excel', baseName: 'achats' },
      () => this.service.purchases('excel', q, user),
    );
  }

  @Get('purchases/pdf')
  @ApiOperation({ summary: 'Export PDF des achats' })
  @Audit({ action: 'EXPORT', entity: 'Purchase' })
  purchasesPdf(
    @Query() q: ListPurchasesDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      { module: 'purchases', format: 'pdf', baseName: 'achats' },
      () => this.service.purchases('pdf', q, user),
    );
  }

  // -------------------- Inventory Periods --------------------
  @Get('inventory-periods/excel')
  @ApiOperation({ summary: 'Export Excel des périodes d\'inventaire' })
  @Audit({ action: 'EXPORT', entity: 'InventoryPeriod' })
  periodsExcel(
    @Query('status') status: PeriodStatus | undefined,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'inventory-periods',
        format: 'excel',
        baseName: 'periodes-inventaire',
        meta: { status, branchId },
      },
      () => this.service.inventoryPeriods('excel', status, user, branchId),
    );
  }

  @Get('inventory-periods/pdf')
  @ApiOperation({ summary: 'Export PDF des périodes d\'inventaire' })
  @Audit({ action: 'EXPORT', entity: 'InventoryPeriod' })
  periodsPdf(
    @Query('status') status: PeriodStatus | undefined,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'inventory-periods',
        format: 'pdf',
        baseName: 'periodes-inventaire',
        meta: { status, branchId },
      },
      () => this.service.inventoryPeriods('pdf', status, user, branchId),
    );
  }

  // -------------------- Inventory Count Template --------------------
  /**
   * Blank Excel template for the physical inventory count. Per client spec
   * the file is a comptage support only — NO prices, NO costs, NO formulas.
   * Just the active products of the period's branch with two empty columns
   * (Cartons / Unités) for the counter to fill by hand.
   */
  @Get('inventory-periods/:periodId/count-template/excel')
  @ApiOperation({
    summary: 'Excel vierge pour le comptage physique d\'une période d\'inventaire',
  })
  @Audit({ action: 'EXPORT', entity: 'InventoryPeriod' })
  countTemplateExcel(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'inventory-count-template',
        format: 'excel',
        baseName: `modele-comptage-${periodId.slice(0, 8)}`,
        meta: { periodId },
      },
      () => this.service.inventoryCountTemplate(periodId),
    );
  }

  // -------------------- Inventory Detail (lines per period) --------------------
  @Get('inventory-periods/:periodId/lines/excel')
  @ApiOperation({ summary: 'Export Excel des lignes d\'inventaire d\'une période' })
  @Audit({ action: 'EXPORT', entity: 'InventoryLine' })
  linesExcel(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Query('search') search: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('criticalOnly') criticalOnly: 'true' | undefined,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'inventory-lines',
        format: 'excel',
        baseName: `inventaire-${periodId.slice(0, 8)}`,
        meta: { periodId },
      },
      () =>
        this.service.inventoryLines(periodId, 'excel', { search, categoryId, criticalOnly }),
    );
  }

  @Get('inventory-periods/:periodId/lines/pdf')
  @ApiOperation({ summary: 'Export PDF des lignes d\'inventaire d\'une période' })
  @Audit({ action: 'EXPORT', entity: 'InventoryLine' })
  linesPdf(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Query('search') search: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('criticalOnly') criticalOnly: 'true' | undefined,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'inventory-lines',
        format: 'pdf',
        baseName: `inventaire-${periodId.slice(0, 8)}`,
        meta: { periodId },
      },
      () =>
        this.service.inventoryLines(periodId, 'pdf', { search, categoryId, criticalOnly }),
    );
  }

  // -------------------- Accounting expenses --------------------
  @Get('accounting/expenses/excel')
  @ApiOperation({
    summary: 'Export Excel des dépenses comptables (mêmes filtres que /accounting/expenses)',
  })
  @Audit({ action: 'EXPORT', entity: 'AccountingExpense' })
  accountingExpensesExcel(
    @Query() q: ListAccountingExpensesDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      { module: 'accounting', format: 'excel', baseName: 'depenses-comptables' },
      () => this.service.accounting('excel', q, user),
    );
  }

  @Get('accounting/expenses/pdf')
  @ApiOperation({ summary: 'Export PDF des dépenses comptables' })
  @Audit({ action: 'EXPORT', entity: 'AccountingExpense' })
  accountingExpensesPdf(
    @Query() q: ListAccountingExpensesDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      { module: 'accounting', format: 'pdf', baseName: 'depenses-comptables' },
      () => this.service.accounting('pdf', q, user),
    );
  }

  // -------------------- Financial reports --------------------
  @Get('financial-reports/:id/excel')
  @ApiOperation({ summary: 'Export Excel multi-onglets du rapport financier mensuel' })
  @Audit({ action: 'EXPORT', entity: 'FinancialReport' })
  financialReportExcel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'financial-reports',
        format: 'excel',
        baseName: `rapport-financier-${id.slice(0, 8)}`,
        meta: { reportId: id },
      },
      () => this.service.financialReport(id, 'excel', user),
    );
  }

  @Get('financial-reports/:id/pdf')
  @ApiOperation({ summary: 'Export PDF du rapport financier mensuel' })
  @Audit({ action: 'EXPORT', entity: 'FinancialReport' })
  financialReportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'financial-reports',
        format: 'pdf',
        baseName: `rapport-financier-${id.slice(0, 8)}`,
        meta: { reportId: id },
      },
      () => this.service.financialReport(id, 'pdf', user),
    );
  }

  // -------------------- Legacy routes (backwards compat) --------------------
  @Get('period/:periodId/excel')
  legacyExcel(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Res() res: Response,
  ) {
    return runExport(
      res,
      {
        module: 'legacy-period',
        format: 'excel',
        baseName: `inventaire-${periodId.slice(0, 8)}`,
        meta: { periodId },
      },
      () => this.service.inventoryLines(periodId, 'excel', {}),
    );
  }

  @Get('period/:periodId/pdf')
  legacyPdf(@Param('periodId', ParseUUIDPipe) periodId: string, @Res() res: Response) {
    return runExport(
      res,
      {
        module: 'legacy-period',
        format: 'pdf',
        baseName: `inventaire-${periodId.slice(0, 8)}`,
        meta: { periodId },
      },
      () => this.service.inventoryLines(periodId, 'pdf', {}),
    );
  }
}
