const STORAGE_KEY = 'pos.selectedPackage'
const PACKAGE_CODE = /^[A-Za-z0-9_-]{1,50}$/

/** Only the code is kept: price and features always come from a fresh catalog or quote. */
export const packageSelection = {
  read(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  },
  write(packageCode: string | null) {
    if (!packageCode || !PACKAGE_CODE.test(packageCode)) return
    try {
      sessionStorage.setItem(STORAGE_KEY, packageCode)
    } catch {
      // Preselecting a package is a convenience only.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  },
}
