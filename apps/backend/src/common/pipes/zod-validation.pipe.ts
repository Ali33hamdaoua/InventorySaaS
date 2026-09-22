import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    try {
      return this.schema.parse(value);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: e.flatten().fieldErrors,
        });
      }
      throw e;
    }
  }
}
