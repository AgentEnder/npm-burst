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
} satisfies Config;
