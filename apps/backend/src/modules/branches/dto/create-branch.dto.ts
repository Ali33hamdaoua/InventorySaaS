import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBranchDto {
  @ApiProperty({ example: 'Joliette' })
  @IsString()
  @Transform(trim)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'joliette', description: 'URL slug, lowercase a-z0-9-' })
  @IsString()
  @Transform(trim)
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug doit être en minuscules a-z, 0-9 ou -' })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
