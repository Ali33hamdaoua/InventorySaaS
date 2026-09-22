import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetCategoryStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
