// Image hosting utility
// Uploads images to imgbb (free image hosting) and returns the URL.
// Configure via REACT_APP_IMGBB_API_KEY in your .env file.
// Get a free API key at https://api.imgbb.com/
//
// If no API key is configured, falls back to keeping the DataURL.

const IMGBB_API_KEY = process.env.REACT_APP_IMGBB_API_KEY || '';

/**
 * Convert a DataURL image to JPEG DataURL using canvas.
 * Reduces file size significantly for PNG uploads.
 */
function convertToJpeg(dataURL, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      // White background (JPEG has no transparency)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataURL); // fallback to original
    img.src = dataURL;
  });
}

/**
 * Extract base64 data from a DataURL string
 */
function dataURLToBase64(dataURL) {
  if (!dataURL || !dataURL.startsWith('data:')) return null;
  const parts = dataURL.split(',');
  return parts.length > 1 ? parts[1] : null;
}

/**
 * Upload an image to imgbb and return the hosted URL.
 * Converts to JPEG first to reduce file size.
 * @param {string} dataURL - The image as a DataURL (base64-encoded)
 * @param {string} name - Optional image name
 * @returns {Promise<{url: string, deleteUrl: string}|null>}
 */
export async function uploadImage(dataURL, name = 'talea_submission') {
  if (!IMGBB_API_KEY) {
    console.warn('imgbb API key not configured — image will be stored as DataURL');
    return null;
  }

  // Convert to JPEG before uploading
  const jpegDataURL = await convertToJpeg(dataURL);
  const base64 = dataURLToBase64(jpegDataURL);
  if (!base64) return null;

  const formData = new FormData();
  formData.append('key', IMGBB_API_KEY);
  formData.append('image', base64);
  formData.append('name', name);

  try {
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      console.error('imgbb upload failed:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.success && data.data) {
      return {
        url: data.data.url,
        deleteUrl: data.data.delete_url,
      };
    }
    return null;
  } catch (err) {
    console.error('Image upload error:', err);
    return null;
  }
}

/**
 * Process form image: upload to hosting if configured, otherwise keep DataURL
 * @param {object} formData - The form data object
 * @returns {Promise<object>} - Updated form data with image URL instead of DataURL
 */
export async function processFormImage(formData) {
  if (!formData.image || !formData.image.startsWith('data:')) {
    return formData;
  }

  const result = await uploadImage(formData.image, `talea_${formData.title || 'new'}`);
  if (result && result.url) {
    return { ...formData, image: result.url, image_delete_url: result.deleteUrl };
  }

  // Fallback: keep DataURL
  return formData;
}
