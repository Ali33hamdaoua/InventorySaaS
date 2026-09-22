import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@inventorymdb/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@RequirePermission(Permission.MANAGE_USERS)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liste des utilisateurs (filtres search, role, branchId, isActive). passwordHash jamais retourné.',
  })
  findAll(@Query() q: ListUsersDto) {
    return this.usersService.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Audit({ action: 'CREATE', entity: 'User' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'User' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.update(id, dto, currentUser);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Active / désactive un utilisateur (protection dernier OWNER + no self-disable)',
  })
  @Audit({ action: 'UPDATE', entity: 'User' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.setStatus(id, dto.isActive, currentUser);
  }

  @Delete(':id')
  @Audit({ action: 'DELETE', entity: 'User' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: RequestUser) {
    return this.usersService.remove(id, currentUser);
  }
}
