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
