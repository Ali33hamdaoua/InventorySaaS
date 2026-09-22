import { SetMetadata } from '@nestjs/common';
import { Permission } from '@inventorymdb/shared';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Gate a route on one or more `Permission` values from the shared package.
 * Resolves authoritatively against `ROLE_PERMISSIONS` in `PermissionsGuard`.
 *
 * Prefer this over `@Roles(...)` for new code — it keeps the role→capability
 * mapping in one place (`packages/shared/src/lib/permissions.ts`) instead of
 * scattering role lists across controllers.
 */
export const RequirePermission = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
