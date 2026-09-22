import { Module } from '@nestjs/common';
import { LaborService } from './labor.service';
import { LaborController } from './labor.controller';

@Module({
  controllers: [LaborController],
  providers: [LaborService],
  exports: [LaborService],
})
export class LaborModule {}
