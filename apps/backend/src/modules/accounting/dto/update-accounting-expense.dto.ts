import { PartialType } from '@nestjs/swagger';
import { CreateAccountingExpenseDto } from './create-accounting-expense.dto';

export class UpdateAccountingExpenseDto extends PartialType(CreateAccountingExpenseDto) {}
