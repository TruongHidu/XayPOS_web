const REFRESH_TOKEN_KEY = 'pos.refreshToken'

export const tokenStorage = {
  readRefreshToken: () => sessionStorage.getItem(REFRESH_TOKEN_KEY),
  writeRefreshToken: (token: string) => sessionStorage.setItem(REFRESH_TOKEN_KEY, token),
  clearRefreshToken: () => sessionStorage.removeItem(REFRESH_TOKEN_KEY),
}
