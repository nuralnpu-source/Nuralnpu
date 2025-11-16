import React, { useState, useCallback, useRef } from 'react';
import ImageUploader from './ImageUploader';
import { editImage, removeImageBackground } from '../services/geminiService';
import { createImageUrl, fileToBase64 } from '../utils'; // Import fileToBase64 from utils
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  Crop,
  PixelCrop,
} from 'react-image-crop';

// Helper function adapted from react-image-crop examples for drawing cropped image to canvas
async function canvasPreview(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  crop: PixelCrop,
  scale = 1,
  rotate = 0,
) {
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  // devicePixelRatio slightly increases sharpness on retina devices
  // at the cost of slight performance degradation
  const pixelRatio = window.devicePixelRatio;

  canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
  canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

  ctx.scale(pixelRatio, pixelRatio);
  ctx.imageSmoothingQuality = 'high';

  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;

  const rotateRads = rotate * Math.PI / 180;
  const centerX = image.naturalWidth / 2;
  const centerY = image.naturalHeight / 2;

  ctx.save();

  // 5) Move the crop origin to the canvas origin (0,0)
  ctx.translate(-cropX, -cropY);
  // 4) Move the canvas origin to the center of the image for smooth rotation
  ctx.translate(centerX, centerY);
  // 3) Rotate around the center
  ctx.rotate(rotateRads);
  // 2) Scale the image
  ctx.scale(scale, scale);
  // 1) Move the canvas origin back to the top left of the image
  ctx.translate(-centerX, -centerY);
  ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, image.naturalWidth, image.naturalHeight);

  ctx.restore();
}

function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, {type:mime});
}


