import {
  buildPackageDescription,
  summarizeSnapshot,
} from '../../app/utils/package-seo';
import type { PackageDetailData } from './+data';

/**
 * Separate file for the same reason as `+title.ts` — Vike requires configs
 * holding runtime code to live in their own `+` file.
 */
export default function description(pageContext: {
  data: unknown;
}): string | null {
  const data = pageContext.data as PackageDetailData | undefined;
  if (!data) return null;

  return buildPackageDescription(
    data.packageName,
    summarizeSnapshot(data.latestSnapshot?.downloads),
    data.tab
  );
}
