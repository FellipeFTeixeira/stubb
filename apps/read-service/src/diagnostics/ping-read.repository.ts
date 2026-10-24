import { Inject, Injectable } from '@nestjs/common';
import type { PingView } from '@stubb/contracts';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../mongo/mongo.module.js';

interface PingDocument {
  _id: string;
  label: string;
  count: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PingReadRepository {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async findById(id: string): Promise<PingView | null> {
    const doc = await this.db.collection<PingDocument>('pings').findOne({ _id: id });
    if (!doc) return null;
    return {
      id: doc._id,
      label: doc.label,
      count: doc.count,
      version: doc.version,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
