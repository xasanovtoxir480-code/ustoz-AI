import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server.ts';

let cachedAppPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp({ skipFrontend: true });
  }
  const app = await cachedAppPromise;
  return app(req as never, res as never);
}
