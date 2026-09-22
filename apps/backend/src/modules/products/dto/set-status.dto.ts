import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetProductStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
