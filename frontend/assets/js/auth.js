const STORAGE_KEY = 'soloshop-auth';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, refreshToken: null };
    const parsed = JSON.parse(raw);
    return {
      user: parsed.user ?? null,
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
    };
  } catch {
    return { user: null, accessToken: null, refreshToken: null };
  }
}

let state = load();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const Auth = {
  getUser() {
    return state.user;
  },
  getAccessToken() {
    return state.accessToken;
  },
  getRefreshToken() {
    return state.refreshToken;
  },
  setAuth(user, accessToken, refreshToken) {
    state = { user, accessToken, refreshToken };
    persist();
  },
  setUser(user) {
    state = { ...state, user };
    persist();
  },
  setAccessToken(accessToken) {
    state = { ...state, accessToken };
    persist();
  },
  clear() {
    state = { user: null, accessToken: null, refreshToken: null };
    persist();
  },
};
