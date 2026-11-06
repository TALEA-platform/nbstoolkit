/**
 * Copies the allowed values of the filters (src/data/filterConfig.js) into
 * google-apps-script.js, between the <generated-lists> markers, so the
 * Google Sheet validates and offers exactly the values used by the website.
 *
 * Run it after changing filterConfig.js, then paste the script in the Sheet
 * again (see Administrator_Setup_guide.md, 2.3):
 *   node scripts/build-apps-script-lists.js           # update the file
 *   node scripts/build-apps-script-lists.js --check   # exit 1 if out of date
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILTER_CONFIG = path.join(ROOT, 'src/data/filterConfig.js');
const APPS_SCRIPT = path.join(ROOT, 'google-apps-script.js');
const START = '// <generated-lists>';
const END = '// </generated-lists>';

function loadFilterConfig() {
  const src = fs.readFileSync(FILTER_CONFIG, 'utf8').replace(/export const /g, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return { FILTER_CATEGORIES, FIELDS_WITH_OTHER };`)();
}

function buildBlock() {
  const { FILTER_CATEGORIES, FIELDS_WITH_OTHER } = loadFilterConfig();
  const lists = {};
  const labels = {};
  for (const [key, cat] of Object.entries(FILTER_CATEGORIES)) {
    if (!['object', 'value', 'array'].includes(cat.type)) continue; // e.g. "innovation" is not a column
    lists[key] = cat.options;
    labels[key] = cat.label;
  }
  // One line per column
  const json = obj => {
    const lines = Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return `{\n${lines.join(',\n')}\n}`;
  };
  return [
    `${START} Do not edit by hand: run \`node scripts/build-apps-script-lists.js\``,
    `const LISTS = ${json(lists)};`,
    `const LIST_LABELS = ${json(labels)};`,
    `const FIELDS_WITH_OTHER = ${JSON.stringify(FIELDS_WITH_OTHER)};`,
    END,
  ].join('\n');
}

function main() {
  const code = fs.readFileSync(APPS_SCRIPT, 'utf8');
  const start = code.indexOf(START);
  const end = code.indexOf(END);
  if (start === -1 || end === -1) throw new Error(`Markers ${START} / ${END} not found in google-apps-script.js`);
  const next = code.slice(0, start) + buildBlock() + code.slice(end + END.length);
  if (process.argv.includes('--check')) {
    if (next !== code) {
      console.error('google-apps-script.js lists are out of date: run node scripts/build-apps-script-lists.js');
      process.exit(1);
    }
    console.log('google-apps-script.js lists are up to date.');
    return;
  }
  if (next !== code) fs.writeFileSync(APPS_SCRIPT, next, 'utf8');
  console.log(next !== code ? 'Updated the lists in google-apps-script.js' : 'Lists already up to date.');
}

module.exports = { buildBlock };

if (require.main === module) main();
