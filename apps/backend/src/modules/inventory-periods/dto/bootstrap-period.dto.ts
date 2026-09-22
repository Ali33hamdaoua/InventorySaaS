import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

/**
 * One-shot bootstrap of the first inventory period for a branch.
 *
 * Unlike `CreatePeriodDto`, this is rejected when ANY period already exists
 * on the target branch — the normal flow after bootstrap is auto-creation
 * on close. Month/year default to "today".
 */
export class BootstrapPeriodDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Branch to bootstrap. Optional for MANAGER (auto-filled), required for ADMIN/OWNER.',
  })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, description: 'Defaults to current month.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ minimum: 2020, description: 'Defaults to current year.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}
