import { vi } from 'vitest';
import * as sources from '../../src/shared/dictionary-sources';
import * as parser from '../../src/dictionary/parser';
import * as lookup from '../../src/dictionary/lookup';

// The old corpus supplies parser results directly to focus on routing and request budgets.
// Keep that seam while importing the actual TypeScript modules instead of evaluating scripts.
export function dictionaryRuntime(overrides: Record<string, unknown> = {}) {
  const context = { ...sources, ...parser, ...lookup, ...overrides };
  context.lookupGermanEntry = lookup.createGermanLookup({
    parseVerbformen: (...args) => context.parseVerbformen(...args),
    parseGermanSearchEntries: (...args) => context.parseGermanSearchEntries(...args),
  });
  return new Proxy(context, {
    set(target, key, value) {
      if (key === 'document') { vi.stubGlobal('document', value); return true; }
      return Reflect.set(target, key, value);
    },
    deleteProperty(target, key) {
      if (key === 'document') { vi.unstubAllGlobals(); return true; }
      return Reflect.deleteProperty(target, key);
    },
  });
}
