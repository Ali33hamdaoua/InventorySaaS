import { Injectable } from '@nestjs/common';
import { ExpenseCategory, PaymentMethod, PeriodStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { ACCOUNTING_SOURCE_LABEL, EXPENSE_CATEGORY_LABEL } from '@inventorymdb/shared';
import { CategoriesService } from '../categories/categories.service';
import { ListCategoriesDto } from '../categories/dto/list-categories.dto';
import { ProductsService } from '../products/products.service';
import { ListProductsDto } from '../products/dto/list-products.dto';
import { SuppliersService } from '../suppliers/suppliers.service';
import { ListSuppliersDto } from '../suppliers/dto/list-suppliers.dto';
import { PurchasesService } from '../purchases/purchases.service';
import { ListPurchasesDto } from '../purchases/dto/list-purchases.dto';
import { InventoryPeriodsService } from '../inventory-periods/inventory-periods.service';
import { InventoryLinesService } from '../inventory-lines/inventory-lines.service';
import { AccountingService } from '../accounting/accounting.service';
import { ListAccountingExpensesDto } from '../accounting/dto/list-accounting-expenses.dto';
import { FinancialReportsService } from '../financial-reports/financial-reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildExcel,
  buildPdf,
  escapeHtml,
  fmtCurrency,
  fmtDate,
  fmtNumber,
  fmtPct,
  renderPdfFromHtml,
} from './exports.helpers';
import { BRAND_NAME, APP_NAME, BRAND_PRIMARY_COLOR, BRAND_PRIMARY_ARGB, exportFooter } from '../../common/config/brand';

type Format = 'excel' | 'pdf';

