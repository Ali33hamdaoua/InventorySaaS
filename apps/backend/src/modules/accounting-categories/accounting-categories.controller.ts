import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountingCategoriesService } from './accounting-categories.service';

/**
 * Read-only HTTP surface for the accounting categories dropdown.
 *
 * Why no POST endpoint:
 *   Categories are created opportunistically by the AccountingService when the
 *   user types a new name into the expense form (`categoryName` flow). There's
 *   no separate "create a category first, then use it" workflow — the spec is
 *   explicit that creation is an implicit side-effect of saving an expense.
 *   Less UI, fewer broken-state edge cases.
 */
@ApiTags('accounting-categories')
@ApiBearerAuth()
@Controller('accounting/categories')
export class AccountingCategoriesController {
  constructor(private readonly service: AccountingCategoriesService) {}

  @Get()
  list() {
    return this.service.findAll();
  }
}
