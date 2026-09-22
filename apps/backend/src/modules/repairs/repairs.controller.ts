import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@inventorymdb/shared';
import { RepairsService } from './repairs.service';
import { CreateRepairEntryDto } from './dto/create-repair-entry.dto';
import { UpdateRepairEntryDto } from './dto/update-repair-entry.dto';
import { ListRepairEntriesDto } from './dto/list-repair-entries.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';

@ApiTags('repairs')
@ApiBearerAuth()
@RequirePermission(Permission.MANAGE_REPAIRS)
@Controller('repairs')
export class RepairsController {
  constructor(private readonly service: RepairsService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des réparations (filtres mois/année/statut/branche).' })
  findAll(@Query() q: ListRepairEntriesDto, @CurrentUser() user: RequestUser) {
    return this.service.findAll(q, user);
  }

  @Get('summary')
  summary(
    @Query('month', new ParseIntPipe()) month: number,
    @Query('year', new ParseIntPipe()) year: number,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.summary(month, year, user, branchId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Audit({ action: 'CREATE', entity: 'RepairEntry' })
  create(@Body() dto: CreateRepairEntryDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'RepairEntry' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRepairEntryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'DELETE', entity: 'RepairEntry' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
