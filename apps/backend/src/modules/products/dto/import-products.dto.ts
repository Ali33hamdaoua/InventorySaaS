import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class ProductImportRowIssueDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  field?: string;

  @ApiProperty()
  @IsString()
  message!: string;
}

export class ProductImportRowDataDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  category!: string;

  @ApiProperty()
  @IsString()
  supplier!: string;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiProperty()
  @IsNumber()
  defaultCost!: number;

  @ApiProperty()
  @IsNumber()
  minStockLevel!: number;

  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class ProductImportRowDto {
  @ApiProperty()
  @IsInt()
  rowNumber!: number;

  @ApiProperty({ type: ProductImportRowDataDto })
  @ValidateNested()
  @Type(() => ProductImportRowDataDto)
  data!: ProductImportRowDataDto;

  @ApiProperty({ enum: ['VALID', 'WARNING', 'ERROR'] })
  @IsIn(['VALID', 'WARNING', 'ERROR'])
  status!: 'VALID' | 'WARNING' | 'ERROR';

  @ApiProperty({ type: [ProductImportRowIssueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImportRowIssueDto)
  errors!: ProductImportRowIssueDto[];

  @ApiProperty({ type: [ProductImportRowIssueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImportRowIssueDto)
  warnings!: ProductImportRowIssueDto[];

  @ApiProperty({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUuidLoose()
  matchedCategoryId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUuidLoose()
  matchedSupplierId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUuidLoose()
  existingProductId!: string | null;
}

export class ProductImportConfirmDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Target branch â€” required for ADMIN/OWNER, auto-filled for MANAGER',
  })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiProperty({ type: [ProductImportRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImportRowDto)
  rows!: ProductImportRowDto[];
}
