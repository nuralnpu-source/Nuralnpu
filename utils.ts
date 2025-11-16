export const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const [mimeTypePart, base64Data] = reader.result.split(',');
        const mimeType = mimeTypePart.split(':')[1].split(';')[0];
        resolve({ base64: base64Data, mimeType });
      } else {
        reject(new Error("Failed to read file as data URL."));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

export const createImageUrl = (base64Data: string, mimeType: string): string => {
    return `data:${mimeType};base64,${base64Data}`;
};

interface TargetResolutionDimensions {
  targetMaxDimension: number;
}

const RESOLUTION_MAP: { [key: string]: TargetResolutionDimensions } = {
  'original': { targetMaxDimension: -1 }, // Sentinel value for no resizing
  '720p': { targetMaxDimension: 1280 },
  '1080p': { targetMaxDimension: 1920 },
  '4K': { targetMaxDimension: 3840 },
};

export const resizeImageBase64 = (
  base64Data: string,
  mimeType: string,
  resolutionKey: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const target = RESOLUTION_MAP[resolutionKey];

    if (!target || target.targetMaxDimension === -1) {
      // If resolutionKey is 'original' or unrecognized, return original image
      return resolve(base64Data);
    }

    const img = new Image();
    img.src = createImageUrl(base64Data, mimeType);
    img.crossOrigin = 'Anonymous'; // Required for cross-origin images on canvas

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error('Could not get canvas 2D context for resizing.'));
      }

      let newWidth = img.width;
      let newHeight = img.height;
      const targetMaxDim = target.targetMaxDimension;

      // Only resize if current dimensions are different from target dimensions
      // Scale to fit the targetMaxDim while maintaining aspect ratio
      const aspectRatio = img.width / img.height;

      if (img.width > targetMaxDim || img.height > targetMaxDim) {
          // If either dimension is larger than the target max, scale down
          if (img.width / targetMaxDim > img.height / targetMaxDim) {
              newWidth = targetMaxDim;
              newHeight = targetMaxDim / aspectRatio;
          } else {
              newHeight = targetMaxDim;
              newWidth = targetMaxDim * aspectRatio;
          }
      } else if (img.width < targetMaxDim && img.height < targetMaxDim) {
          // If both dimensions are smaller than target max, upscale
          if (img.width / targetMaxDim < img.height / targetMaxDim) { // Image is "taller" relative to target
             newHeight = targetMaxDim;
             newWidth = targetMaxDim * aspectRatio;
          } else { // Image is "wider" relative to target
             newWidth = targetMaxDim;
             newHeight = targetMaxDim / aspectRatio;
          }
      }

      // Round dimensions to nearest integer
      newWidth = Math.round(newWidth);
      newHeight = Math.round(newHeight);

      // Ensure dimensions are positive
      if (newWidth <= 0) newWidth = 1;
      if (newHeight <= 0) newHeight = 1;

      canvas.width = newWidth;
      canvas.height = newHeight;

      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      const resizedDataUrl = canvas.toDataURL(mimeType);
      resolve(resizedDataUrl.split(',')[1]); // Return base64 part
    };

    img.onerror = (error) => {
      reject(new Error(`Failed to load image for resizing: ${error}`));
    };
  });
};
