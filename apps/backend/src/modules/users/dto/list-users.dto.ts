import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class ListUsersDto {
  @ApiPropertyOptional({ description: 'Recherche par nom ou email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidLoose()
  branchId?: string;

  @ApiPropertyOptional({ description: 'true | false' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
