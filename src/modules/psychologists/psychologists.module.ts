import { Module } from '@nestjs/common';
import { PsychologistsController } from './psychologists.controller';
import { PsychologistsService } from './psychologists.service';
import { PsychologistsRepository } from './psychologists.repository';

@Module({
  controllers: [PsychologistsController],
  providers: [PsychologistsService, PsychologistsRepository],
  exports: [PsychologistsService, PsychologistsRepository],
})
export class PsychologistsModule {}
