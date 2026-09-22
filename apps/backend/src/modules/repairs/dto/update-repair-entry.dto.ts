import { PartialType } from '@nestjs/swagger';
import { CreateRepairEntryDto } from './create-repair-entry.dto';

export class UpdateRepairEntryDto extends PartialType(CreateRepairEntryDto) {}