const ImageEditor: React.FC = () => {
  const [originalImageBase64, setOriginalImageBase64] = useState<string | undefined>(undefined);
  const [originalImageMimeType, setOriginalImageMimeType] = useState<string | undefined>(undefined);
  const [editedImageBase64, setEditedImageBase64] = useState<string | undefined>(undefined);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  // Cropping states
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [imageToCropSrc, setImageToCropSrc] = useState<string | undefined>(undefined);
  const [imageToCropMimeType, setImageToCropMimeType] = useState<string | undefined>(undefined);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        undefined, // No fixed aspect ratio for now
        width,
        height,
      ),
      width,
      height,
    ));
  }, []);

  const handleImageUpload = useCallback((base64: string, mimeType: string) => {
    setOriginalImageBase64(base64);
    setOriginalImageMimeType(mimeType);
    setEditedImageBase64(undefined); // Clear edited image on new upload
    setError(undefined);
    setSelectedFilter(null); // Reset filter on new upload
  }, []);

  const handleEditImage = useCallback(async () => {
    if (!originalImageBase64 || !originalImageMimeType || !prompt.trim()) {
      setError('Please upload an image and enter a prompt.');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      const resultBase64 = await editImage(originalImageBase64, originalImageMimeType, prompt);
      setEditedImageBase64(resultBase64);
      setSelectedFilter(null); // Reset filter after AI edit
    } catch (e: any) {
      console.error('Failed to edit image:', e);
      setError(`Failed to edit image: ${e.message || 'Unknown error'}. Please try again.`);
      setEditedImageBase64(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [originalImageBase64, originalImageMimeType, prompt]);

  const handleRemoveBackground = useCallback(async () => {
    if (!originalImageBase64 || !originalImageMimeType) {
      setError('Please upload an image to remove its background.');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      const resultBase64 = await removeImageBackground(originalImageBase64, originalImageMimeType);
      setEditedImageBase64(resultBase64);
      setSelectedFilter(null); // Reset filter after background removal
    } catch (e: any) {
      console.error('Failed to remove background:', e);
      setError(`Failed to remove background: ${e.message || 'Unknown error'}. Please try again.`);
      setEditedImageBase64(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [originalImageBase64, originalImageMimeType]);

  const handleStartCropping = useCallback(() => {
    const currentImage = editedImageBase64 || originalImageBase64;
    const currentMimeType = originalImageMimeType; // Mime type typically doesn't change with edit, use original

    if (currentImage && currentMimeType) {
      setImageToCropSrc(createImageUrl(currentImage, currentMimeType));
      setImageToCropMimeType(currentMimeType);
      setIsCropping(true);
      setError(undefined);
    } else {
      setError('Please upload an image first to crop.');
    }
  }, [originalImageBase64, originalImageMimeType, editedImageBase64]);


  const handleApplyCrop = useCallback(async () => {
    if (imgRef.current && previewCanvasRef.current && completedCrop) {
      await canvasPreview(
        imgRef.current,
        previewCanvasRef.current,
        completedCrop,
      );
      const croppedDataUrl = previewCanvasRef.current.toDataURL(imageToCropMimeType || 'image/png');
      const filename = `cropped-image.${(imageToCropMimeType || 'image/png').split('/')[1]}`;
      const croppedFile = dataURLtoFile(croppedDataUrl, filename);

      try {
        const { base64, mimeType } = await fileToBase64(croppedFile);
        setOriginalImageBase64(base64);
        setOriginalImageMimeType(mimeType);
        setEditedImageBase64(undefined); // Clear edited image as the base has changed
        setIsCropping(false);
        setImageToCropSrc(undefined);
        setImageToCropMimeType(undefined);
        setCompletedCrop(undefined);
        setCrop(undefined);
        setSelectedFilter(null); // Reset filter after cropping
      } catch (e: any) {
        console.error('Error processing cropped image:', e);
        setError(`Failed to process cropped image: ${e.message || 'Unknown error'}.`);
      }
    } else {
      setError('Could not apply crop. Please ensure an image is loaded and a crop area is selected.');
    }
  }, [completedCrop, imageToCropMimeType]);

  const handleCancelCrop = useCallback(() => {
    setIsCropping(false);
    setImageToCropSrc(undefined);
    setImageToCropMimeType(undefined);
    setCompletedCrop(undefined);
    setCrop(undefined);
    setError(undefined);
  }, []);

  const applyFilterToImage = useCallback(async (filterName: string) => {
    const currentImage = editedImageBase64 || originalImageBase64;
    const currentMimeType = originalImageMimeType;

    if (!currentImage || !currentMimeType) {
      setError('No image to apply filter to.');
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const img = new Image();
      img.src = createImageUrl(currentImage, currentMimeType);
      img.crossOrigin = 'Anonymous'; 

      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas 2D context.');
        }

        ctx.drawImage(img, 0, 0);

        if (filterName !== 'none') {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const pixels = imageData.data;

          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];

            switch (filterName) {
              case 'grayscale':
                const avg = (r + g + b) / 3;
                pixels[i] = avg;
                pixels[i + 1] = avg;
                pixels[i + 2] = avg;
                break;
              case 'sepia':
                pixels[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
                pixels[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
                pixels[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
                break;
              case 'invert':
                pixels[i] = 255 - r;
                pixels[i + 1] = 255 - g;
                pixels[i + 2] = 255 - b;
                break;
              default:
                break;
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }

        const newBase64 = canvas.toDataURL(currentMimeType).split(',')[1];
        setEditedImageBase64(newBase64);
        setSelectedFilter(filterName);
        setIsLoading(false);
      };

      img.onerror = () => {
        throw new Error('Failed to load image for filter application.');
      };
    } catch (e: any) {
      console.error('Failed to apply filter:', e);
      setError(`Failed to apply filter: ${e.message || 'Unknown error'}.`);
      setIsLoading(false);
    }
  }, [editedImageBase64, originalImageBase64, originalImageMimeType]);


  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4">
      <div className="flex-1 space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Edit Your Image</h2>
        <ImageUploader label="Source Image" onImageUpload={handleImageUpload} />

        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
            Edit Prompt
          </label>
          <input
            id="prompt"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Add a retro filter, Change sky to sunset"
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
            disabled={isLoading || isCropping}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleRemoveBackground}
            className="flex-1 bg-purple-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-purple-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={isLoading || isCropping || !originalImageBase64}
          >
            {isLoading ? ( // Using isLoading for both buttons, so it will show a single spinner if either is active.
              <svg className="animate-spin h-5 w-5 text-white mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Remove Background'
            )}
          </button>
          <button
            onClick={handleEditImage}
            className="flex-1 bg-blue-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={isLoading || isCropping || !originalImageBase64 || !prompt.trim()}
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Generate Edited Image'
            )}
          </button>
        </div>
        {(originalImageBase64 || editedImageBase64) && (
          <button
            onClick={handleStartCropping}
            className="w-full bg-indigo-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={isLoading || isCropping}
          >
            Crop Image
          </button>
        )}

        <div className="mt-6">
          <h3 className="text-xl font-bold text-gray-800 mb-3">Image Filters</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['none', 'grayscale', 'sepia', 'invert'].map((filter) => (
              <button
                key={filter}
                onClick={() => applyFilterToImage(filter)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
                            ${selectedFilter === filter ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
                            disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={isLoading || isCropping || (!originalImageBase64 && !editedImageBase64)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1).replace('none', 'Original')}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-4 rounded-lg shadow-inner min-h-[300px] lg:min-h-[auto]">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Result</h3>
        {(editedImageBase64 && originalImageMimeType) ? (
          <img
            src={createImageUrl(editedImageBase64, originalImageMimeType)}
            alt="Edited"
            className="max-w-full h-auto max-h-[500px] object-contain rounded-md shadow-lg border border-gray-200"
          />
        ) : (originalImageBase64 && originalImageMimeType) ? (
          <img
            src={createImageUrl(originalImageBase64, originalImageMimeType)}
            alt="Original"
            className="max-w-full h-auto max-h-[500px] object-contain rounded-md shadow-lg border border-gray-200"
          />
        ) : (
          <p className="text-gray-500">Your edited image will appear here.</p>
        )}
      </div>

      {isCropping && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto flex flex-col items-center">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Crop Image</h3>
            <div className="relative w-full flex justify-center items-center mb-6">
              {imageToCropSrc && (
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  className="max-w-full max-h-[60vh]"
                >
                  <img
                    ref={imgRef}
                    alt="Crop source"
                    src={imageToCropSrc}
                    onLoad={onImageLoad}
                    className="max-w-full h-auto block"
                  />
                </ReactCrop>
              )}
            </div>

            <canvas
              ref={previewCanvasRef}
              style={{
                display: 'none', // Hidden canvas used for rendering the cropped image
              }}
            />

            <div className="flex space-x-4 mt-auto w-full justify-center">
              <button
                onClick={handleCancelCrop}
                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-md text-lg font-semibold hover:bg-gray-400 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCrop}
                className="px-6 py-3 bg-indigo-600 text-white rounded-md text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50"
                disabled={!completedCrop?.width || !completedCrop?.height}
              >
                Apply Crop
              </button>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md w-full">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageEditor;