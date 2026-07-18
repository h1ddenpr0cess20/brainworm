const LOOPBACK_IPV4 = /^127(?:\.(?:\d{1,3})){3}$/;

export function isSupportedMcpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;

    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "[::1]" ||
      LOOPBACK_IPV4.test(hostname)
    );
  } catch {
    return false;
  }
}
