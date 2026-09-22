import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RepairStatus } from '@prisma/client';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class CreateRepairEntryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Branche (auto-injectée pour MANAGER, requise pour ADMIN/OWNER).',
  })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiProperty({ format: 'date' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiProperty({ description: 'Objet de la réparation (ex : "Remplacement compresseur frigo")' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Équipement concerné' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  equipment?: string;

  @ApiPropertyOptional({ description: 'Technicien ou fournisseur' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  vendorName?: string;

  @ApiProperty({ description: 'Montant hors taxes (HT)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountBeforeTax!: number;

  @ApiProperty({ description: 'TPS saisie manuellement', default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tpsAmount!: number;

  @ApiProperty({ description: 'TVQ saisie manuellement', default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tvqAmount!: number;

  @ApiPropertyOptional({ enum: RepairStatus, default: RepairStatus.PLANNED })
  @IsOptional()
  @IsEnum(RepairStatus)
  status?: RepairStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}
