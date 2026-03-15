import * as JSZip from 'jszip';
import {
  bold,
  h1,
  h2,
  h3,
  lines,
  link,
  table,
} from 'markdown-factory';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';

export interface ExportData {
  packageName: string;
  liveData: NpmDownloadsByVersion | null;
  snapshots: Snapshot[];
  versionReleases: VersionRelease[];
  totalDownloads: DailyDownloadPoint[];
  snapshotIndex: number | null;
}

export interface ExportFile {
  /** File name (may include path separators for nested files) */
  name: string;
  /** Display label shown in the UI */
  label: string;
  /** Short description of what's in this file */
  description: string;
  /** Returns the file content as a string */
  getContent: () => string;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function sortedEntries(
  downloads: Record<string, number>
): [string, number][] {
  return Object.entries(downloads).sort(([, a], [, b]) => b - a);
}

function generateMarkdown(data: ExportData): string {
  const {
    packageName,
    liveData,
    snapshots,
    versionReleases,
    totalDownloads,
    snapshotIndex,
  } = data;

  const npmUrl = `https://www.npmjs.com/package/${packageName}`;
  const exportDate = new Date().toISOString();

  const currentSnapshot =
    snapshotIndex !== null ? snapshots[snapshotIndex] : null;

  const registrySection = h2(
    'Registry Information',
    lines(
      `${bold('Package:')} ${link(npmUrl, packageName)}`,
      `${bold('Total versions released:')} ${versionReleases.length}`,
      versionReleases.length > 0
        ? `${bold('First release:')} ${formatDate(versionReleases[versionReleases.length - 1].date)} (${versionReleases[versionReleases.length - 1].version})`
        : '',
      versionReleases.length > 0
        ? `${bold('Latest release:')} ${formatDate(versionReleases[0].date)} (${versionReleases[0].version})`
        : ''
    )
  );

  let liveSection = '';
  if (liveData) {
    const entries = sortedEntries(liveData.downloads);
    const totalDownloadsLive = entries.reduce((sum, [, d]) => sum + d, 0);

    liveSection = h2(
      'Live Download Data (Last Week)',
      lines(
        `${bold('Total downloads:')} ${formatNumber(totalDownloadsLive)}`,
        `${bold('Versions with downloads:')} ${entries.length}`,
        '',
        h3(
          'Top Versions',
          table(
            entries.slice(0, 20).map(([version, downloads]) => ({
              version,
              downloads: formatNumber(downloads),
              share: `${((downloads / totalDownloadsLive) * 100).toFixed(1)}%`,
            })),
            ['version', 'downloads', 'share']
          )
        ),
        entries.length > 20
          ? `_...and ${entries.length - 20} more versions_`
          : ''
      )
    );
  }

  let snapshotSection = '';
  if (currentSnapshot) {
    const entries = sortedEntries(currentSnapshot.downloads);
    const totalDl = entries.reduce((sum, [, d]) => sum + d, 0);

    snapshotSection = h2(
      `Current Snapshot (${formatDate(currentSnapshot.date)})`,
      lines(
        `${bold('Total downloads:')} ${formatNumber(totalDl)}`,
        `${bold('Versions with downloads:')} ${entries.length}`,
        '',
        h3(
          'Top Versions',
          table(
            entries.slice(0, 20).map(([version, downloads]) => ({
              version,
              downloads: formatNumber(downloads),
              share: `${((downloads / totalDl) * 100).toFixed(1)}%`,
            })),
            ['version', 'downloads', 'share']
          )
        ),
        entries.length > 20
          ? `_...and ${entries.length - 20} more versions_`
          : ''
      )
    );
  }

  let snapshotsSummary = '';
  if (snapshots.length > 0) {
    snapshotsSummary = h2(
      'Snapshots Summary',
      lines(
        `${bold('Total snapshots:')} ${snapshots.length}`,
        `${bold('Date range:')} ${formatDate(snapshots[0].date)} — ${formatDate(snapshots[snapshots.length - 1].date)}`,
        '',
        'See individual snapshot JSON files in the `snapshots/` folder for full data.'
      )
    );
  }

  let releasesSection = '';
  if (versionReleases.length > 0) {
    const recentReleases = versionReleases.slice(0, 30);
    releasesSection = h2(
      'Recent Version Releases',
      lines(
        table(
          recentReleases.map((r) => ({
            version: r.version,
            date: formatDate(r.date),
          })),
          ['version', 'date']
        ),
        versionReleases.length > 30
          ? `_...and ${versionReleases.length - 30} more releases_`
          : ''
      )
    );
  }

  let volumeSection = '';
  if (totalDownloads.length > 0) {
    const totalVol = totalDownloads.reduce((s, d) => s + d.downloads, 0);
    const peakDay = totalDownloads.reduce(
      (max, d) => (d.downloads > max.downloads ? d : max),
      totalDownloads[0]
    );

    volumeSection = h2(
      'Download Volume Summary',
      lines(
        `${bold('Period:')} ${formatDate(totalDownloads[0].day)} — ${formatDate(totalDownloads[totalDownloads.length - 1].day)}`,
        `${bold('Total downloads:')} ${formatNumber(totalVol)}`,
        `${bold('Peak day:')} ${formatDate(peakDay.day)} (${formatNumber(peakDay.downloads)} downloads)`,
        `${bold('Daily average:')} ${formatNumber(Math.round(totalVol / totalDownloads.length))}`
      )
    );
  }

  const footer = lines(
    '---',
    `_Exported from ${link('https://npm-burst.com', 'npm-burst')} on ${formatDate(exportDate)}_`
  );

  return h1(
    `npm-burst Export: ${packageName}`,
    lines(
      registrySection,
      liveSection,
      snapshotSection,
      snapshotsSummary,
      releasesSection,
      volumeSection,
      footer
    )
  );
}

/**
 * Build the list of exportable files from the current data.
 * Each file can be downloaded individually or bundled into a ZIP.
 */
export function getExportFiles(data: ExportData): ExportFile[] {
  const { packageName, liveData, snapshots, versionReleases, totalDownloads } =
    data;

  const files: ExportFile[] = [];

  // metadata.json
  files.push({
    name: 'metadata.json',
    label: 'Metadata',
    description: 'Package name, npm URL, registry URL, and export timestamp',
    getContent: () =>
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          package: packageName,
          npmUrl: `https://www.npmjs.com/package/${packageName}`,
          registryUrl: `https://registry.npmjs.org/${packageName}`,
        },
        null,
        2
      ),
  });

  // report.md
  files.push({
    name: 'report.md',
    label: 'Summary Report',
    description:
      'Human-readable markdown report with registry info, download tables, and volume stats',
    getContent: () => generateMarkdown(data),
  });

  // live-data.json
  if (liveData) {
    files.push({
      name: 'live-data.json',
      label: 'Live Downloads',
      description: `Current week's downloads by version (${Object.keys(liveData.downloads).length} versions)`,
      getContent: () => JSON.stringify(liveData, null, 2),
    });
  }

  // version-releases.json
  if (versionReleases.length > 0) {
    files.push({
      name: 'version-releases.json',
      label: 'Version Releases',
      description: `${versionReleases.length} version release dates from the npm registry`,
      getContent: () => JSON.stringify(versionReleases, null, 2),
    });
  }

  // total-downloads.json
  if (totalDownloads.length > 0) {
    files.push({
      name: 'total-downloads.json',
      label: 'Download Volume',
      description: `Daily aggregate download counts (${totalDownloads.length} days)`,
      getContent: () => JSON.stringify(totalDownloads, null, 2),
    });
  }

  // snapshots — combined file
  if (snapshots.length > 0) {
    files.push({
      name: 'snapshots/all-snapshots.json',
      label: 'All Snapshots',
      description: `Combined file with all ${snapshots.length} historical snapshots`,
      getContent: () => JSON.stringify(snapshots, null, 2),
    });

    // Individual snapshot files
    for (const snapshot of snapshots) {
      files.push({
        name: `snapshots/${snapshot.date}.json`,
        label: `Snapshot ${snapshot.date}`,
        description: `Downloads by version for ${formatDate(snapshot.date)}`,
        getContent: () => JSON.stringify(snapshot, null, 2),
      });
    }
  }

  return files;
}

/** Trigger a browser download from a string content. */
export function downloadFile(
  content: string,
  filename: string,
  mimeType = 'application/json'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDataAsZip(data: ExportData): Promise<void> {
  const zip = new JSZip();
  const files = getExportFiles(data);

  for (const file of files) {
    zip.file(file.name, file.getContent());
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `npm-burst-${data.packageName}-export.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
