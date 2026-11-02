// src/lib/storage.ts
// localStorage 접근 래퍼 — 사설 모드/쿼터 초과/손상된 JSON에서도 앱이 죽지 않도록 한다.

const getStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** JSON 값을 읽는다. 없거나 파싱 실패 시 `undefined`. */
export const readJson = (key: string): unknown => {
  const storage = getStorage();
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] "${key}" 값을 읽지 못했습니다. 무시합니다.`, err);
    return undefined;
  }
};

/** JSON 값을 쓴다. 실패하면 false (메모리 상태는 호출자가 유지). */
export const writeJson = (key: string, value: unknown): boolean => {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[storage] "${key}" 저장 실패`, err);
    return false;
  }
};

/** 다른 탭에서 key가 바뀌면 콜백을 호출한다. 해제 함수 반환. */
export const onExternalChange = (key: string, cb: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === key || e.key === null) cb();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};
