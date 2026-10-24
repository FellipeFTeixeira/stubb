/* global rs, db, sleep, print */
// mongosh globals
try {
  rs.status();
} catch {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] });
}

let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  if (db.hello().isWritablePrimary) {
    ready = true;
    break;
  }
  sleep(500);
}
if (!ready) {
  throw new Error('replica set rs0 did not elect a primary in time');
}

const readDb = db.getSiblingDB('stubb_read');
const existing = readDb.getCollectionNames();
for (const name of ['pings', 'processed_events']) {
  if (!existing.includes(name)) {
    readDb.createCollection(name);
  }
}
print('mongo-init: replica set rs0 ready, collections ensured');
