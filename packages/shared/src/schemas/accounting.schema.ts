import { z } from 'zod';
import { ExpenseCategory, PaymentMethod } from '../enums';

const expenseCategoryEnum = z.enum(
  Object.values(ExpenseCategory) as [ExpenseCategory, ...ExpenseCategory[]],
);
const paymentMethodEnum = z.enum(
  Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]],
);

/**
 * Create an expense. The client sends a single amount; the server mirrors it
 * into `totalAmount`. Sales taxes were removed with the move to Morocco.
 */
export const createAccountingExpenseSchema = z
  .object({
    expenseDate: z.coerce.date(),
    transactionDate: z.coerce.date().optional().nullable(),
    supplierId: z.string().uuid().optional().nullable(),
    supplierName: z.string().trim().max(150).optional().nullable(),
    category: expenseCategoryEnum,
    description: z.string().trim().min(1, 'Description requise').max(500),
    referenceNumber: z.string().trim().max(80).optional().nullable(),
    paymentMethod: paymentMethodEnum.optional().nullable(),
    amountBeforeTax: z.coerce.number().nonnegative(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((v) => !!v.supplierId || !!v.supplierName || v.category !== 'ACHATS_FOURNISSEURS', {
    message: 'Un fournisseur (lié ou libre) est requis pour la catégorie "Achats fournisseurs"',
    path: ['supplierName'],
  });
export type CreateAccountingExpenseInput = z.infer<typeof createAccountingExpenseSchema>;

export const updateAccountingExpenseSchema = z.object({
  expenseDate: z.coerce.date().optional(),
  transactionDate: z.coerce.date().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  supplierName: z.string().trim().max(150).optional().nullable(),
  category: expenseCategoryEnum.optional(),
  description: z.string().trim().min(1).max(500).optional(),
  referenceNumber: z.string().trim().max(80).optional().nullable(),
  paymentMethod: paymentMethodEnum.optional().nullable(),
  amountBeforeTax: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type UpdateAccountingExpenseInput = z.infer<typeof updateAccountingExpenseSchema>;

export const listAccountingExpensesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().optional(),
  category: expenseCategoryEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  supplierId: z.string().uuid().optional(),
  paymentMethod: paymentMethodEnum.optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
});
export type ListAccountingExpensesInput = z.infer<typeof listAccountingExpensesSchema>;
