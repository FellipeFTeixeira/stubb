import { Injectable } from '@nestjs/common';
import { config } from '../../config.js';

// Sem autenticação na Fase 2: todo command roda como o produtor semeado.
@Injectable()
export class CurrentOrganizer {
  id(): string {
    return config.SEED_ORGANIZER_ID;
  }
}
