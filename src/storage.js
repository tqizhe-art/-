import { STORAGE_KEY } from './constants.js';

export function saveState(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
