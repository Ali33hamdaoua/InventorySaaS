import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class ListAccountingExpensesDto {
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

  @ApiPropertyOptional({ description: 'Recherche sur description, fournisseur libre ou nÂ° facture' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Filter by accounting category id (resolved against the new dynamic
   * `accounting_categories` table). The previous string enum filter was
   * dropped — frontend now sends a UUID picked from the category dropdown.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  accountingCategoryId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  supplierId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({ description: 'true â†’ inclut les dÃ©penses soft-deleted' })
  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Scope to a branch (Admin/Owner only)' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;
}
