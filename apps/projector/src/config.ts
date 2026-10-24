export const config = {
  PORT: Number(process.env.PORT ?? 3003),
  MONGO_URL: process.env.MONGO_URL ?? 'mongodb://localhost:27017/?directConnection=true',
  MONGO_DB: process.env.MONGO_DB ?? 'stubb_read',
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS ?? 'localhost:9094').split(','),
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID ?? 'projector',
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID ?? 'projector',
};
