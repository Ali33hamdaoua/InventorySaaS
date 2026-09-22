import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

/**
 * Patch the user-entered revenue + labor + notes of a financial report.
 * All fields are optional — only the keys present are applied. Computed
 * columns (foodCost, totalExpenses, profit, %) are NEVER accepted from the
 * client; the backend recomputes (DRAFT) or reads the snapshot (LOCKED).
 */
export class UpdateFinancialReportDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sales?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discounts?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeMeals?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tips?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherRevenue?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  laborCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  // allow null to clear
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
