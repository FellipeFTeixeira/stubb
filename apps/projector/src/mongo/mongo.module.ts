import { Global, Inject, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { config } from '../config.js';

export const MONGO_CLIENT = Symbol('MONGO_CLIENT');
export const MONGO_DB = Symbol('MONGO_DB');

@Global()
@Module({
  providers: [
    { provide: MONGO_CLIENT, useFactory: () => new MongoClient(config.MONGO_URL) },
    {
      provide: MONGO_DB,
      inject: [MONGO_CLIENT],
      useFactory: (client: MongoClient) => client.db(config.MONGO_DB),
    },
  ],
  exports: [MONGO_CLIENT, MONGO_DB],
})
export class MongoModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
