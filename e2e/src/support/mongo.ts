import { MongoClient, type Db } from 'mongodb';
import { env } from './env.ts';

export async function withMongo<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = new MongoClient(env.MONGO_URL);
  await client.connect();
  try {
    return await fn(client.db(env.MONGO_DB));
  } finally {
    await client.close();
  }
}
