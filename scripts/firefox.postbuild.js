import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve('dist/firefox/manifest.json');

fs.readFile(manifestPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading manifest file:', err);
    return;
  }

  try {
    const manifest = JSON.parse(data);

    function removeUseDynamicUrl(obj) {
      if (Array.isArray(obj)) {
        obj.forEach(removeUseDynamicUrl);
      } else if (obj && typeof obj === 'object') {
        if (obj.use_dynamic_url !== undefined) {
          delete obj.use_dynamic_url;
        }
        Object.values(obj).forEach(removeUseDynamicUrl);
      }
    }

    removeUseDynamicUrl(manifest);

    fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8', (err) => {
      if (err) {
        console.error('Error writing manifest file:', err);
      } else {
        console.log('Successfully removed `use_dynamic_url` properties from manifest.');
      }
    });

  } catch (err) {
    console.error('Error parsing manifest file:', err);
  }
});
