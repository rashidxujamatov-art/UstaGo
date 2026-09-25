import type { Params } from 'nestjs-pino';
import type { Env } from './env.js';

/**
 * JSON logs (pino). Request logs carry only method, path and status: no headers,
 * bodies, query strings or IP addresses, so personal data never reaches the logs.
 */
export function loggerParams(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url?.split('?')[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      redact: ['req.headers', 'res.headers'],
    },
  };
}
