import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class PurchaseItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUuidLoose()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ description: 'Prix unitaire (HT). Auto-rempli depuis product.defaultCost côté UI mais re-validé serveur.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice!: number;
}

/** Frais supplémentaire d'approvisionnement (essence/livraison/péage/...).
 *  Ne modifie AUCUN prix produit — synchronisé séparément en dépense
 *  comptable et inclus HT dans le rapport financier. */
export class PurchaseAdditionalCostInputDto {
  @ApiProperty({
    description:
      'Preset code (ESSENCE/LIVRAISON/PEAGE/TRANSPORT/MANUTENTION/CHAINE_DU_FROID/DOUANE/AUTRE). Libre côté DB.',
    example: 'ESSENCE',
  })
  @IsString()
  @MaxLength(40)
  costType!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ format: 'uuid', description: 'Catégorie comptable à laquelle ce frais sera rattaché.' })
  @IsUuidLoose()
  accountingCategoryId!: string;

  @ApiProperty({ description: 'Montant hors taxes.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountBeforeTax!: number;

}

export class CreatePurchaseDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Branche cible (auto-rempli pour MANAGER, requis pour ADMIN/OWNER)',
  })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUuidLoose()
  supplierId!: string;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  purchaseDate!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];

  /** Frais supplémentaires optionnels (essence/livraison/péage/...).
   *  Chaque frais est comptabilisé séparément en dépense HT dans le
   *  rapport financier. N'affecte AUCUN prix produit ni WAC (règle V1). */
  @ApiPropertyOptional({
    type: [PurchaseAdditionalCostInputDto],
    description:
      "Frais supplémentaires liés à la facture. Vide par défaut. N'affectent pas le prix des produits.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseAdditionalCostInputDto)
  additionalCosts?: PurchaseAdditionalCostInputDto[];
}
