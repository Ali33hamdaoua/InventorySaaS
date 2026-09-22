import { Prisma } from '@prisma/client';

export function computeConsumptionQuantity(params: {
  opening: Prisma.Decimal;
  purchases: Prisma.Decimal;
  transferIn: Prisma.Decimal;
  transferOut: Prisma.Decimal;
  closing: Prisma.Decimal;
}): Prisma.Decimal {
  return params.opening
    .plus(params.purchases)
    .plus(params.transferIn)
    .minus(params.transferOut)
    .minus(params.closing);
}

export function computeAvailableQuantity(params: {
  opening: Prisma.Decimal;
  purchases: Prisma.Decimal;
  transferIn: Prisma.Decimal;
  transferOut: Prisma.Decimal;
}): Prisma.Decimal {
  return params.opening
    .plus(params.purchases)
    .plus(params.transferIn)
    .minus(params.transferOut);
}
