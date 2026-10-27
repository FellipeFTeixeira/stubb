import { seedCatalog } from './seed/catalog-seed.ts';

const result = await seedCatalog();
if (result.created) console.log('Seed de demonstração criado: 3 locais e 4 eventos.');