@Injectable()
export class ExportsService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly suppliersService: SuppliersService,
    private readonly purchasesService: PurchasesService,
    private readonly periodsService: InventoryPeriodsService,
    private readonly linesService: InventoryLinesService,
    private readonly accountingService: AccountingService,
    private readonly financialReportsService: FinancialReportsService,
    private readonly prisma: PrismaService,
  ) {}

  // -------------------------------------------------------------------
  // Filter → human-readable summary lines (printed at the top of every file)
  // -------------------------------------------------------------------

  private async productsFilterLabels(q: ListProductsDto): Promise<string[]> {
    const labels: string[] = [];
    if (q.search) labels.push(`Recherche : "${q.search}"`);
    if (q.categoryId) {
      const cat = await this.categoriesService.findOne(q.categoryId).catch(() => null);
      labels.push(`Catégorie : ${cat?.name ?? q.categoryId}`);
    }
    if (q.supplierId) {
      const sup = await this.suppliersService.findOne(q.supplierId).catch(() => null);
      labels.push(`Fournisseur : ${sup?.name ?? q.supplierId}`);
    }
    if (q.unit) labels.push(`Unité : ${q.unit}`);
    if (q.isActive === 'true') labels.push('Statut : Actif');
    if (q.isActive === 'false') labels.push('Statut : Inactif');
    if (q.criticalOnly === 'true') labels.push('Avec seuil minimum > 0');
    if (q.sortBy && q.sortBy !== 'name') {
      labels.push(`Tri : ${q.sortBy} ${q.sortOrder ?? 'asc'}`);
    }
    return labels;
  }

  private categoriesFilterLabels(q: ListCategoriesDto): string[] {
    const labels: string[] = [];
    if (q.search) labels.push(`Recherche : "${q.search}"`);
    if (q.categoryType) labels.push(`Type : ${q.categoryType === 'FOOD' ? 'Food' : 'Non-food'}`);
    if (q.isActive === 'true') labels.push('Statut : Actif');
    if (q.isActive === 'false') labels.push('Statut : Inactif');
    return labels;
  }

  private suppliersFilterLabels(q: ListSuppliersDto): string[] {
    const labels: string[] = [];
    if (q.search) labels.push(`Recherche : "${q.search}"`);
    if (q.isActive === 'true') labels.push('Statut : Actif');
    if (q.isActive === 'false') labels.push('Statut : Inactif');
    return labels;
  }

  private async purchasesFilterLabels(q: ListPurchasesDto): Promise<string[]> {
    const labels: string[] = [];
    if (q.search) labels.push(`Recherche : "${q.search}"`);
    if (q.supplierId) {
      const s = await this.suppliersService.findOne(q.supplierId).catch(() => null);
      labels.push(`Fournisseur : ${s?.name ?? q.supplierId}`);
    }
    if (q.startDate) labels.push(`À partir du ${fmtDate(q.startDate)}`);
    if (q.endDate) labels.push(`Jusqu'au ${fmtDate(q.endDate)}`);
    return labels;
  }

  private periodsFilterLabels(status?: PeriodStatus): string[] {
    if (!status) return [];
    return [`Statut : ${status === PeriodStatus.OPEN ? 'Ouverte' : 'Clôturées'}`];
  }

  // -------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------

  async products(format: Format, q: ListProductsDto, user?: RequestUser): Promise<Buffer> {
    // Pull all matching rows by widening the page size — exports
    // intentionally ignore UI pagination. User is passed through so a
    // MANAGER export stays scoped to their branch.
    const all = await this.productsService.findAll({ ...q, page: 1, pageSize: 10_000 }, user);
    const filters = await this.productsFilterLabels(q);

    if (format === 'excel') {
      return buildExcel({
        sheetName: 'Produits',
        title: 'Produits d\'inventaire',
        appliedFilters: filters,
        columns: [
          { header: 'Nom', value: (p) => p.name, width: 30 },
          {
            header: 'Catégorie',
            value: (p) => p.category?.name ?? '',
            width: 22,
          },
          {
            header: 'Fournisseur',
            value: (p) => p.supplier?.name ?? '',
            width: 24,
          },
          { header: 'Unité', value: (p) => p.unit, width: 10 },
          {
            header: 'Coût par défaut',
            value: (p) => Number(p.defaultCost),
            numFmt: '#,##0.0000 "$"',
            alignment: { horizontal: 'right' },
            width: 18,
          },
          {
            header: 'Seuil minimum',
            value: (p) => Number(p.minStockLevel),
            numFmt: '#,##0.0000',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          {
            header: 'Statut',
            value: (p) => (p.isActive ? 'Actif' : 'Inactif'),
            width: 10,
          },
          {
            header: 'Créé le',
            value: (p) => new Date(p.createdAt),
            numFmt: 'yyyy-mm-dd',
            width: 14,
          },
        ],
        rows: all.data,
      });
    }
    return buildPdf({
      title: 'Produits d\'inventaire',
      appliedFilters: filters,
      columns: [
        { header: 'Nom', value: (p) => p.name },
        { header: 'Catégorie', value: (p) => p.category?.name ?? '—' },
        { header: 'Fournisseur', value: (p) => p.supplier?.name ?? '—' },
        { header: 'Unité', value: (p) => p.unit, align: 'center' },
        {
          header: 'Coût par défaut',
          value: (p) => fmtCurrency(p.defaultCost),
          align: 'right',
        },
        {
          header: 'Seuil min',
          value: (p) => fmtNumber(p.minStockLevel),
          align: 'right',
        },
        { header: 'Statut', value: (p) => (p.isActive ? 'Actif' : 'Inactif'), align: 'center' },
      ],
      rows: all.data,
    });
  }

  // -------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------

  async categories(format: Format, q: ListCategoriesDto): Promise<Buffer> {
    const rows = await this.categoriesService.findAll({ ...q, includeProductCount: 'true' });
    const filters = this.categoriesFilterLabels(q);

    if (format === 'excel') {
      return buildExcel({
        sheetName: 'Catégories',
        title: 'Catégories',
        appliedFilters: filters,
        columns: [
          { header: 'Nom', value: (c) => c.name, width: 28 },
          { header: 'Type', value: (c) => (c.categoryType === 'FOOD' ? 'Food' : 'Non-food'), width: 12 },
          { header: 'Description', value: (c) => c.description ?? '', width: 40 },
          {
            header: 'Produits liés',
            value: (c) => c.productCount ?? 0,
            numFmt: '0',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          { header: 'Statut', value: (c) => (c.isActive ? 'Actif' : 'Inactif'), width: 10 },
          {
            header: 'Créée le',
            value: (c) => new Date(c.createdAt),
            numFmt: 'yyyy-mm-dd',
            width: 14,
          },
        ],
        rows,
      });
    }
    return buildPdf({
      title: 'Catégories',
      appliedFilters: filters,
      columns: [
        { header: 'Nom', value: (c) => c.name },
        { header: 'Type', value: (c) => (c.categoryType === 'FOOD' ? 'Food' : 'Non-food'), align: 'center' },
        { header: 'Description', value: (c) => c.description ?? '—' },
        { header: 'Produits', value: (c) => String(c.productCount ?? 0), align: 'right' },
        { header: 'Statut', value: (c) => (c.isActive ? 'Actif' : 'Inactif'), align: 'center' },
      ],
      rows,
    });
  }

  // -------------------------------------------------------------------
  // Suppliers
  // -------------------------------------------------------------------

  async suppliers(format: Format, q: ListSuppliersDto): Promise<Buffer> {
    const rows = await this.suppliersService.findAll({ ...q, includeStats: 'true' });
    const filters = this.suppliersFilterLabels(q);

    if (format === 'excel') {
      return buildExcel({
        sheetName: 'Fournisseurs',
        title: 'Fournisseurs',
        appliedFilters: filters,
        columns: [
          { header: 'Nom', value: (s) => s.name, width: 30 },
          { header: 'Contact', value: (s) => s.contactName ?? '', width: 20 },
          { header: 'Téléphone', value: (s) => s.phone ?? '', width: 18 },
          { header: 'Email', value: (s) => s.email ?? '', width: 26 },
          { header: 'Adresse', value: (s) => s.address ?? '', width: 32 },
          {
            header: 'Achats',
            value: (s) => s.purchasesCount ?? 0,
            numFmt: '0',
            alignment: { horizontal: 'right' },
            width: 10,
          },
          {
            header: 'Total acheté',
            value: (s) => Number(s.totalPurchasedAmount ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          {
            header: 'Dernier achat',
            value: (s) => (s.lastPurchaseDate ? new Date(s.lastPurchaseDate) : ''),
            numFmt: 'yyyy-mm-dd',
            width: 14,
          },
          { header: 'Statut', value: (s) => (s.isActive ? 'Actif' : 'Inactif'), width: 10 },
        ],
        rows,
      });
    }
    return buildPdf({
      title: 'Fournisseurs',
      appliedFilters: filters,
      columns: [
        { header: 'Nom', value: (s) => s.name },
        { header: 'Contact', value: (s) => s.contactName ?? '—' },
        { header: 'Email', value: (s) => s.email ?? '—' },
        { header: 'Téléphone', value: (s) => s.phone ?? '—' },
        { header: 'Achats', value: (s) => String(s.purchasesCount ?? 0), align: 'right' },
        {
          header: 'Total',
          value: (s) => fmtCurrency(s.totalPurchasedAmount ?? 0),
          align: 'right',
        },
        {
          header: 'Dernier',
          value: (s) => (s.lastPurchaseDate ? fmtDate(s.lastPurchaseDate) : '—'),
          align: 'right',
        },
        { header: 'Statut', value: (s) => (s.isActive ? 'Actif' : 'Inactif'), align: 'center' },
      ],
      rows,
    });
  }

  // -------------------------------------------------------------------
  // Purchases
  // -------------------------------------------------------------------

  async purchases(format: Format, q: ListPurchasesDto, user?: RequestUser): Promise<Buffer> {
    const all = await this.purchasesService.findAll(
      {
        ...q,
        page: 1,
        pageSize: 10_000,
        // We need items to count the lines per purchase in the export.
        includeItems: 'true',
      },
      user,
    );
    const filters = await this.purchasesFilterLabels(q);
    const rows = all.data as Array<{
      id: string;
      purchaseDate: Date;
      subtotalHT: { toString(): string };
      tpsAmount: { toString(): string };
      tvqAmount: { toString(): string };
      totalAmount: { toString(): string };
      note: string | null;
      supplier?: { name?: string };
      items?: unknown[];
      additionalCosts?: Array<{
        amountBeforeTax: { toString(): string };
        totalAmount: { toString(): string };
      }>;
    }>;

    const sumDec = (key: 'subtotalHT' | 'tpsAmount' | 'tvqAmount' | 'totalAmount') =>
      rows.reduce((s, p) => s + Number(p[key].toString()), 0);

    // Sommes par achat des frais supplémentaires (essence/livraison/…).
    // Ces valeurs sont INFORMATIVES dans l'export achats. Elles sont déjà
    // reflétées dans le rapport financier via le mirror comptable HT.
    const acHT = (p: (typeof rows)[number]) =>
      (p.additionalCosts ?? []).reduce(
        (s, c) => s + Number(c.amountBeforeTax.toString()),
        0,
      );
    const acTTC = (p: (typeof rows)[number]) =>
      (p.additionalCosts ?? []).reduce(
        (s, c) => s + Number(c.totalAmount.toString()),
        0,
      );
    const sumAdditionalHT = rows.reduce((s, p) => s + acHT(p), 0);
    const sumAdditionalTTC = rows.reduce((s, p) => s + acTTC(p), 0);

    // Total facture = produits TTC + frais TTC (le vrai montant payé au
    // fournisseur). N'affecte AUCUN calcul inventaire.
    const invoiceTotal = (p: (typeof rows)[number]) =>
      Number(p.totalAmount.toString()) + acTTC(p);
    const sumGrandTotal = rows.reduce((s, p) => s + invoiceTotal(p), 0);

    if (format === 'excel') {
      return buildExcel({
        sheetName: 'Achats',
        title: 'Achats fournisseurs',
        appliedFilters: filters,
        columns: [
          {
            header: 'Date',
            value: (p) => new Date(p.purchaseDate),
            numFmt: 'yyyy-mm-dd',
            width: 14,
          },
          { header: 'Fournisseur', value: (p) => p.supplier?.name ?? '', width: 28 },
          {
            header: 'Lignes',
            value: (p) => p.items?.length ?? 0,
            numFmt: '0',
            alignment: { horizontal: 'right' },
            width: 10,
          },
          {
            header: 'Sous-total HT',
            value: (p) => Number(p.subtotalHT.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'TPS',
            value: (p) => Number(p.tpsAmount.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'TVQ',
            value: (p) => Number(p.tvqAmount.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Total produits TTC',
            value: (p) => Number(p.totalAmount.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          {
            header: 'Frais HT',
            value: (p) => acHT(p),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Frais TTC',
            value: (p) => acTTC(p),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Total facture TTC',
            value: (p) => invoiceTotal(p),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          { header: 'Note', value: (p) => p.note ?? '', width: 30 },
        ],
        rows,
      });
    }
    return buildPdf({
      title: 'Achats fournisseurs',
      appliedFilters: filters,
      columns: [
        { header: 'Date', value: (p) => fmtDate(p.purchaseDate) },
        { header: 'Fournisseur', value: (p) => p.supplier?.name ?? '—' },
        {
          header: 'Lignes',
          value: (p) => String(p.items?.length ?? 0),
          align: 'right',
        },
        {
          header: 'HT',
          value: (p) => fmtCurrency(p.subtotalHT.toString()),
          align: 'right',
        },
        {
          header: 'TPS',
          value: (p) => fmtCurrency(p.tpsAmount.toString()),
          align: 'right',
        },
        {
          header: 'TVQ',
          value: (p) => fmtCurrency(p.tvqAmount.toString()),
          align: 'right',
        },
        {
          header: 'Produits TTC',
          value: (p) => fmtCurrency(p.totalAmount.toString()),
          align: 'right',
        },
        {
          header: 'Frais HT',
          value: (p) => fmtCurrency(acHT(p)),
          align: 'right',
        },
        {
          header: 'Frais TTC',
          value: (p) => fmtCurrency(acTTC(p)),
          align: 'right',
        },
        {
          header: 'Total facture',
          value: (p) => fmtCurrency(invoiceTotal(p)),
          align: 'right',
        },
      ],
      rows,
      totalsRow: {
        label: `Totaux (${rows.length} achat${rows.length > 1 ? 's' : ''})`,
        cells: [
          fmtCurrency(sumDec('subtotalHT')),
          fmtCurrency(sumDec('tpsAmount')),
          fmtCurrency(sumDec('tvqAmount')),
          fmtCurrency(sumDec('totalAmount')),
          fmtCurrency(sumAdditionalHT),
          fmtCurrency(sumAdditionalTTC),
          fmtCurrency(sumGrandTotal),
        ],
      },
    });
  }

  // -------------------------------------------------------------------
  // Inventory Periods
  // -------------------------------------------------------------------

  async inventoryPeriods(
    format: Format,
    status?: PeriodStatus,
    user?: RequestUser,
    branchId?: string,
  ): Promise<Buffer> {
    const rows = await this.periodsService.findAll(status, user, branchId);
    const filters = this.periodsFilterLabels(status);

    if (format === 'excel') {
      return buildExcel({
        sheetName: 'Périodes',
        title: 'Périodes d\'inventaire',
        appliedFilters: filters,
        columns: [
          { header: 'Mois', value: (p) => p.month, numFmt: '00', width: 8 },
          { header: 'Année', value: (p) => p.year, numFmt: '0', width: 8 },
          {
            header: 'Statut',
            value: (p) => (p.status === 'OPEN' ? 'Ouverte' : 'Clôturée'),
            width: 12,
          },
          {
            header: 'Valeur début',
            value: (p) => Number(p.openingValue ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          {
            header: 'Achats',
            value: (p) => Number(p.purchasesValue ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          {
            header: 'Valeur fin',
            value: (p) => Number(p.closingValue ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          // V4 ventilation : 3 colonnes pour Food/Paper/Cleaning, puis le
          // total Real Cost. Ordre choisi pour que l'œil lise « parts +
          // total » comme dans le rapport financier.
          {
            header: 'Food cost',
            value: (p) => Number(p.foodCost ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Paper cost',
            value: (p) => Number(p.paperCost ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Cleaning cost',
            value: (p) => Number(p.cleaningCost ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Real cost',
            value: (p) => Number(p.realCost ?? 0),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Food cost %',
            value: (p) => (p.foodCostPercentage ? Number(p.foodCostPercentage) / 100 : ''),
            numFmt: '0.00%',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Critiques',
            value: (p) => p.criticalProductsCount ?? 0,
            numFmt: '0',
            alignment: { horizontal: 'right' },
            width: 10,
          },
          {
            header: 'Date clôture',
            value: (p) => (p.closingDate ? new Date(p.closingDate) : ''),
            numFmt: 'yyyy-mm-dd',
            width: 14,
          },
        ],
        rows,
      });
    }
    return buildPdf({
      title: 'Périodes d\'inventaire',
      appliedFilters: filters,
      columns: [
        { header: 'Période', value: (p) => `${String(p.month).padStart(2, '0')}/${p.year}` },
        { header: 'Statut', value: (p) => (p.status === 'OPEN' ? 'Ouverte' : 'Clôturée'), align: 'center' },
        { header: 'Début', value: (p) => fmtCurrency(p.openingValue ?? 0), align: 'right' },
        { header: 'Achats', value: (p) => fmtCurrency(p.purchasesValue ?? 0), align: 'right' },
        { header: 'Fin', value: (p) => fmtCurrency(p.closingValue ?? 0), align: 'right' },
        // V4 ventilation : 3 colonnes Food/Paper/Cleaning + Real Cost total.
        { header: 'Food', value: (p) => fmtCurrency(p.foodCost ?? 0), align: 'right' },
        { header: 'Paper', value: (p) => fmtCurrency(p.paperCost ?? 0), align: 'right' },
        { header: 'Cleaning', value: (p) => fmtCurrency(p.cleaningCost ?? 0), align: 'right' },
        { header: 'Real', value: (p) => fmtCurrency(p.realCost ?? 0), align: 'right' },
        {
          header: 'Food %',
          value: (p) => (p.foodCostPercentage ? fmtPct(p.foodCostPercentage) : '—'),
          align: 'right',
        },
        {
          header: 'Critiques',
          value: (p) => String(p.criticalProductsCount ?? 0),
          align: 'right',
        },
      ],
      rows,
    });
  }

  // -------------------------------------------------------------------
  // Inventory Lines (per period)
  // -------------------------------------------------------------------

  async inventoryLines(
    periodId: string,
    format: Format,
    opts: { search?: string; categoryId?: string; criticalOnly?: 'true' },
  ): Promise<Buffer> {
    const period = await this.periodsService.findOne(periodId);
    let lines = await this.linesService.findByPeriod(periodId);

    if (opts.search) {
      const needle = opts.search.toLowerCase();
      lines = lines.filter((l) => l.product.name.toLowerCase().includes(needle));
    }
    if (opts.categoryId) {
      lines = lines.filter((l) => l.product.categoryId === opts.categoryId);
    }
    if (opts.criticalOnly === 'true') {
      lines = lines.filter((l) => l.isCritical);
    }

    const monthLabel = `${String(period.month).padStart(2, '0')}/${period.year}`;
    const filters: string[] = [`Période : ${monthLabel} · ${period.status === 'OPEN' ? 'Ouverte' : 'Clôturée'}`];
    if (opts.search) filters.push(`Recherche : "${opts.search}"`);
    if (opts.categoryId) {
      const cat = await this.categoriesService.findOne(opts.categoryId).catch(() => null);
      filters.push(`Catégorie : ${cat?.name ?? opts.categoryId}`);
    }
    if (opts.criticalOnly === 'true') filters.push('Produits critiques uniquement');

    if (format === 'excel') {
      return buildExcel({
        // Excel sheet names cannot contain "/" \ : * ? [ ]
        sheetName: `Lignes ${monthLabel.replace('/', '-')}`,
        title: `Inventaire ${monthLabel}`,
        appliedFilters: filters,
        columns: [
          { header: 'Produit', value: (l) => l.product.name, width: 30 },
          { header: 'Catégorie', value: (l) => l.product.category?.name ?? '', width: 18 },
          { header: 'Unité', value: (l) => l.product.unit, width: 8 },
          {
            header: 'Seuil min',
            value: (l) => Number(l.product.minStockLevel),
            numFmt: '#,##0.0000',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Début qté',
            value: (l) => Number(l.openingQuantity),
            numFmt: '#,##0.0000',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Début coût u.',
            value: (l) => Number(l.openingUnitCost),
            numFmt: '#,##0.0000 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Achats qté',
            value: (l) => Number(l.purchasesQuantity),
            numFmt: '#,##0.0000',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Achats valeur',
            value: (l) => Number(l.purchasesValue),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Fin qté',
            value: (l) => Number(l.closingQuantity),
            numFmt: '#,##0.0000',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Fin coût u.',
            value: (l) => Number(l.closingUnitCost),
            numFmt: '#,##0.0000 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Consommation qté',
            value: (l) => Number(l.consumptionQuantity),
            numFmt: '#,##0.0000',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'Consommation valeur',
            value: (l) => Number(l.consumptionValue),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 16,
          },
          { header: 'Critique', value: (l) => (l.isCritical ? 'Oui' : ''), width: 10 },
        ],
        rows: lines,
      });
    }
    return buildPdf({
      title: `Inventaire ${monthLabel}`,
      appliedFilters: filters,
      columns: [
        { header: 'Produit', value: (l) => l.product.name },
        { header: 'Cat.', value: (l) => l.product.category?.name ?? '—' },
        { header: 'Unité', value: (l) => l.product.unit, align: 'center' },
        { header: 'Début qté', value: (l) => fmtNumber(l.openingQuantity, 2), align: 'right' },
        { header: 'Achats', value: (l) => fmtCurrency(l.purchasesValue), align: 'right' },
        { header: 'Fin qté', value: (l) => fmtNumber(l.closingQuantity, 2), align: 'right' },
        {
          header: 'Consommation',
          value: (l) => fmtCurrency(l.consumptionValue),
          align: 'right',
        },
        { header: 'Critique', value: (l) => (l.isCritical ? '⚠' : ''), align: 'center' },
      ],
      rows: lines,
    });
  }

  /**
   * Generates a blank physical-count template Excel for a given inventory
   * period. Each active product of the period's branch is listed with its
   * category, plus two empty columns ("Cartons" and "Unités") for the
   * counter to fill by hand. NO prices, costs or stock values — this file
   * is a printable count sheet, not a financial report.
   *
   * The product list is fetched LIVE from the InventoryProduct table —
   * adding a product in the Products module makes it appear in the next
   * template, deactivating it removes it. Branch scope is taken from the
   * period (not the requesting user) so OWNER/ADMIN downloading the template
   * for any branch always gets the right list.
   *
   * Sorted by category name, then product name, so the comptage walks the
   * fridge / shelves in a stable order between months.
   */
  async inventoryCountTemplate(periodId: string): Promise<Buffer> {
    const period = await this.prisma.inventoryPeriod.findUnique({
      where: { id: periodId },
      include: { branch: { select: { name: true } } },
    });
    if (!period) {
      throw new Error('Période d\'inventaire introuvable');
    }

    const products = await this.prisma.inventoryProduct.findMany({
      where: { branchId: period.branchId, isActive: true },
      include: { category: { select: { name: true } } },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    const monthLabel = `${MONTHS_FR[period.month - 1]} ${period.year}`;
    const branchLabel = period.branch?.name ?? '—';

    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    wb.company = BRAND_NAME;
    wb.created = new Date();
    const ws = wb.addWorksheet('Comptage');

    // Layout : 5 colonnes.
    //   1. Produit
    //   2. Catégorie
    //   3. Conditionnement  → indique par produit "Carton (× 12 pièce)"
    //                          si le produit a un packaging défini. Vide sinon.
    //   4. Nb Pkg            → nb de packagings comptés (vide si unitaire).
    //   5. Nb Unités         → unités additionnelles (ou totales si unitaire).
    // Rétrocompat : les produits sans packaging remplissent Nb Unités
    // exactement comme ils remplissaient « Unités » avant. Aucun calcul
    // ni total n'est produit ici (feuille de comptage papier).
    ws.columns = [
      { width: 34 }, // Produit
      { width: 22 }, // Catégorie
      { width: 22 }, // Conditionnement
      { width: 10 }, // Nb Pkg
      { width: 12 }, // Nb Unités
    ];

    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Modèle de comptage inventaire';
    titleCell.font = { bold: true, size: 16, color: { argb: BRAND_PRIMARY_ARGB } };
    titleCell.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 26;

    ws.mergeCells('A2:E2');
    const subtitleCell = ws.getCell('A2');
    subtitleCell.value = `${branchLabel} — ${monthLabel}`;
    subtitleCell.font = { italic: true, size: 11, color: { argb: 'FF555555' } };

    ws.mergeCells('A3:E3');
    const hintCell = ws.getCell('A3');
    hintCell.value =
      'Si le produit a un conditionnement, comptez Nb Pkg + Nb Unités séparément ; sinon, remplissez uniquement Nb Unités.';
    hintCell.font = { italic: true, size: 9, color: { argb: 'FF888888' } };

    const headerRowNum = 5;
    const headers = ['Produit', 'Catégorie', 'Conditionnement', 'Nb Pkg', 'Nb Unités'];
    headers.forEach((h, idx) => {
      const cell = ws.getRow(headerRowNum).getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PRIMARY_ARGB } };
      cell.alignment = { vertical: 'middle', horizontal: idx < 2 ? 'left' : 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      };
    });
    ws.getRow(headerRowNum).height = 22;

    let row = headerRowNum + 1;
    for (const p of products) {
      const r = ws.getRow(row);
      r.getCell(1).value = p.name;
      r.getCell(2).value = p.category?.name ?? '';
      // Colonne Conditionnement : rappel imprimable de la règle de conversion
      // pour ce produit précis. Purement descriptif — n'entre dans aucun calcul.
      const factor = p.packagingFactor ? Number(p.packagingFactor) : 0;
      if (p.packagingName && factor > 0) {
        r.getCell(3).value = `${p.packagingName} (× ${factor} ${p.unit})`;
        r.getCell(3).font = { italic: true, size: 9, color: { argb: 'FF555555' } };
      } else {
        // Produit unitaire : rappel de l'unité pour éviter la confusion
        // « ai-je noté en kg ou en g ? ».
        r.getCell(3).value = p.unit;
        r.getCell(3).font = { italic: true, size: 9, color: { argb: 'FF888888' } };
      }
      // Nb Pkg et Nb Unités laissées vides — le comptage manuel les remplit.
      r.getCell(4).value = null;
      r.getCell(5).value = null;
      for (let c = 1; c <= 5; c++) {
        r.getCell(c).border = {
          bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } },
        };
      }
      r.getCell(3).alignment = { horizontal: 'left' };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(5).alignment = { horizontal: 'center' };
      row++;
    }

    ws.views = [{ state: 'frozen', ySplit: headerRowNum }];

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // -------------------------------------------------------------------
  // Accounting (monthly expenses for the accountant)
  // -------------------------------------------------------------------

  private async accountingFilterLabels(q: ListAccountingExpensesDto): Promise<string[]> {
    const labels: string[] = [];
    if (q.search) labels.push(`Recherche : "${q.search}"`);
    if (q.accountingCategoryId) {
      const cat = await this.prisma.accountingCategory
        .findUnique({
          where: { id: q.accountingCategoryId },
          select: { name: true },
        })
        .catch(() => null);
      labels.push(`Catégorie : ${cat?.name ?? q.accountingCategoryId}`);
    }
    if (q.supplierId) {
      const s = await this.suppliersService.findOne(q.supplierId).catch(() => null);
      labels.push(`Fournisseur : ${s?.name ?? q.supplierId}`);
    }
    if (q.paymentMethod) labels.push(`Mode paiement : ${ACCOUNTING_PAYMENT_LABEL[q.paymentMethod]}`);
    if (q.startDate) labels.push(`À partir du ${fmtDate(q.startDate)}`);
    if (q.endDate) labels.push(`Jusqu'au ${fmtDate(q.endDate)}`);
    if (q.minAmount !== undefined) labels.push(`Total ≥ ${fmtCurrency(q.minAmount)}`);
    if (q.maxAmount !== undefined) labels.push(`Total ≤ ${fmtCurrency(q.maxAmount)}`);
    return labels;
  }

  async accounting(format: Format, q: ListAccountingExpensesDto, user?: RequestUser): Promise<Buffer> {
    const all = await this.accountingService.findAllRaw({ ...q, page: 1, pageSize: 10_000 }, user);
    const filters = await this.accountingFilterLabels(q);
    const rows = all.data;

    const totals = rows.reduce(
      (acc, r) => ({
        ht: acc.ht + Number(r.amountBeforeTax.toString()),
        tps: acc.tps + Number(r.tpsAmount.toString()),
        tvq: acc.tvq + Number(r.tvqAmount.toString()),
        total: acc.total + Number(r.totalAmount.toString()),
      }),
      { ht: 0, tps: 0, tvq: 0, total: 0 },
    );

    if (format === 'excel') {
      return buildExcel({
        sheetName: 'Comptabilité',
        title: 'Dépenses comptables',
        appliedFilters: filters,
        columns: [
          {
            header: 'Date dépense',
            value: (r) => new Date(r.expenseDate),
            numFmt: 'yyyy-mm-dd',
            width: 14,
          },
          {
            header: 'Date transaction',
            value: (r) => (r.transactionDate ? new Date(r.transactionDate) : ''),
            numFmt: 'yyyy-mm-dd',
            width: 14,
          },
          {
            // Origin module — lets the accountant filter by source in Excel
            // (Manuel / Achat fournisseur / Main-d'œuvre / Réparation).
            header: 'Source',
            value: (r) => ACCOUNTING_SOURCE_LABEL[r.sourceType],
            width: 18,
          },
          {
            // Real category name (dynamic table). Falls back to the legacy
            // enum label if the row pre-dates the backfill — shouldn't
            // happen on a healthy DB.
            header: 'Catégorie',
            value: (r) =>
              r.accountingCategory?.name ?? ACCOUNTING_CATEGORY_LABEL[r.category],
            width: 22,
          },
          {
            header: 'Compte dans rapports',
            value: (r) => (r.includeInFinancialReports ? 'Oui' : 'Non'),
            width: 18,
          },
          {
            header: 'Fournisseur',
            value: (r) => r.supplier?.name ?? r.supplierName ?? '',
            width: 26,
          },
          { header: 'Description', value: (r) => r.description, width: 40 },
          { header: 'Référence / Facture', value: (r) => r.referenceNumber ?? '', width: 18 },
          {
            header: 'Mode paiement',
            value: (r) =>
              r.paymentMethod ? ACCOUNTING_PAYMENT_LABEL[r.paymentMethod] : '',
            width: 18,
          },
          {
            header: 'Montant HT',
            value: (r) => Number(r.amountBeforeTax.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          {
            header: 'TPS',
            value: (r) => Number(r.tpsAmount.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'TVQ',
            value: (r) => Number(r.tvqAmount.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 12,
          },
          {
            header: 'Total TTC',
            value: (r) => Number(r.totalAmount.toString()),
            numFmt: '#,##0.00 "$"',
            alignment: { horizontal: 'right' },
            width: 14,
          },
          { header: 'Notes', value: (r) => r.notes ?? '', width: 30 },
        ],
        rows,
      });
    }

    return buildPdf({
      title: 'Dépenses comptables',
      appliedFilters: filters,
      columns: [
        { header: 'Date', value: (r) => fmtDate(r.expenseDate) },
        {
          header: 'Source',
          value: (r) => ACCOUNTING_SOURCE_LABEL[r.sourceType],
          align: 'center',
        },
        {
          header: 'Catégorie',
          value: (r) =>
            r.accountingCategory?.name ?? ACCOUNTING_CATEGORY_LABEL[r.category],
        },
        {
          header: 'Fournisseur',
          value: (r) => r.supplier?.name ?? r.supplierName ?? '—',
        },
        { header: 'Description', value: (r) => r.description },
        { header: 'Réf.', value: (r) => r.referenceNumber ?? '—' },
        {
          header: 'HT',
          value: (r) => fmtCurrency(r.amountBeforeTax.toString()),
          align: 'right',
        },
        {
          header: 'TPS',
          value: (r) => fmtCurrency(r.tpsAmount.toString()),
          align: 'right',
        },
        {
          header: 'TVQ',
          value: (r) => fmtCurrency(r.tvqAmount.toString()),
          align: 'right',
        },
        {
          header: 'TTC',
          value: (r) => fmtCurrency(r.totalAmount.toString()),
          align: 'right',
        },
      ],
      rows,
      totalsRow: {
        label: `Totaux (${rows.length} dépense${rows.length > 1 ? 's' : ''})`,
        cells: [
          fmtCurrency(totals.ht),
          fmtCurrency(totals.tps),
          fmtCurrency(totals.tvq),
          fmtCurrency(totals.total),
        ],
      },
    });
  }

  // -------------------------------------------------------------------
  // Financial reports — monthly P&L per branch
  // -------------------------------------------------------------------

  async financialReport(reportId: string, format: Format, user: RequestUser): Promise<Buffer> {
    const report = await this.financialReportsService.getById(reportId, user);
    const branch = await this.prisma.branch.findUnique({
      where: { id: report.branchId },
      select: { name: true, slug: true, address: true },
    });
    const monthLabel = `${MONTHS_FR[report.month - 1]} ${report.year}`;
    const branchLabel = branch?.name ?? report.branchId.slice(0, 8);

    return format === 'excel'
      ? this.financialReportExcel(report, branchLabel, monthLabel)
      : this.financialReportPdf(report, branchLabel, monthLabel, branch?.address ?? null);
  }

  private async financialReportExcel(
    r: Awaited<ReturnType<FinancialReportsService['getById']>>,
    branchLabel: string,
    monthLabel: string,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    wb.company = BRAND_NAME;
    wb.created = new Date();

    // ----- Sheet 1: Summary -----
    const summary = wb.addWorksheet('Sommaire');
    summary.columns = [
      { width: 38 },
      { width: 22 },
      { width: 14 },
    ];
    addTitle(summary, `${branchLabel} — ${monthLabel}`, 'A1:C1');
    summary.getCell('A2').value = `Rapport financier · statut ${r.status}`;
    summary.getCell('A2').font = { italic: true, color: { argb: 'FF888888' } };

    let row = 4;
    addKpi(summary, row++, 'Revenus nets', num(r.netRevenue));
    addKpi(summary, row++, 'Dépenses totales', num(r.totalExpenses));
    addKpi(summary, row++, 'Profit brut', num(r.grossProfit));
    addKpi(summary, row++, 'Profit net', num(r.netProfit));
    addKpi(summary, row++, 'Marge nette', num(r.netMarginPercentage), '%');
    addKpi(summary, row++, 'Food cost', num(r.foodCostPercentage), '%');
    addKpi(summary, row++, 'Coût opérationnel', num(r.expenseRatio), '%');

    // ----- Sheet 2: Revenue -----
    const rev = wb.addWorksheet('Revenus');
    rev.columns = [{ width: 32 }, { width: 18 }];
    addTitle(rev, `Revenus — ${monthLabel}`, 'A1:B1');
    let r2 = 3;
    addLine(rev, r2++, 'Sales', num(r.sales));
    addLine(rev, r2++, 'Discounts', -num(r.discounts));
    addLine(rev, r2++, 'Employee meals', -num(r.employeeMeals));
    addLine(rev, r2++, 'Tips', num(r.tips));
    addLine(rev, r2++, 'Other revenue', num(r.otherRevenue));
    addTotal(rev, r2++, 'Revenu net', num(r.netRevenue));

    // ----- Sheet 3: Expenses -----
    // NOTE LOT 2 : les catégories comptables du rapport sont désormais
    // sommées HT (hors taxes). La section Comptabilité conserve HT/TPS/
    // TVQ/TTC en détail — le rapport financier ne consomme que le HT.
    const exp = wb.addWorksheet('Dépenses');
    exp.columns = [{ width: 32 }, { width: 18 }, { width: 14 }];
    addTitle(exp, `Dépenses (HT) — ${monthLabel}`, 'A1:C1');
    let r3 = 3;
    // V4 ventilation : 3 lignes Food/Paper/Cleaning sourcées Inventaire,
    // puis Main-d'œuvre. Real Cost reste implicite = somme des 3 (le
    // total dépenses en bas le réincorpore via le calcul backend).
    addLine(exp, r3++, 'Food cost (inventaire)', num(r.foodCost), 'Inventaire');
    addLine(exp, r3++, 'Paper cost (inventaire)', num(r.paperCost), 'Inventaire');
    addLine(exp, r3++, 'Cleaning cost (inventaire)', num(r.cleaningCost), 'Inventaire');
    addLine(exp, r3++, "Main-d'œuvre", num(r.laborCost), "Main d'œuvre");
    // `expensesByCategory` is keyed by the REAL category name (dynamic).
    // Skip any "Main-d'œuvre" key that may leak through from a legacy LOCKED
    // snapshot — labor is already listed on its dedicated row above.
    for (const [name, amount] of Object.entries(r.expensesByCategory)) {
      if (name.toLowerCase() === "main-d'œuvre") continue;
      addLine(exp, r3++, name, amount ?? 0, 'Comptabilité');
    }
    addTotal(exp, r3++, 'Total dépenses', num(r.totalExpenses));

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async financialReportPdf(
    r: Awaited<ReturnType<FinancialReportsService['getById']>>,
    branchLabel: string,
    monthLabel: string,
    address: string | null,
  ): Promise<Buffer> {
    // Real category name — no longer an enum, no translation needed.
    // Skip the legacy "Main-d'œuvre" key that may linger in old LOCKED
    // snapshots; labor is rendered on its dedicated row below.
    const expensesRows = Object.entries(r.expensesByCategory)
      .filter(([name]) => name.toLowerCase() !== "main-d'œuvre")
      .map(
        ([name, amount]) =>
          `<tr><td>${escapeHtml(name)}</td><td class="src">Comptabilité</td><td class="num">${fmtCurrency(amount ?? 0)}</td></tr>`,
      )
      .join('');

    const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #111; font-size: 11px; }
  h1 { color: ${BRAND_PRIMARY_COLOR}; margin: 0 0 4px; font-size: 22px; }
  .sub { color: #666; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
  .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
  .kpi .lbl { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
  .kpi .val { font-size: 16px; font-weight: 700; margin-top: 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid ${BRAND_PRIMARY_COLOR}; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: ${BRAND_PRIMARY_COLOR}; color: #fff; text-align: left; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .src { color: #888; font-size: 10px; }
  .total td { font-weight: 700; border-top: 2px solid #111; border-bottom: none; padding-top: 6px; }
  footer { margin-top: 20px; color: #888; font-size: 9px; }
</style>
</head><body>
  <h1>${escapeHtml(branchLabel)}</h1>
  <div class="sub">Rapport financier — ${escapeHtml(monthLabel)}${address ? ` · ${escapeHtml(address)}` : ''} · statut ${r.status}</div>

  <div class="grid">
    <div class="kpi"><div class="lbl">Revenus nets</div><div class="val">${fmtCurrency(r.netRevenue)}</div></div>
    <div class="kpi"><div class="lbl">Dépenses totales</div><div class="val">${fmtCurrency(r.totalExpenses)}</div></div>
    <div class="kpi"><div class="lbl">Profit net</div><div class="val">${fmtCurrency(r.netProfit)}</div></div>
    <div class="kpi"><div class="lbl">Marge nette</div><div class="val">${r.netMarginPercentage ? fmtPct(num(r.netMarginPercentage)) : '—'}</div></div>
    <div class="kpi"><div class="lbl">Food cost %</div><div class="val">${r.foodCostPercentage ? fmtPct(num(r.foodCostPercentage)) : '—'}</div></div>
    <div class="kpi"><div class="lbl">Coût opérationnel</div><div class="val">${r.expenseRatio ? fmtPct(num(r.expenseRatio)) : '—'}</div></div>
  </div>

  <h2>Revenus</h2>
  <table>
    <tr><td>Sales</td><td class="num">${fmtCurrency(r.sales)}</td></tr>
    <tr><td>Discounts</td><td class="num">−${fmtCurrency(r.discounts)}</td></tr>
    <tr><td>Employee meals</td><td class="num">−${fmtCurrency(r.employeeMeals)}</td></tr>
    <tr><td>Tips</td><td class="num">${fmtCurrency(r.tips)}</td></tr>
    <tr><td>Other revenue</td><td class="num">${fmtCurrency(r.otherRevenue)}</td></tr>
    <tr class="total"><td>Revenu net</td><td class="num">${fmtCurrency(r.netRevenue)}</td></tr>
  </table>

  <h2>Dépenses (HT)</h2>
  <p class="src" style="margin: 0 0 8px 0;">Les dépenses comptables sont présentées hors taxes. TPS et TVQ restent visibles dans la section Comptabilité.</p>
  <table>
    <tr><th>Catégorie</th><th>Source</th><th class="num">Montant (HT)</th></tr>
    <tr><td>Food cost</td><td class="src">Inventaire</td><td class="num">${fmtCurrency(r.foodCost)}</td></tr>
    <tr><td>Paper cost</td><td class="src">Inventaire</td><td class="num">${fmtCurrency(r.paperCost)}</td></tr>
    <tr><td>Cleaning cost</td><td class="src">Inventaire</td><td class="num">${fmtCurrency(r.cleaningCost)}</td></tr>
    <tr><td>Main-d'œuvre</td><td class="src">Main d'œuvre</td><td class="num">${fmtCurrency(r.laborCost)}</td></tr>
    ${expensesRows}
    <tr class="total"><td colspan="2">Total dépenses</td><td class="num">${fmtCurrency(r.totalExpenses)}</td></tr>
  </table>

  ${r.notes ? `<h2>Notes</h2><div>${escapeHtml(r.notes)}</div>` : ''}

  <footer>${exportFooter(fmtDate(new Date()))}</footer>
</body></html>`;
    return renderPdfFromHtml(html);
  }
}

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

function num(v: string | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function addTitle(ws: ExcelJS.Worksheet, text: string, mergeRange: string) {
  ws.mergeCells(mergeRange);
  const c = ws.getCell(mergeRange.split(':')[0]!);
  c.value = text;
  c.font = { bold: true, size: 14, color: { argb: BRAND_PRIMARY_ARGB } };
}

function addKpi(ws: ExcelJS.Worksheet, row: number, label: string, value: number, suffix = '$') {
  ws.getCell(`A${row}`).value = label;
  ws.getCell(`A${row}`).font = { color: { argb: 'FF555555' } };
  const valCell = ws.getCell(`B${row}`);
  valCell.value = value;
  valCell.numFmt = suffix === '%' ? '#,##0.00 "%"' : '#,##0.00 "$"';
  valCell.font = { bold: true };
}

function addLine(ws: ExcelJS.Worksheet, row: number, label: string, value: number, source?: string) {
  ws.getCell(`A${row}`).value = label;
  const valCell = ws.getCell(`B${row}`);
  valCell.value = value;
  valCell.numFmt = '#,##0.00 "$"';
  if (source) {
    ws.getCell(`C${row}`).value = source;
    ws.getCell(`C${row}`).font = { size: 10, color: { argb: 'FF888888' } };
  }
}

function addTotal(ws: ExcelJS.Worksheet, row: number, label: string, value: number) {
  ws.getCell(`A${row}`).value = label;
  ws.getCell(`A${row}`).font = { bold: true };
  const valCell = ws.getCell(`B${row}`);
  valCell.value = value;
  valCell.numFmt = '#,##0.00 "$"';
  valCell.font = { bold: true };
  valCell.border = { top: { style: 'medium' } };
}

const ACCOUNTING_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  ELECTRICITE: 'Électricité',
  LOYER: 'Loyer',
  INTERNET_TELEPHONE: 'Internet / Téléphone',
  ACHATS_FOURNISSEURS: 'Achats fournisseurs',
  EMBALLAGES: 'Emballages',
  NETTOYAGE: 'Nettoyage',
  MAINTENANCE: 'Maintenance',
  MARKETING: 'Marketing',
  FRAIS_BANCAIRES: 'Frais bancaires',
  PLATEFORMES_LIVRAISON: 'Plateformes livraison',
  MAIN_DOEUVRE: 'Main-d\'œuvre',
  AUTRES: 'Autres',
};

const ACCOUNTING_PAYMENT_LABEL: Record<PaymentMethod, string> = {
  VIREMENT: 'Virement bancaire',
  CARTE: 'Carte bancaire',
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  PRELEVEMENT: 'Prélèvement',
  AUTRE: 'Autre',
};
