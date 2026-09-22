import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetSupplierStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
