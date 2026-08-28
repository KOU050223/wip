import { Container, getRandom } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';
import { createApp } from './app';

const INSTANCE_COUNT = 2;
export class BackendContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
  envVars = {
    DATABASE_URL: env.DATABASE_URL,
    CORS_ALLOW_ORIGINS: env.CORS_ALLOW_ORIGINS,
    UPSTASH_REDIS_URL: env.UPSTASH_REDIS_URL,
    GUEST_SESSION_SECRET: env.GUEST_SESSION_SECRET,
  };

  override onStart() {
    console.log('backend container started');
  }

  override onStop(stopParams: { exitCode: number; reason: string }) {
    console.log('backend container stopped', stopParams);
  }

  override onError(error: unknown) {
    console.error('backend container error:', error);
  }
}

const app = createApp(async (request, env) => {
  const container = await getRandom(env.BACKEND, INSTANCE_COUNT);
  return container.fetch(request);
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return app.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
