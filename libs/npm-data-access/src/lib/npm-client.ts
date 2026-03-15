export interface NpmDownloadsByVersion {
  downloads: Record<string, number>;
  package: string;
}

export interface NpmDailyDownloadPoint {
  day: string;
  downloads: number;
}

export interface NpmDownloadsRange {
  downloads: NpmDailyDownloadPoint[];
  start: string;
  end: string;
  package: string;
}

export function getDownloadsByVersion(pkg: string) {
  const controller = new AbortController();
  return {
    get: () =>
      fetch(
        `https://api.npmjs.org/versions/${encodeURI(pkg).replace(
          '/',
          '%2f'
        )}/last-week`,
        { signal: controller.signal }
      ).then(async (result) => {
        const json = await result.json();
        return json as NpmDownloadsByVersion;
      }),
    cancel: () => {
      controller.abort();
    },
  };
}

export function getTotalDownloadsRange(
  pkg: string,
  start: string,
  end: string
) {
  const controller = new AbortController();
  const encodedPkg = encodeURI(pkg).replace('/', '%2f');
  return {
    get: () =>
      fetch(
        `https://api.npmjs.org/downloads/range/${start}:${end}/${encodedPkg}`,
        { signal: controller.signal }
      ).then(async (result) => {
        const json = await result.json();
        return json as NpmDownloadsRange;
      }),
    cancel: () => {
      controller.abort();
    },
  };
}
