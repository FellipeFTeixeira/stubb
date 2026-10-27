import { Injectable } from '@nestjs/common';

// Injectable "now" so tests can fix the clock; derived state (sales, badges) depends on it.
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
