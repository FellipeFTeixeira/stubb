import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

// Propaga o EntityManager da transação corrente sem passá-lo por parâmetro.
@Injectable()
export class TransactionContext {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  constructor(private readonly dataSource: DataSource) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => this.storage.run(manager, fn));
  }

  manager(): EntityManager {
    const manager = this.storage.getStore();
    if (!manager) throw new Error('No active transaction');
    return manager;
  }
}
