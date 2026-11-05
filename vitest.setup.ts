// Node.js 25+ ships native localStorage/sessionStorage stubs that require
// --localstorage-file to work. Without it, getItem/setItem are undefined.
// Override them with proper in-memory implementations so tests have working
// Web Storage.
function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (index) => Array.from(store.keys())[index] ?? null,
  };
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, {
    value: createStorageMock(),
    writable: true,
    configurable: true,
  });
}
