import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'houbati@hongkong.ma' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Houbati2026!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
