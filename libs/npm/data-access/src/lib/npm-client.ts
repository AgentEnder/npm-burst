export function getDownloadsByVersion(pkg: string) {
  return fetch(
    `https://api.npmjs.org/versions/${encodeURI(pkg).replace('/', '%2f')}/last-week`
  ).then(async (result) => {
    const json = await result.json();
    return json as {
      downloads: Record<string, number>;
      package: string;
    };
  });
}
