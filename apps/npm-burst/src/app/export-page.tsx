import { useCallback, useMemo, useState } from 'react';
import {
  Download,
  FileJson,
  FileText,
  FolderDown,
  Package,
  ArrowLeft,
} from 'lucide-react';
import { navigate } from 'vike/client/router';
import { Card } from './components/card';
import { useAppStore } from './store';
import {
  downloadFile,
  exportDataAsZip,
  getExportFiles,
  type ExportFile,
} from './utils/export-data';
import styles from './export-page.module.scss';

function FileIcon({ name }: { name: string }) {
  if (name.endsWith('.md')) return <FileText size={16} />;
  return <FileJson size={16} />;
}

function FileRow({ file, packageName }: { file: ExportFile; packageName: string }) {
  const handleDownload = useCallback(() => {
    const content = file.getContent();
    // Flatten path separators for individual download filenames
    const flatName = file.name.includes('/')
      ? file.name.replace(/\//g, '-')
      : file.name;
    const mimeType = file.name.endsWith('.md')
      ? 'text/markdown'
      : 'application/json';
    downloadFile(content, `${packageName}-${flatName}`, mimeType);
  }, [file, packageName]);

  return (
    <div className={styles.fileRow}>
      <div className={styles.fileInfo}>
        <div className={styles.fileName}>
          <FileIcon name={file.name} />
          <span>{file.name}</span>
        </div>
        <div className={styles.fileDescription}>{file.description}</div>
      </div>
      <button className={styles.downloadButton} onClick={handleDownload}>
        <Download size={14} />
        <span className={styles.downloadLabel}>Download</span>
      </button>
    </div>
  );
}

export function ExportPage() {
  const npmPackageName = useAppStore((s) => s.npmPackageName);
  const liveData = useAppStore((s) => s.liveData);
  const snapshots = useAppStore((s) => s.snapshots);
  const versionReleases = useAppStore((s) => s.versionReleases);
  const totalDownloads = useAppStore((s) => s.totalDownloads);
  const health = useAppStore((s) => s.health);
  const snapshotIndex = useAppStore((s) => s.snapshotIndex);

  const [isExporting, setIsExporting] = useState(false);

  const exportData = useMemo(
    () => ({
      packageName: npmPackageName,
      liveData,
      snapshots,
      versionReleases,
      totalDownloads,
      health,
      snapshotIndex,
    }),
    [npmPackageName, liveData, snapshots, versionReleases, totalDownloads, health, snapshotIndex]
  );

  const files = useMemo(() => getExportFiles(exportData), [exportData]);

  // Separate top-level files from snapshot files for grouping
  const topLevelFiles = useMemo(
    () => files.filter((f) => !f.name.startsWith('snapshots/')),
    [files]
  );
  const snapshotFiles = useMemo(
    () => files.filter((f) => f.name.startsWith('snapshots/')),
    [files]
  );

  const handleDownloadAll = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportDataAsZip(exportData);
    } finally {
      setIsExporting(false);
    }
  }, [exportData]);

  const base = import.meta.env.BASE_URL || '/';
  const baseNormalized = base.endsWith('/') ? base : base + '/';
  const dashboardUrl = `${baseNormalized}package#/${encodeURIComponent(npmPackageName)}`;

  if (!liveData) {
    return (
      <main className={styles.main}>
        <Card>
          <div className={styles.emptyState}>
            <Package size={48} color="var(--text-tertiary)" />
            <h2>No data to export</h2>
            <p>
              Navigate to a package dashboard first to load data, then return
              here to export.
            </p>
            <button
              className={styles.backLink}
              onClick={() => navigate(baseNormalized)}
            >
              <ArrowLeft size={14} />
              Go to home
            </button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>
            <button
              className={styles.backButton}
              onClick={() => navigate(dashboardUrl)}
              title="Back to dashboard"
            >
              <ArrowLeft size={16} />
            </button>
            Export data for{' '}
            <button
              className={styles.packageLink}
              onClick={() => navigate(dashboardUrl)}
            >
              {npmPackageName}
            </button>
          </h1>
          <p className={styles.subtitle}>
            Download individual files or grab everything as a ZIP
          </p>
        </div>
        <button
          className={styles.downloadAllButton}
          onClick={handleDownloadAll}
          disabled={isExporting}
        >
          <FolderDown size={16} />
          <span>{isExporting ? 'Generating...' : 'Download All (.zip)'}</span>
        </button>
      </div>

      <Card className={styles.card}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Files</h2>
          <div className={styles.fileList}>
            {topLevelFiles.map((file) => (
              <FileRow
                key={file.name}
                file={file}
                packageName={npmPackageName}
              />
            ))}
          </div>
        </div>

        {snapshotFiles.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Snapshots ({snapshotFiles.length})
            </h2>
            <div className={styles.fileList}>
              {snapshotFiles.map((file) => (
                <FileRow
                  key={file.name}
                  file={file}
                  packageName={npmPackageName}
                />
              ))}
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
