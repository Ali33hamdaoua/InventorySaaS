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
import { LaborService } from './labor.service';
import { CreateLaborEntryDto } from './dto/create-labor-entry.dto';
import { UpdateLaborEntryDto } from './dto/update-labor-entry.dto';
import { ListLaborEntriesDto } from './dto/list-labor-entries.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';

@ApiTags('labor')
@ApiBearerAuth()
@RequirePermission(Permission.MANAGE_LABOR)
@Controller('labor')
export class LaborController {
  constructor(private readonly service: LaborService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des saisies main-d\'œuvre (filtre mois/année/branche).' })
  findAll(@Query() q: ListLaborEntriesDto, @CurrentUser() user: RequestUser) {
    return this.service.findAll(q, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Récap main-d\'œuvre pour le mois sélectionné.' })
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
  @Audit({ action: 'CREATE', entity: 'LaborEntry' })
  create(@Body() dto: CreateLaborEntryDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'LaborEntry' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLaborEntryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'DELETE', entity: 'LaborEntry' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
