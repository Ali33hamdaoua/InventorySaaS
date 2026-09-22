import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export const PRODUCT_SORT_FIELDS = ['name', 'category', 'supplier', 'defaultCost', 'minStockLevel', 'isActive', 'createdAt'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export class ListProductsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 25;

  @ApiPropertyOptional({ description: 'Recherche par nom' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Scope to a branch (Admin/Owner only)' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuidLoose()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuidLoose()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'true | false' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @ApiPropertyOptional({
    description: 'Filtre sur les produits dont minStockLevel > 0 (utile combiné côté UI avec le dashboard)',
  })
  @IsOptional()
  @IsBooleanString()
  criticalOnly?: string;

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS as readonly string[])
  sortBy: ProductSortField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  @Transform(({ value }) => (value === 'desc' ? 'desc' : 'asc'))
  sortOrder: 'asc' | 'desc' = 'asc';
}
