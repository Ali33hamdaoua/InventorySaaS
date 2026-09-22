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
import { AccountingService } from './accounting.service';
import { CreateAccountingExpenseDto } from './dto/create-accounting-expense.dto';
import { UpdateAccountingExpenseDto } from './dto/update-accounting-expense.dto';
import { ListAccountingExpensesDto } from './dto/list-accounting-expenses.dto';
import { AccountingSummaryQueryDto } from './dto/summary-accounting.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting')
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('expenses')
  @ApiOperation({
    summary:
      'Liste paginée des dépenses comptables (search, category, period, supplier, paymentMethod, minAmount, maxAmount)',
  })
  findAll(@Query() q: ListAccountingExpensesDto, @CurrentUser() user: RequestUser) {
    return this.service.findAll(q, user);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'KPI dépenses sur la période sélectionnée (mois courant par défaut). Scopable par branchId. Recalculé serveur.',
  })
  summary(@Query() q: AccountingSummaryQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.summary(q, user);
  }

  @Get('expenses/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @RequirePermission(Permission.MANAGE_ACCOUNTING)
  @Post('expenses')
  @Audit({ action: 'CREATE', entity: 'AccountingExpense' })
  create(@Body() dto: CreateAccountingExpenseDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @RequirePermission(Permission.MANAGE_ACCOUNTING)
  @Patch('expenses/:id')
  @Audit({ action: 'UPDATE', entity: 'AccountingExpense' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountingExpenseDto,
  ) {
    return this.service.update(id, dto);
  }

  @RequirePermission(Permission.MANAGE_ACCOUNTING)
  @Delete('expenses/:id')
  @ApiOperation({ summary: 'Soft delete (sets deletedAt). Préserve l\'historique comptable.' })
  @Audit({ action: 'DELETE', entity: 'AccountingExpense' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
