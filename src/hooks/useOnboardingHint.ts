import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY_PREFIX = 'docfai.onboarding.';
const SUPPRESSED_STORAGE_KEY = 'docfai.onboarding.suppressed';

type Registration = { id: string; priority: number };

class OnboardingRegistry {
  private registrations: Registration[] = [];
  private dismissedIds: Set<string> = new Set();
  private suppressed = false;
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      this.suppressed = window.localStorage.getItem(SUPPRESSED_STORAGE_KEY) === 'true';
      this.loadDismissedIds();
    } catch {
      // ignore quota / access errors
    }
  }

  register(reg: Registration) {
    if (this.registrations.some(r => r.id === reg.id)) return;
    this.registrations = [...this.registrations, reg];
    this.emit();
  }

  unregister(id: string) {
    const next = this.registrations.filter(r => r.id !== id);
    if (next.length === this.registrations.length) return;
    this.registrations = next;
    this.emit();
  }

  dismiss(id: string) {
    if (this.dismissedIds.has(id)) return;
    this.dismissedIds.add(id);
    try {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, 'dismissed');
    } catch {
      // ignore
    }
    this.emit();
  }

  isDismissed(id: string) {
    return this.dismissedIds.has(id);
  }

  isSuppressed() {
    return this.suppressed;
  }

  getActiveId(): string | null {
    if (this.suppressed) return null;
    const active = this.registrations.filter(r => !this.dismissedIds.has(r.id));
    if (active.length === 0) return null;
    active.sort((a, b) => b.priority - a.priority);
    return active[0].id;
  }

  toggle() {
    if (this.suppressed) {
      this.suppressed = false;
      this.persistSuppressed();
    } else if (this.getActiveId() !== null) {
      this.suppressed = true;
      this.persistSuppressed();
    } else {
      this.dismissedIds.clear();
      this.removeDismissedKeys();
    }
    this.emit();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  reset() {
    this.suppressed = false;
    this.dismissedIds.clear();
    this.persistSuppressed();
    this.removeDismissedKeys();
    this.emit();
  }

  private loadDismissedIds() {
    this.dismissedIds.clear();
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key?.startsWith(STORAGE_KEY_PREFIX) &&
        key !== SUPPRESSED_STORAGE_KEY &&
        window.localStorage.getItem(key) === 'dismissed'
      ) {
        this.dismissedIds.add(key.slice(STORAGE_KEY_PREFIX.length));
      }
    }
  }

  private removeDismissedKeys() {
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(STORAGE_KEY_PREFIX) && key !== SUPPRESSED_STORAGE_KEY) {
          keys.push(key);
        }
      }
      keys.forEach(k => window.localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }

  private persistSuppressed() {
    try {
      window.localStorage.setItem(SUPPRESSED_STORAGE_KEY, String(this.suppressed));
    } catch {
      // ignore
    }
  }

  private emit() {
    this.listeners.forEach(l => l());
  }
}

const registry = new OnboardingRegistry();

interface HintOptions {
  priority?: number;
  when?: boolean;
}

export function useOnboardingHint(id: string, options: HintOptions = {}) {
  const { priority = 0, when = true } = options;

  useEffect(() => {
    if (!when) return;
    registry.register({ id, priority });
    return () => registry.unregister(id);
  }, [id, priority, when]);

  const activeId = useSyncExternalStore(
    registry.subscribe,
    () => registry.getActiveId(),
    () => null
  );

  const dismiss = useCallback(() => {
    registry.dismiss(id);
  }, [id]);

  return {
    visible: activeId === id && !registry.isDismissed(id),
    dismiss,
  };
}

export function resetAllOnboardingHints() {
  registry.reset();
}

export function toggleAllOnboardingHints() {
  registry.toggle();
}

export function useHintsSuppressed() {
  return useSyncExternalStore(
    registry.subscribe,
    () => registry.isSuppressed(),
    () => false
  );
}
