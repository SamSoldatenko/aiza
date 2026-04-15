// Node.js 25+ ships a native localStorage stub that requires --localstorage-file
// to work. Without it, getItem/setItem are undefined. Override it with a
// proper in-memory implementation so tests have working Web Storage.
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (index) => Array.from(store.keys())[index] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
