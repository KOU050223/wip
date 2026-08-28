export function isDesktopVRDebug(searchParams: URLSearchParams): boolean {
  return searchParams.get("debug") === "1";
}
