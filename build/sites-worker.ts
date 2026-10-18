import handler from 'vinext/server/fetch-handler';
import { handleHostedApi, type HostedEnv } from '../server/hosted-api';

export default {
  async fetch(request: Request, env: HostedEnv, ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return handleHostedApi(request, env);
    }
    return handler.fetch(request, env, ctx);
  },
};
