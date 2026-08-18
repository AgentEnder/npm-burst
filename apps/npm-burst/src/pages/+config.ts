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
  // Defaults. Pages that can say something more specific override these —
  // package pages build both from their snapshot data (see
  // `package-detail/+config.ts`), which is what makes them worth indexing.
  title: 'Npm Burst — npm download stats broken down by version',
  description:
    'See how downloads of an npm package split across its major, minor and patch versions, and how that distribution shifts over time.',
  // Server-set values that survive server→client hydration. The
  // matching writers are in `+onCreatePageContext.server.ts`.
  passToClient: ['isDevMode'],
} satisfies Config;
