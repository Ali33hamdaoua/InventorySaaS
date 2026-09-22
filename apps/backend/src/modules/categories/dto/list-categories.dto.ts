import { ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';

export class ListCategoriesDto {
  @ApiPropertyOptional({ description: 'Recherche par nom' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CategoryType })
  @IsOptional()
  @IsEnum(CategoryType)
  categoryType?: CategoryType;

  @ApiPropertyOptional({ description: 'true | false' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @ApiPropertyOptional({ description: 'true → ajoute productCount à chaque ligne', default: 'true' })
  @IsOptional()
  @IsBooleanString()
  includeProductCount?: string;
}
