import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class CreateLaborEntryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Branch (auto-injected from session for MANAGER, required for ADMIN/OWNER).',
  })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiProperty({ format: 'date' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiProperty({ description: 'Nom de l\'employé' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  employeeName!: string;

  @ApiPropertyOptional({ description: 'Poste ou rôle' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @ApiProperty({ description: 'Heures travaillées (accepte décimales : 7.5)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hours!: number;

  @ApiProperty({ description: 'Taux horaire dans la devise du client' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourlyRate!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}
