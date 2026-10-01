/** True when the page is served from this machine. The test room is a development tool, so it only
 *  exists here and is never offered (or mentioned) on the public site. */
export function isLocalHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}
