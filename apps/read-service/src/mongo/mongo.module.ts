import { type DynamicModule, Global, Inject, Injectable, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { type Db, MongoClient } from 'mongodb';
import { loadConfig } from '../config.js';

export const MONGO_DB = Symbol('MONGO_DB');
const MONGO_CLIENT = Symbol('MONGO_CLIENT');

@Injectable()
class MongoShutdown implements OnApplicationShutdown {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}

export interface MongoModuleOptions {
  url: string;
  dbName: string;
}

@Global()
@Module({})
export class MongoModule {
  static forRoot(options?: MongoModuleOptions): DynamicModule {
    const config = loadConfig();
    const { url, dbName } = options ?? { url: config.mongoUrl, dbName: config.mongoDb };
    return {
      module: MongoModule,
      providers: [
        {
          provide: MONGO_CLIENT,
          useFactory: async (): Promise<MongoClient> => new MongoClient(url).connect(),
        },
        {
          provide: MONGO_DB,
          inject: [MONGO_CLIENT],
          useFactory: (client: MongoClient): Db => client.db(dbName),
        },
        MongoShutdown,
      ],
      exports: [MONGO_DB],
    };
  }
}
