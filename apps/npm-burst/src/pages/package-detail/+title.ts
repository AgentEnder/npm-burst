import {
  buildPackageTitle,
  summarizeSnapshot,
} from '../../app/utils/package-seo';
import type { PackageDetailData } from './+data';

/**
 * A separate file rather than a key in `+config.ts`: Vike requires configs
 * that hold runtime code to be defined in their own `+` file, so that the
 * function is not pulled into the config bundle.
 *
 * The title is generated from the snapshot `+data.ts` already loaded for the
 * chart, so it costs no extra query and is unique per package. Returning null
 * falls back to the site default in `pages/+config.ts`.
 */
export default function title(pageContext: { data: unknown }): string | null {
  const data = pageContext.data as PackageDetailData | undefined;
  if (!data) return null;

  return buildPackageTitle(
    data.packageName,
    summarizeSnapshot(data.latestSnapshot?.downloads),
    data.tab
  );
}
