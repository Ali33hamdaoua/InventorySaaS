import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../decorators/current-user.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<{ user?: RequestUser; body?: unknown; params?: Record<string, string> }>();
    const userId = req.user?.id;

    return next.handle().pipe(
      tap(async (response) => {
        try {
          const entityId =
            (response && typeof response === 'object' && 'id' in (response as Record<string, unknown>)
              ? String((response as Record<string, unknown>).id)
              : null) ?? req.params?.id ?? null;

          await this.prisma.auditLog.create({
            data: {
              userId: userId ?? null,
              action: meta.action,
              entity: meta.entity,
              entityId,
              newValue: (req.body as object | undefined) ?? undefined,
            },
          });
        } catch {
          // best-effort: never fail the main flow because of audit
        }
      }),
    );
  }
}
