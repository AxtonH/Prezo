/**
 * True only when Office.js is present and the add-in is running in PowerPoint.
 * When Office is not loaded, optional chaining must not compare undefined === undefined
 * (that would incorrectly return true and hide the web SideNav).
 */
export function isPowerPointAddinHost(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const office = window.Office
  if (office == null || office.context?.host == null || office.HostType == null) {
    return false
  }
  return office.context.host === office.HostType.PowerPoint
}
