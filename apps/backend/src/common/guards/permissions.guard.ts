import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@inventorymdb/shared';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';

/**
 * Authoritative permission check — pairs with `@RequirePermission(...)`.
 * Skips when:
 *   - route is `@Public()`
 *   - no `@RequirePermission` metadata (other guards may still apply)
 *
 * On failure throws 403 with a generic message — exposing the missing
 * permission key to the client would leak the authorization model.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Utilisateur non authentifié');

    const ok = required.every((p) => hasPermission(user.role, p));
    if (!ok) {
      throw new ForbiddenException('Permission refusée');
    }
    return true;
  }
}
