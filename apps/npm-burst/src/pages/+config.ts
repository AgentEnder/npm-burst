import vikeReact from 'vike-react/config';
import { Config } from 'vike/types';

export default {
  extends: [vikeReact],
  trailingSlash: true,
  prerender: {
    keepDistServer: true,
    enable: true,
  },
  clientRouting: true,
  // Server-set values that survive server→client hydration. The
  // matching writers are in `+onCreatePageContext.server.ts`.
  passToClient: ['isDevMode'],
} satisfies Config;
