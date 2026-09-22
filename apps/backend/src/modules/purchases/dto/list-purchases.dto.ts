import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class ListPurchasesDto {
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

  @ApiPropertyOptional({ description: 'Recherche par nom de fournisseur ou note interne' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'ISO date (yyyy-mm-dd)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'ISO date (yyyy-mm-dd)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ description: 'Filtre par période (year+month dérivés)' })
  @IsOptional()
  @IsUuidLoose()
  periodId?: string;

  @ApiPropertyOptional({ default: 'true' })
  @IsOptional()
  @IsBooleanString()
  includeItems?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Scope to a branch (Admin/Owner only)' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;
}
