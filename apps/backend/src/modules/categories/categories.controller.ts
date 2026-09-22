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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { SetCategoryStatusDto } from './dto/set-status.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liste des catégories avec filtres (search, categoryType, isActive) et compteur produits par défaut',
  })
  findAll(@Query() q: ListCategoriesDto) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @RequirePermission(Permission.MANAGE_CATEGORIES)
  @Post()
  @Audit({ action: 'CREATE', entity: 'Category' })
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @RequirePermission(Permission.MANAGE_CATEGORIES)
  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'Category' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, dto);
  }

  @RequirePermission(Permission.MANAGE_CATEGORIES)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Active/désactive une catégorie (jamais de suppression physique)' })
  @Audit({ action: 'UPDATE', entity: 'Category' })
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCategoryStatusDto) {
    return this.service.setStatus(id, dto.isActive);
  }

  @RequirePermission(Permission.MANAGE_CATEGORIES)
  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete (passe isActive=false). Refusé si des produits y sont rattachés.',
  })
  @Audit({ action: 'DELETE', entity: 'Category' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
