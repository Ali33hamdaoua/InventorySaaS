import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class CreateProductDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Branch (auto-filled for MANAGER, required for ADMIN/OWNER)',
  })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(20)
  unit!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  supplierId?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  defaultCost!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minStockLevel?: number;

  /**
   * Packaging OPTIONNEL — vue utilisateur pour saisir plus vite en mode
   * (X packagings + Y unités). Backend stocke toujours en unité de base ;
   * la conversion se fait exclusivement côté frontend via le helper
   * `packages/shared/src/lib/packaging.ts`.
   *
   * Règle : les 2 champs vont ensemble (validation service). NULL = produit
   * unitaire — comportement historique inchangé. Aucune règle métier
   * (WAC, food cost, real cost, dashboard, exports) n'est affectée par
   * ces champs — ils sont purement descriptifs.
   */
  @ApiPropertyOptional({
    description: 'Nom du conditionnement (Carton / Box / Pack…). Optionnel.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  packagingName?: string | null;

  @ApiPropertyOptional({
    description: 'Nombre d\'unités de base par packaging. Strictement > 0.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  packagingFactor?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Cross-branch mirror toggle. When `true`, after the product is created in
   * the active branch, the service also tries to create a sibling row in the
   * other branch (currently 2-branch deployments only: Joliette / Bishop).
   *
   * Behaviour:
   *  - Looks for the OTHER active branch — there must be exactly one, else
   *    the copy is silently skipped and the response reports `status: 'no_other_branch'`.
   *  - Duplicate guard by `(branchId, name)` — if a product with the same name
   *    already exists in the other branch, no row is created and the response
   *    reports `status: 'alreadyExisted'` so the UI can show a meaningful toast.
   *  - Category and supplier are GLOBAL (no branchId) in the current schema,
   *    so they're reused as-is — no copy needed.
   *  - Only privileged roles (OWNER / ADMIN) may copy cross-branch. MANAGER
   *    receives 403 if they request `copyToOtherBranch=true`.
   */
  @ApiPropertyOptional({
    default: false,
    description:
      'Also create the product in the other active branch (OWNER/ADMIN only).',
  })
  @IsOptional()
  @IsBoolean()
  copyToOtherBranch?: boolean;

  /**
   * When `copyToOtherBranch=true` AND the target branch already has an
   * INACTIVE product with the same (case-insensitive) name, this flag makes
   * the service **update + reactivate** that twin instead of returning
   * `inactive_match` and leaving it untouched. Requires an EXPLICIT retry
   * from the UI — no silent reactivation on the initial call.
   */
  @ApiPropertyOptional({
    default: false,
    description:
      'When cross-branch copy meets an INACTIVE twin, reactivate + update it explicitly. No silent reactivation.',
  })
  @IsOptional()
  @IsBoolean()
  reactivateInactiveTwin?: boolean;
}
