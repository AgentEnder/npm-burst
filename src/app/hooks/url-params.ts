import { useCallback, useEffect, useState } from 'react';

type URLParamSerializer<T> = {
  serialize: (obj: T) => string | null;
  deserialize: (str: string) => T;
};

type UrlParamOpts<T> = T extends string
  ? string | { defaultValue: T; serializer?: URLParamSerializer<T> }
  : {
      defaultValue: T;
      serializer: URLParamSerializer<T>;
    };

export function useUrlParam<T>(key: string, opts: UrlParamOpts<T>) {
  const { serializer, defaultValue } =
    typeof opts === 'string'
      ? { defaultValue: opts as unknown as T, serializer: null }
      : opts;

  const [val, setValue] = useState(defaultValue);
  const updateValueFromURL = useCallback(() => {
    const params = new URLSearchParams(document.location.search);
    const encoded = params.get(key);
    if (encoded) {
      if (serializer) {
        setValue(serializer.deserialize(encoded));
      } else {
        setValue(encoded as unknown as T);
      }
    }
  }, [key, serializer]);

  useEffect(() => {
    updateValueFromURL();
  }, [updateValueFromURL]);

  window.addEventListener('popstate', () => {
    updateValueFromURL();
  });

  return [
    val,
    (newValue: T) => {
      setValue(newValue);
      const mapped = serializer
        ? serializer.serialize(newValue)
        : // Cast is safe - T must be string if no serializer is provided
          (newValue as unknown as string);
      setQueryParam(key, mapped);
    },
  ] as const;
}

export function setQueryParam(key: string, value: string | null) {
  const urlParams = new URLSearchParams(document.location.search);
  if (value !== null && value !== undefined) {
    urlParams.set(key, value);
  } else {
    urlParams.delete(key);
  }
  window.history.pushState(
    {},
    document.title,
    document.location.href.split('?')[0] + `?` + urlParams.toString()
  );
}
