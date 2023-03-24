export interface NpmDownloadsByVersion {
  downloads: Record<string, number>;
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
