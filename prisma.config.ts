import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Generation needs no credentials; migration commands require DATABASE_URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
