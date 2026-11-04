const fs = require('node:fs');
const english = JSON.parse(fs.readFileSync('_locales/en/messages.json', 'utf8'));

// Emulate the browser API at the test boundary, including default-locale fallback.
function browserI18n(overrides = {}) {
  return {
    getMessage(key, substitutions = []) {
      const entry = overrides[key] || english[key];
      if (!entry) return '';
      const values = Array.isArray(substitutions) ? substitutions : [substitutions];
      return entry.message.replace(/\$([a-z_]+)\$|\$(\d)|\$\$/gi, (match, name, position) => {
        if (match === '$$') return '$';
        const content = name ? entry.placeholders?.[name.toLowerCase()]?.content || '' : `$${position}`;
        return content.replace(/\$(\d)/g, (_, index) => String(values[Number(index) - 1] ?? ''));
      });
    },
  };
}

module.exports = { browserI18n, english };
