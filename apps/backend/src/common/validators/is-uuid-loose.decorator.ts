import { applyDecorators } from '@nestjs/common';
import { Matches, type ValidationOptions } from 'class-validator';

/** Pattern that matches every UUID-shaped string (any version, including the
 *  deterministic non-v4 IDs used in the seed migrations). PostgreSQL's `uuid`
 *  column and `ParseUUIDPipe` already accept these — only class-validator's
 *  `IsUUID` insists on a proper version field, which rejects values like
 *  `11111111-1111-1111-1111-111111111111`. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validator decorator that accepts any UUID-formatted string. Use this
 * instead of `@IsUUID()` / `@IsUuidLoose()` whenever the value may be a
 * deterministic ID (e.g. seeded branchIds).
 */
export function IsUuidLoose(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Matches(UUID_PATTERN, {
      message: ({ property }) => `${property} doit être un UUID valide`,
      ...validationOptions,
    }),
  );
}
