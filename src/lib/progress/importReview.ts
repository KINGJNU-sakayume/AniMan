// src/lib/progress/importReview.ts
// 다른 화면(동기화 설정)이 "이 백업을 가져오기 미리보기로 검토해 달라"고 요청하는 작은 버스.
// 180일 넘게 동기화하지 않은 기기는 자동 병합하지 않고, 서버 문서를 기존 가져오기 미리보기로 보여 준다.
import type { ProgressBackup } from './backup';
import type { ImportMode } from './store';

export interface ImportReviewRequest {
  backup: ProgressBackup;
  fileName: string;
  /** 미리보기를 열 때 선택해 둘 방식(기본 merge). */
  mode?: ImportMode;
  /** 미리보기 위에 보여 줄 안내 문구. */
  note?: string;
}

type Listener = (request: ImportReviewRequest) => void;
const listeners = new Set<Listener>();
let waiting: ImportReviewRequest | null = null;

export const requestImportReview = (request: ImportReviewRequest) => {
  if (listeners.size === 0) waiting = request;
  else listeners.forEach((l) => l(request));
};

/** 구독하면 기다리던 요청이 있을 때 바로 한 번 전달한다. */
export const subscribeImportReview = (listener: Listener) => {
  listeners.add(listener);
  if (waiting) {
    const request = waiting;
    waiting = null;
    listener(request);
  }
  return () => {
    listeners.delete(listener);
  };
};
