import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Create an expense. V2 manual-tax workflow: the client now sends HT, TPS
 * AND TVQ explicitly — the backend just sums them (total = HT + TPS + TVQ).
 * Rates are no longer enforced server-side; the UI pre-fills 5 % / 9.975 %
 * as a convenience but the user can override.
 */
export class CreateAccountingExpenseDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Branche cible (auto-rempli pour MANAGER, requis pour ADMIN/OWNER)',
  })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiProperty({ format: 'date', description: 'Date comptable (yyyy-mm-dd)' })
  @Type(() => Date)
  @IsDate()
  expenseDate!: Date;

  /**
   * Kept on the DTO for backwards compat (some integrations may still send
   * it). The new UI never populates it — see AccountingExpenseFormDialog,
   * the field was removed per client request.
   */
  @ApiPropertyOptional({ format: 'date', description: 'Date réelle du mouvement bancaire (déprécié)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transactionDate?: Date | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  supplierId?: string | null;

  @ApiPropertyOptional({ description: 'Nom fournisseur libre (utilisé si pas de supplierId)' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(150)
  supplierName?: string | null;

  /**
   * Free-form category name. The backend looks it up in `accounting_categories`
   * (case-insensitive, trim) and creates a new row if no match exists. The
   * legacy enum column on the DB still gets populated (default `AUTRES`) so
   * rollback stays clean — only the dynamic `accountingCategoryId` is what
   * the new UI cares about.
   */
  @ApiProperty({ description: "Nom libre de la catégorie. Créée à la volée si inexistante." })
  @IsString()
  @Transform(trim)
  @MaxLength(120)
  categoryName!: string;

  @ApiProperty()
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({ description: 'Numéro de facture ou référence comptable' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(80)
  referenceNumber?: string | null;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;

  @ApiProperty({ description: 'Montant hors taxes (saisi par l\'utilisateur)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountBeforeTax!: number;

  @ApiProperty({
    description:
      "TPS saisie par l'utilisateur (manuel). L'UI pré-remplit 5 % du HT mais l'utilisateur peut modifier.",
    default: 0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tpsAmount!: number;

  @ApiProperty({
    description:
      "TVQ saisie par l'utilisateur (manuel). L'UI pré-remplit 9.975 % du HT mais l'utilisateur peut modifier.",
    default: 0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tvqAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(1000)
  notes?: string | null;

  /**
   * Opt-in flag for the financial report aggregation. Default is FALSE per
   * client requirement — accountants tag each expense explicitly. Repairs
   * default to TRUE in their sync helper; purchases default to FALSE (they
   * never enter the financial report's expense bucket because food cost
   * already covers them via the inventory pipeline).
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeInFinancialReports?: boolean;
}
