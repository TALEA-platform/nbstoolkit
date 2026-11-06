/**
 * Links to the case-study images stored in the repo (public/images/cs_<id>.<ext>),
 * written in the image_github column of the Google Sheet.
 * Same link as githubImageUrl() in google-apps-script.js.
 */

const fs = require('fs');
const path = require('path');

const GITHUB_REPO = 'TALEA-platform/nbstoolkit';
const IMAGES_DIR = path.resolve(__dirname, '../public/images');

/** Name of the local image of a case (e.g. "cs_12.png"), or '' */
function localImageFile(id, dir = IMAGES_DIR) {
  if (!fs.existsSync(dir)) return '';
  const re = new RegExp(`^cs_${id}\\.(png|jpe?g|webp|avif)$`, 'i');
  return fs.readdirSync(dir).find(f => re.test(f)) || '';
}

/** "cs_12.png" → link to the file on GitHub ('' when there is no file) */
function githubImageUrl(file) {
  return file ? `https://github.com/${GITHUB_REPO}/blob/main/public/images/${file}` : '';
}

module.exports = { localImageFile, githubImageUrl, GITHUB_REPO };
