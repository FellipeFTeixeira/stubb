import { Injectable } from '@nestjs/common';

// Relógio injetável: os testes o sobrescrevem para fixar o "agora".
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
