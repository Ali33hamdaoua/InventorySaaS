import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@inventorymdb/shared';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liste des succursales (par défaut : actives uniquement). includeStats=true ajoute usersCount/productsCount/purchasesCount.',
  })
  findAll(
    @Query('includeInactive') includeInactive?: string,
    @Query('includeStats') includeStats?: string,
  ) {
    if (includeStats === 'true') {
      return this.service.findAllWithStats(includeInactive === 'true');
    }
    return this.service.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @RequirePermission(Permission.MANAGE_BRANCHES)
  @Post()
  @Audit({ action: 'CREATE', entity: 'Branch' })
  create(@Body() dto: CreateBranchDto) {
    return this.service.create(dto);
  }

  @RequirePermission(Permission.MANAGE_BRANCHES)
  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'Branch' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.service.update(id, dto);
  }

  @RequirePermission(Permission.MANAGE_BRANCHES)
  @Patch(':id/activate')
  @Audit({ action: 'UPDATE', entity: 'Branch' })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.setActive(id, true);
  }

  @RequirePermission(Permission.MANAGE_BRANCHES)
  @Patch(':id/deactivate')
  @Audit({ action: 'UPDATE', entity: 'Branch' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.setActive(id, false);
  }
}
