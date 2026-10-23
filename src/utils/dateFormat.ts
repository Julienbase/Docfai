/**
 * European date/time formatting utilities for export documents.
 * Format: DD/MM/YYYY HH:mm
 */

function padZero(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a Date as European date+time: DD/MM/YYYY HH:mm
 */
export function formatEuropeanDateTime(date: Date): string {
  const day = padZero(date.getDate());
  const month = padZero(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = padZero(date.getHours());
  const minutes = padZero(date.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Format a Date as European date only: DD/MM/YYYY
 */
export function formatEuropeanDate(date: Date): string {
  const day = padZero(date.getDate());
  const month = padZero(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format a timestamp (ms or s) as European time: HH:mm:ss
 */
export function formatEuropeanTime(timestamp: number): string {
  const ms = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  const hours = padZero(date.getHours());
  const minutes = padZero(date.getMinutes());
  const seconds = padZero(date.getSeconds());
  return `${hours}:${minutes}:${seconds}`;
}
