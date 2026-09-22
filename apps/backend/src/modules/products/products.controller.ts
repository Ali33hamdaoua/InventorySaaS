import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { canAccessAllBranches, Permission } from '@inventorymdb/shared';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { SetProductStatusDto } from './dto/set-status.dto';
import { ProductImportConfirmDto } from './dto/import-products.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { resolveBranchForMutation } from '../../common/helpers/branch-scope.helper';

/** Minimal uploaded-file shape so we don't depend on `@types/multer`. */
interface UploadedExcelFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB
const ACCEPTED_EXTENSIONS = ['.xlsx'];
const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers send this for .xlsx
];

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly importService: ProductsImportService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Liste paginée avec filtres (search, categoryId, supplierId, unit, isActive, criticalOnly, branchId) et tri (sortBy, sortOrder)',
  })
  findAll(@Query() q: ListProductsDto, @CurrentUser() user: RequestUser) {
    return this.service.findAll(q, user);
  }

  // -------------------- Import --------------------

  @Get('template/excel')
  @ApiOperation({ summary: 'Télécharge le template Excel d\'import des produits' })
  @Audit({ action: 'EXPORT', entity: 'InventoryProduct' })
  async template(@Res() res: Response) {
    const buf = await this.importService.buildTemplate();
    res
      .set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="template-import-produits.xlsx"',
        'Cache-Control': 'no-store',
      })
      .send(buf);
  }

  @RequirePermission(Permission.MANAGE_PRODUCTS)
  @Post('import/preview')
  @ApiOperation({
    summary:
      'Analyse un fichier Excel et retourne la prévisualisation (lignes valides/warnings/erreurs)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async importPreview(@UploadedFile() file: UploadedExcelFile | undefined) {
    if (!file) throw new BadRequestException('Aucun fichier reçu (champ "file").');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Fichier trop volumineux (max 4 Mo).');
    }
    const name = file.originalname.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      throw new BadRequestException('Format invalide : fichier .xlsx requis.');
    }
    if (file.mimetype && !ACCEPTED_MIME.includes(file.mimetype)) {
      // Soft check — extension already validated. Just log via 400 if obviously wrong.
      // We accept the file if extension matched.
    }
    return this.importService.preview(file.buffer);
  }

  @RequirePermission(Permission.MANAGE_PRODUCTS)
  @Post('import/confirm')
  @ApiOperation({
    summary:
      'Persiste les lignes validées (revalidation backend obligatoire avant insertion). branchId requis pour ADMIN/OWNER (cross-branch).',
  })
  @Audit({ action: 'CREATE', entity: 'InventoryProduct' })
  importConfirm(@Body() dto: ProductImportConfirmDto, @CurrentUser() user: RequestUser) {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    return this.importService.confirm(dto.rows, branchId);
  }

  // -------------------- CRUD --------------------

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @RequirePermission(Permission.MANAGE_PRODUCTS)
  @Post()
  @Audit({ action: 'CREATE', entity: 'InventoryProduct' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @RequirePermission(Permission.MANAGE_PRODUCTS)
  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'InventoryProduct' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  /**
   * Soft toggle for product status. Tracks UPDATE audit (the AuditAction
   * enum has no PRODUCT_ENABLED/DISABLED — re-using UPDATE keeps the
   * existing migration intact while still recording who flipped the flag).
   */
  @RequirePermission(Permission.MANAGE_PRODUCTS)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Active ou désactive un produit (soft, jamais de suppression physique)' })
  @Audit({ action: 'UPDATE', entity: 'InventoryProduct' })
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetProductStatusDto) {
    return this.service.setStatus(id, dto.isActive);
  }

  /** Soft-delete (sets isActive=false). Kept for backwards-compat with previous frontend. */
  @RequirePermission(Permission.MANAGE_PRODUCTS)
  @Delete(':id')
  @Audit({ action: 'DELETE', entity: 'InventoryProduct' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  /**
   * Compteurs de références historiques + verdict `canHardDelete`.
   * Utilisé par l'UI pour désactiver le bouton « Supprimer définitivement »
   * lorsque la suppression physique n'est pas autorisée.
   */
  @Get(':id/references')
  @ApiOperation({
    summary:
      'Compte les références PurchaseItem + InventoryLine d\'un produit et indique si la suppression physique est autorisée.',
  })
  getReferences(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.countReferences(id);
  }

  /**
   * Suppression PHYSIQUE contrôlée. Réservée aux OWNER / ADMIN. Refusée
   * (409) si le produit est actif OU s'il a la moindre référence
   * historique (PurchaseItem ou InventoryLine). Distincte du DELETE
   * standard qui reste un soft-delete pour rétrocompat.
   */
  @RequirePermission(Permission.MANAGE_PRODUCTS)
  @Delete(':id/hard')
  @ApiOperation({
    summary:
      'Supprime physiquement un produit inactif SANS aucune référence historique. OWNER/ADMIN uniquement.',
  })
  @Audit({ action: 'DELETE', entity: 'InventoryProduct' })
  hardRemove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    // Double garde : MANAGE_PRODUCTS ouvre le soft-delete, mais la
    // suppression physique reste réservée aux rôles cross-branch
    // (OWNER / ADMIN) — action irréversible.
    if (!canAccessAllBranches(user.role)) {
      throw new ForbiddenException(
        'Seuls OWNER et ADMIN peuvent supprimer définitivement un produit.',
      );
    }
    return this.service.hardRemove(id);
  }
}
