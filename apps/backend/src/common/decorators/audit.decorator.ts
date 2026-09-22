import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from '@prisma/client';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: AuditAction;
  entity: string;
}

export const Audit = (meta: AuditMeta): MethodDecorator => SetMetadata(AUDIT_KEY, meta);
