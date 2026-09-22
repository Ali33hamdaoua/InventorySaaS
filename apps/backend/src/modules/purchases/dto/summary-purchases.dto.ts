import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class PurchaseSummaryQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Si omis, fallback sur month/year ou mois courant' })
  @IsOptional()
  @IsUuidLoose()
  periodId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ minimum: 2020 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;
}
