const SENSITIVE_QUERY_KEY_PATTERN =
  /^(?:(?:api|stream|private|secret|access|auth|client)?key)$|^(?:access|auth|id|refresh|session|stream)?token$|^(?:client|stream)?secret$|^(?:pass(?:word|wd)?|pwd)$|^(?:auth(?:orization)?|credential|credentials|jwt|signature|sig)$/;

function normalizedQueryKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function sensitiveQueryKeys(url: URL): string[] {
  return [...url.searchParams.keys()].filter((key) =>
    SENSITIVE_QUERY_KEY_PATTERN.test(normalizedQueryKey(key)),
  );
}

export function hasUrlUserInfo(url: URL): boolean {
  return url.username.length > 0 || url.password.length > 0;
}

export function parseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
