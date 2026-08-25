import { useState, type Dispatch, type SetStateAction } from 'react';

// Resyncs `value` to `computeValue(key)` whenever `key` changes, without a useEffect (React's "adjust state during render" pattern).
export function useKeyedState<K, V>(key: K, computeValue: (key: K) => V): [V, Dispatch<SetStateAction<V>>] {
  const [syncedKey, setSyncedKey] = useState(key);
  const [value, setValue] = useState(() => computeValue(key));

  if (key !== syncedKey) {
    setSyncedKey(key);
    setValue(computeValue(key));
  }

  return [value, setValue];
}
