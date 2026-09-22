import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetUserStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
