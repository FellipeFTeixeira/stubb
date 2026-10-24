import 'reflect-metadata';
import dataSource from './data-source.js';

async function main(): Promise<void> {
  await dataSource.initialize();
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  if (applied.length === 0) console.log('No pending migrations');
  for (const migration of applied) console.log(`Applied migration ${migration.name}`);
  await dataSource.destroy();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('Migration failed', error);
  process.exit(1);
});
