import { buildApp } from './app';

const port = Number(process.env.INKFORGE_PORT ?? 8787);
const app = await buildApp();
await app.listen({ port, host: '127.0.0.1' });
