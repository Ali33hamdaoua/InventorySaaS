import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type {
  ProductImportConfirmResponse,
  ProductImportInactiveAction,
  ProductImportPreviewResponse,
  ProductImportRow,
  ProductImportRowIssue,
  ProductImportStatus,
  ProductImportSummary,
} from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BRAND_NAME, APP_NAME, BRAND_PRIMARY_ARGB } from '../../common/config/brand';

const ALLOWED_UNITS = ['kg', 'g', 'L', 'ml', 'unit', 'box', 'pack', 'bag'] as const;

/** Order matters: first column = row[0]. */
const TEMPLATE_COLUMNS = [
  { key: 'name', header: 'name', width: 32, example: 'Boulette boeuf 80g' },
  { key: 'category', header: 'category', width: 22, example: 'Viandes' },
  { key: 'supplier', header: 'supplier', width: 26, example: 'Viandes Québec Inc.' },
  { key: 'unit', header: 'unit', width: 8, example: 'kg' },
  { key: 'defaultCost', header: 'defaultCost', width: 14, example: 12.5 },
  { key: 'minStockLevel', header: 'minStockLevel', width: 14, example: 20 },
  { key: 'isActive', header: 'isActive', width: 10, example: 'true' },
] as const;

@Injectable()
export class ProductsImportService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // 1. Template generation
  // -------------------------------------------------------------------

  async buildTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    wb.company = BRAND_NAME;
    wb.created = new Date();

    // ----------- Sheet 1: Instructions
    const inst = wb.addWorksheet('Instructions');
    inst.columns = [{ width: 4 }, { width: 22 }, { width: 90 }];
    inst.mergeCells('B1:C1');
    const title = inst.getCell('B1');
    title.value = 'Template d\'import — Produits d\'inventaire';
    title.font = { bold: true, size: 16, color: { argb: BRAND_PRIMARY_ARGB } };

    inst.mergeCells('B2:C2');
    inst.getCell('B2').value = `${BRAND_NAME} — ${APP_NAME}`;
    inst.getCell('B2').font = { italic: true, color: { argb: 'FF888888' } };

    const rules: Array<[string, string]> = [
      ['Feuille à remplir', 'Produits — saisissez une ligne par produit.'],
      ['Colonnes obligatoires', 'name, category, unit, defaultCost'],
      ['Colonnes optionnelles', 'supplier (recommandé), minStockLevel (défaut 0), isActive (défaut true)'],
      ['Doublons par nom', "Si un produit avec le même nom (insensible à la casse) existe déjà dans la succursale, il sera mis à jour. Sinon, il est créé."],
      ['Catégorie / Fournisseur', 'Doivent correspondre EXACTEMENT à un nom existant (ex : "Viandes", "Viandes Québec Inc.").'],
      ['Unités acceptées', ALLOWED_UNITS.join(', ')],
      ['isActive', 'true / false / oui / non / 1 / 0 (insensible à la casse). Défaut : true.'],
      ['Lignes en erreur', 'Les lignes en erreur ne seront PAS importées. Corrigez et recommencez.'],
    ];
    let r = 4;
    for (const [k, v] of rules) {
      const cell1 = inst.getCell(`B${r}`);
      const cell2 = inst.getCell(`C${r}`);
      cell1.value = k;
      cell1.font = { bold: true, color: { argb: BRAND_PRIMARY_ARGB } };
      cell1.alignment = { vertical: 'top' };
      cell2.value = v;
      cell2.alignment = { wrapText: true, vertical: 'top' };
      r += 1;
    }

    // ----------- Sheet 2: Produits (the one users edit)
    const ws = wb.addWorksheet('Produits');
    const headerRow = ws.getRow(1);
    TEMPLATE_COLUMNS.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PRIMARY_ARGB } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      ws.getColumn(idx + 1).width = c.width;
    });
    headerRow.commit();
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Example row
    const example = ws.getRow(2);
    TEMPLATE_COLUMNS.forEach((c, idx) => {
      example.getCell(idx + 1).value = c.example;
    });
    example.commit();

    // Empty rows for the user to fill in (visual cue)
    for (let i = 3; i <= 10; i++) {
      ws.getRow(i).getCell(1).value = null;
    }

    // ----------- Sheet 3: Listes (units, used for reference)
    const lists = wb.addWorksheet('Listes');
    lists.columns = [{ header: 'Unités acceptées', width: 24 }];
    lists.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' } };
    lists.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PRIMARY_ARGB } };
    ALLOWED_UNITS.forEach((u, i) => {
      lists.getCell(`A${i + 2}`).value = u;
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // -------------------------------------------------------------------
  // 2. Parse + validate (preview)
  // -------------------------------------------------------------------

  async preview(buffer: Buffer): Promise<ProductImportPreviewResponse> {
    const wb = new ExcelJS.Workbook();
    try {
      // ExcelJS in @types/exceljs typings expects a plain ArrayBuffer.
      const ab = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      await wb.xlsx.load(ab);
    } catch {
      throw new BadRequestException('Fichier illisible : assurez-vous qu\'il s\'agit bien d\'un .xlsx valide.');
    }
    // Pick the "Produits" sheet or the first non-instructions/listes sheet.
    let ws = wb.getWorksheet('Produits');
    if (!ws) {
      ws = wb.worksheets.find(
        (s) => s.name !== 'Instructions' && s.name !== 'Listes',
      );
    }
    if (!ws) throw new BadRequestException('Feuille "Produits" introuvable dans le fichier.');

    // ---- Header indices
    const headerRow = ws.getRow(1);
    const indices: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const k = String(cell.value ?? '').trim();
      if (k) indices[k] = colNumber;
    });
    const required = ['name', 'category', 'unit', 'defaultCost'];
    for (const r of required) {
      if (!indices[r]) {
        throw new BadRequestException(
          `Colonne obligatoire "${r}" manquante. Téléchargez le template à jour.`,
        );
      }
    }

    // ---- Lookups
    // Dedupe key after SKU removal: `name` lower-cased, scoped per branch
    // at confirm time. At preview time we load all products to surface
    // "will be updated" warnings — branch scope happens at confirm.
    // On charge aussi `isActive` pour classifier les collisions en
    // ACTIVE (WARNING classique) vs INACTIVE (INACTIVE_MATCH — décision requise).
    const [categories, suppliers, existingProducts] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, name: true } }),
      this.prisma.supplier.findMany({ select: { id: true, name: true } }),
      this.prisma.inventoryProduct.findMany({
        select: { id: true, name: true, isActive: true },
      }),
    ]);
    const categoriesByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
    const suppliersByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));
    const productsByName = new Map(
      existingProducts.map((p) => [
        p.name.toLowerCase(),
        { id: p.id, name: p.name, isActive: p.isActive },
      ]),
    );

    // ---- Scan data rows
    const rows: ProductImportRow[] = [];
    const nameSeenInFile = new Map<string, number>(); // lower-cased name → first row

    // `actualRowCount` is unreliable after add/splice — use rowCount which
    // covers the highest cell-bearing row.
    const lastRow = Math.max(ws.rowCount, ws.actualRowCount);
    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
      const row = ws.getRow(rowNumber);
      const raw = {
        name: cellString(row, indices.name),
        category: cellString(row, indices.category),
        supplier: indices.supplier ? cellString(row, indices.supplier) : '',
        unit: cellString(row, indices.unit),
        defaultCost: cellRaw(row, indices.defaultCost),
        minStockLevel: indices.minStockLevel ? cellRaw(row, indices.minStockLevel) : '',
        isActive: indices.isActive ? cellRaw(row, indices.isActive) : 'true',
      };

      // Skip fully empty rows quietly.
      if (
        !raw.name &&
        !raw.category &&
        !raw.supplier &&
        !raw.unit &&
        (raw.defaultCost === '' || raw.defaultCost == null) &&
        (raw.minStockLevel === '' || raw.minStockLevel == null)
      ) {
        continue;
      }

      const errors: ProductImportRowIssue[] = [];
      const warnings: ProductImportRowIssue[] = [];

      // Required
      if (!raw.name) errors.push({ field: 'name', message: 'Nom requis.' });
      if (!raw.category) errors.push({ field: 'category', message: 'Catégorie requise.' });
      if (!raw.unit) errors.push({ field: 'unit', message: 'Unité requise.' });

      // Unit allowed
      if (raw.unit && !ALLOWED_UNITS.includes(raw.unit as (typeof ALLOWED_UNITS)[number])) {
        errors.push({
          field: 'unit',
          message: `Unité invalide ("${raw.unit}"). Valeurs acceptées : ${ALLOWED_UNITS.join(', ')}.`,
        });
      }

      // Numbers
      const defaultCost = toNum(raw.defaultCost);
      if (raw.defaultCost === '' || raw.defaultCost == null) {
        errors.push({ field: 'defaultCost', message: 'Coût par défaut requis.' });
      } else if (defaultCost == null || defaultCost < 0) {
        errors.push({
          field: 'defaultCost',
          message: 'Coût par défaut invalide (doit être un nombre ≥ 0).',
        });
      }
      const minStockLevel =
        raw.minStockLevel === '' || raw.minStockLevel == null ? 0 : toNum(raw.minStockLevel);
      if (minStockLevel == null || minStockLevel < 0) {
        errors.push({
          field: 'minStockLevel',
          message: 'Seuil minimum invalide (doit être un nombre ≥ 0).',
        });
      }

      // Boolean parse
      const isActive = parseBool(raw.isActive);
      if (isActive == null) {
        warnings.push({
          field: 'isActive',
          message: `Valeur "${raw.isActive}" non reconnue, "true" appliqué.`,
        });
      }

      // Lookups
      let matchedCategoryId: string | null = null;
      if (raw.category) {
        matchedCategoryId = categoriesByName.get(raw.category.toLowerCase()) ?? null;
        if (!matchedCategoryId) {
          errors.push({
            field: 'category',
            message: `Catégorie "${raw.category}" introuvable. Créez-la d'abord ou corrigez l'orthographe.`,
          });
        }
      }
      let matchedSupplierId: string | null = null;
      if (raw.supplier) {
        matchedSupplierId = suppliersByName.get(raw.supplier.toLowerCase()) ?? null;
        if (!matchedSupplierId) {
          errors.push({
            field: 'supplier',
            message: `Fournisseur "${raw.supplier}" introuvable. Créez-le d'abord ou corrigez l'orthographe.`,
          });
        }
      }

      // Name duplicates within the file (the new dedupe key)
      if (raw.name) {
        const nameLower = raw.name.toLowerCase();
        const firstSeen = nameSeenInFile.get(nameLower);
        if (firstSeen) {
          errors.push({
            field: 'name',
            message: `Nom "${raw.name}" déjà présent à la ligne ${firstSeen} du fichier.`,
          });
        } else {
          nameSeenInFile.set(nameLower, rowNumber);
        }
      }

      // Name exists in DB → différencier ACTIVE (warning simple, path
      // update) vs INACTIVE (status dédié INACTIVE_MATCH → décision requise
      // au moment du confirm, aucune réactivation silencieuse).
      const match = raw.name ? productsByName.get(raw.name.toLowerCase()) ?? null : null;
      const existingProductId = match?.id ?? null;
      let inactiveMatch: ProductImportRow['inactiveMatch'] | undefined;

      if (match && match.isActive) {
        warnings.push({
          field: 'name',
          message: 'Produit existant (même nom) : sera mis à jour.',
        });
      } else if (match && !match.isActive) {
        // Ne pas ajouter d'erreur — on veut afficher la ligne dans la preview
        // avec un statut spécial + action utilisateur explicite.
        inactiveMatch = {
          productId: match.id,
          productName: match.name,
          warning:
            'Un produit inactif portant ce nom existe déjà. Aucune action par défaut — choisissez « Ignorer » ou « Réactiver et mettre à jour ».',
          availableActions: ['IGNORE', 'REACTIVATE_AND_UPDATE'],
        };
      }

      // Détermination du statut. INACTIVE_MATCH prime sur WARNING pour
      // forcer l'utilisateur à faire un choix explicite.
      let status: ProductImportStatus;
      if (errors.length) {
        status = 'ERROR';
      } else if (inactiveMatch) {
        status = 'INACTIVE_MATCH';
      } else if (warnings.length) {
        status = 'WARNING';
      } else {
        status = 'VALID';
      }

      rows.push({
        rowNumber,
        data: {
          name: raw.name,
          category: raw.category,
          supplier: raw.supplier,
          unit: raw.unit,
          defaultCost: defaultCost ?? 0,
          minStockLevel: minStockLevel ?? 0,
          isActive: isActive ?? true,
        },
        status,
        errors,
        warnings,
        matchedCategoryId,
        matchedSupplierId,
        existingProductId,
        ...(inactiveMatch ? { inactiveMatch } : {}),
      });
    }

    return { rows, summary: this.computeSummary(rows) };
  }

  private computeSummary(rows: ProductImportRow[]): ProductImportSummary {
    const validRows = rows.filter((r) => r.status === 'VALID').length;
    const warningRows = rows.filter((r) => r.status === 'WARNING').length;
    const errorRows = rows.filter((r) => r.status === 'ERROR').length;
    const inactiveMatchRows = rows.filter((r) => r.status === 'INACTIVE_MATCH').length;

    // Estimation pre-confirm : VALID + WARNING → import direct ;
    // INACTIVE_MATCH → attendu ignoré (défaut) sauf décision explicite.
    const directImport = rows.filter(
      (r) => r.status === 'VALID' || r.status === 'WARNING',
    );
    const updateCount = directImport.filter((r) => r.existingProductId).length;
    const createCount = directImport.length - updateCount;

    // Prévisions basées sur `inactiveAction` si déjà rempli (ex : summary
    // post-confirm côté client).
    const inactiveRowsList = rows.filter((r) => r.status === 'INACTIVE_MATCH');
    const reactivatedCount = inactiveRowsList.filter(
      (r) => r.inactiveAction === 'REACTIVATE_AND_UPDATE',
    ).length;
    const ignoredCount = inactiveRowsList.length - reactivatedCount;

    return {
      totalRows: rows.length,
      validRows,
      warningRows,
      errorRows,
      inactiveMatchRows,
      createCount,
      updateCount,
      ignoredCount,
      reactivatedCount,
    };
  }

  // -------------------------------------------------------------------
  // 3. Confirm (persist)
  // -------------------------------------------------------------------

  async confirm(rows: ProductImportRow[], branchId: string): Promise<ProductImportConfirmResponse> {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('Aucune ligne à importer.');
    }

    // Re-validate against the live DB — never trust the client payload.
    // On charge `isActive` pour reclasser les collisions et pour appliquer
    // la règle « aucune réactivation sans décision explicite ».
    const names = rows.map((r) => r.data.name).filter(Boolean);
    const [categories, suppliers, existingProducts] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, name: true } }),
      this.prisma.supplier.findMany({ select: { id: true, name: true } }),
      this.prisma.inventoryProduct.findMany({
        where: { branchId, name: { in: names, mode: 'insensitive' } },
        select: { id: true, name: true, isActive: true },
      }),
    ]);
    const categoriesByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
    const suppliersByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));
    const productsByName = new Map(
      existingProducts.map((p) => [
        p.name.toLowerCase(),
        { id: p.id, name: p.name, isActive: p.isActive },
      ]),
    );

    let createCount = 0;
    let updateCount = 0;
    let ignoredCount = 0;
    let reactivatedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        if (r.status === 'ERROR') continue;

        // Re-resolve FKs to defend against stale frontend payload.
        const categoryId =
          categoriesByName.get(r.data.category.toLowerCase()) ?? null;
        if (!categoryId) continue; // category disappeared since preview → skip
        const supplierId = r.data.supplier
          ? suppliersByName.get(r.data.supplier.toLowerCase()) ?? null
          : null;
        if (r.data.supplier && !supplierId) continue;

        const existing = productsByName.get(r.data.name.toLowerCase()) ?? null;

        // -------- Aiguillage selon le statut de la collision --------

        // Cas A : pas de collision → CREATE (produit tel que fourni).
        if (!existing) {
          await tx.inventoryProduct.create({
            data: {
              name: r.data.name,
              unit: r.data.unit,
              categoryId,
              supplierId,
              defaultCost: new Prisma.Decimal(r.data.defaultCost),
              minStockLevel: new Prisma.Decimal(r.data.minStockLevel),
              isActive: r.data.isActive,
              branchId,
            },
          });
          createCount += 1;
          continue;
        }

        // Cas B : collision avec produit ACTIF → UPDATE classique. Aucune
        // décision requise. On respecte le flag isActive fourni par la
        // ligne (le cas standard : reste true).
        if (existing.isActive) {
          await tx.inventoryProduct.update({
            where: { id: existing.id },
            data: {
              name: r.data.name,
              unit: r.data.unit,
              categoryId,
              supplierId,
              defaultCost: new Prisma.Decimal(r.data.defaultCost),
              minStockLevel: new Prisma.Decimal(r.data.minStockLevel),
              isActive: r.data.isActive,
            },
          });
          updateCount += 1;
          continue;
        }

        // Cas C : collision avec produit INACTIF → décision explicite requise.
        // Par défaut (`IGNORE` ou action absente) : rien n'est fait,
        // aucune réactivation. `REACTIVATE_AND_UPDATE` : on met à jour
        // les champs autorisés ET on force `isActive = true`.
        const decision: ProductImportInactiveAction = r.inactiveAction ?? 'IGNORE';
        if (decision === 'REACTIVATE_AND_UPDATE') {
          await tx.inventoryProduct.update({
            where: { id: existing.id },
            data: {
              name: r.data.name,
              unit: r.data.unit,
              categoryId,
              supplierId,
              defaultCost: new Prisma.Decimal(r.data.defaultCost),
              minStockLevel: new Prisma.Decimal(r.data.minStockLevel),
              // Réactivation explicite : on force true, quel que soit ce
              // que la ligne Excel indique.
              isActive: true,
            },
          });
          reactivatedCount += 1;
        } else {
          // IGNORE : on ne touche à rien.
          ignoredCount += 1;
        }
      }
    });

    // Summary post-run : on prend `computeSummary` puis on écrase les
    // compteurs par ceux réellement atteints en base.
    const summary = this.computeSummary(rows);
    return {
      summary: {
        ...summary,
        createCount,
        updateCount,
        ignoredCount,
        reactivatedCount,
      },
      importedCount: createCount + updateCount + reactivatedCount,
    };
  }
}

// ---------------------------------------------------------------------
// Cell parsing helpers
// ---------------------------------------------------------------------

function cellString(row: ExcelJS.Row, col: number | undefined): string {
  if (!col) return '';
  const v = row.getCell(col).value;
  return v == null ? '' : String(typeof v === 'object' && 'text' in v ? v.text : v).trim();
}

function cellRaw(row: ExcelJS.Row, col: number | undefined): string | number {
  if (!col) return '';
  const v = row.getCell(col).value;
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object' && v !== null && 'text' in (v as unknown as Record<string, unknown>)) {
    return String((v as unknown as { text: string }).text);
  }
  return String(v);
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(',', '.').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseBool(v: string | number | null | undefined): boolean | null {
  if (v == null || v === '') return true; // empty defaults to true
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'oui', 'yes', 'y', 'o'].includes(s)) return true;
  if (['false', '0', 'non', 'no', 'n'].includes(s)) return false;
  return null;
}
