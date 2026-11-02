import { useSyncExternalStore } from 'react';
import { getCatalog, subscribeCatalog } from '../lib/catalog';

/** 번들 + 로컬 초안을 합친 시리즈 목록 (created_at 내림차순). */
export const useCatalog = () => useSyncExternalStore(subscribeCatalog, getCatalog, getCatalog);
