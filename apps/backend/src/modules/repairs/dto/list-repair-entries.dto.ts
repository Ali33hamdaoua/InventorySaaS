import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { RepairStatus } from '@prisma/client';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class ListRepairEntriesDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ minimum: 2020, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ enum: RepairStatus })
  @IsOptional()
  @IsEnum(RepairStatus)
  status?: RepairStatus;
}
