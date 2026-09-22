import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class AccountingSummaryQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  year?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;
}
