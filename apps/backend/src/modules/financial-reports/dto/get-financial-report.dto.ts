import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class GetFinancialReportDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Branch scope (auto-filled for MANAGER).' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ minimum: 2020, maximum: 2100 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;
}
