export interface ConsumedMessage {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: Buffer | null;
  headers: Record<string, string>;
}

export interface EventConsumer {
  connect(): Promise<void>;
  subscribe(topics: string[]): Promise<void>;
  run(handler: (message: ConsumedMessage) => Promise<void>): Promise<void>;
  commit(message: ConsumedMessage): Promise<void>;
  disconnect(): Promise<void>;
}

export const EVENT_CONSUMER = Symbol('EVENT_CONSUMER');
export const PROCESS_EXIT = Symbol('PROCESS_EXIT');
