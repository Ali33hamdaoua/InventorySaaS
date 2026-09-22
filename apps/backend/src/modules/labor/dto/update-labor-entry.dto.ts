import { PartialType } from '@nestjs/swagger';
import { CreateLaborEntryDto } from './create-labor-entry.dto';

export class UpdateLaborEntryDto extends PartialType(CreateLaborEntryDto) {}
