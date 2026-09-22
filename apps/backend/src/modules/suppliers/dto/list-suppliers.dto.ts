import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class ListSuppliersDto {
  @ApiPropertyOptional({ description: 'Recherche par nom, email ou téléphone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'true | false' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @ApiPropertyOptional({
    description: 'true → ajoute purchasesCount, totalPurchasedAmount, lastPurchaseDate',
    default: 'false',
  })
  @IsOptional()
  @IsBooleanString()
  includeStats?: string;
}
