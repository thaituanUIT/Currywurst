import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import catalog from '../_locales/en/messages.json';

export const english = catalog;
export function browserI18n(overrides: Record<string, { message: string; placeholders?: Record<string, { content: string }> }> = {}) {
  return {
    getMessage(key: string, substitutions: string[] = []) {
      const entry = overrides[key] || (catalog as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>)[key];
      if (!entry) return '';
      return entry.message.replace(/\$([a-z_]+)\$|\$(\d)|\$\$/gi, (match: string, name: string, position: string) => {
        if (match === '$$') return '$';
        const content = name ? entry.placeholders?.[name.toLowerCase()]?.content || '' : `$${position}`;
        return content.replace(/\$(\d)/g, (_, index: string) => String(substitutions[Number(index) - 1] ?? ''));
      });
    },
  };
}

vi.stubGlobal('chrome', { i18n: browserI18n() });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.stubGlobal('chrome', { i18n: browserI18n() }); });
