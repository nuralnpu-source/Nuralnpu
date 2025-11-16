import React, { useState, useCallback, useRef, useEffect } from 'react';
import ImageUploader from './ImageUploader';
import { editImage, removeImageBackground } from '../services/geminiService';
import { createImageUrl, fileToBase64 } from '../utils';
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

interface ImageState {
  base64: string;
  mimeType: string;
}

const ImageEditor: React.FC = () => {
  const [imageHistory, setImageHistory] = useState<ImageState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [outputResolution, setOutputResolution] = useState<string>('original'); // New state for resolution

  // Cropping states
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [imageToCropSrc, setImageToCropSrc] = useState<string | undefined>(undefined);
  const [imageToCropMimeType, setImageToCropMimeType] = useState<string | undefined>(undefined);

  // Logo Overlay states
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [logoMimeType, setLogoMimeType] = useState<string | undefined>(undefined);
  const [showLogoOverlay, setShowLogoOverlay] = useState<boolean>(false);
  const [logoScale, setLogoScale] = useState<number>(0.3); // 0.1 to 1.0, relative to image width/height
  const [logoPosition, setLogoPosition] = useState<{ x: number; y: number }>({ x: 50, y: 50 }); // % from top-left
  const [isDraggingLogo, setIsDraggingLogo] = useState<boolean>(false);
  const logoRef = useRef<HTMLImageElement>(null);
  const resultImageContainerRef = useRef<HTMLDivElement>(null);

  const currentImageState = imageHistory[historyIndex];
  const currentDisplayImageSrc = currentImageState
    ? createImageUrl(currentImageState.base64, currentImageState.mimeType)
    : undefined;
  const currentDisplayImageBase64 = currentImageState?.base64;
  const currentDisplayImageMimeType = currentImageState?.mimeType;

  const resetLogoOverlayStates = useCallback(() => {
    setLogoBase64(undefined);
    setLogoMimeType(undefined);
    setShowLogoOverlay(false);
    setLogoScale(0.3);
    setLogoPosition({ x: 50, y: 50 });
    setIsDraggingLogo(false);
  }, []);

  const resetEditingStates = useCallback(() => {
    setPrompt('');
    setSelectedFilter(null);
    setOutputResolution('original');
    resetLogoOverlayStates();
  }, [resetLogoOverlayStates]);

  const pushToHistory = useCallback((base64: string, mimeType: string) => {
    setImageHistory(prevHistory => {
      // Truncate history if we're not at the end (i.e., we undid some actions)
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      return [...newHistory, { base64, mimeType }];
    });
    setHistoryIndex(prevIndex => prevIndex + 1);
  }, [historyIndex]);

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
    pushToHistory(base64, mimeType);
    resetEditingStates();
    setError(undefined);
  }, [pushToHistory, resetEditingStates]);

  const handleLogoUpload = useCallback((base64: string, mimeType: string) => {
    setLogoBase64(base64);
    setLogoMimeType(mimeType);
    setShowLogoOverlay(true); // Show logo by default on upload
    setLogoScale(0.3); // Reset scale
    setLogoPosition({ x: 50, y: 50 }); // Reset position to center initially
    setError(undefined);
  }, []);

  const handleEditImage = useCallback(async () => {
    if (!currentDisplayImageBase64 || !currentDisplayImageMimeType || !prompt.trim()) {
      setError('Please upload an image and enter a prompt.');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      const resultBase64 = await editImage(currentDisplayImageBase64, currentDisplayImageMimeType, prompt, outputResolution);
      pushToHistory(resultBase64, currentDisplayImageMimeType);
      resetEditingStates();
    } catch (e: any) {
      console.error('Failed to edit image:', e);
      setError(`Failed to edit image: ${e.message || 'Unknown error'}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  }, [currentDisplayImageBase64, currentDisplayImageMimeType, prompt, outputResolution, pushToHistory, resetEditingStates]);

  const handleRemoveBackground = useCallback(async () => {
    if (!currentDisplayImageBase64 || !currentDisplayImageMimeType) {
      setError('Please upload an image to remove its background.');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      const resultBase64 = await removeImageBackground(currentDisplayImageBase64, currentDisplayImageMimeType, outputResolution);
      pushToHistory(resultBase64, currentDisplayImageMimeType);
      resetEditingStates();
    } catch (e: any) {
      console.error('Failed to remove background:', e);
      setError(`Failed to remove background: ${e.message || 'Unknown error'}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  }, [currentDisplayImageBase64, currentDisplayImageMimeType, outputResolution, pushToHistory, resetEditingStates]);

  const handleStartCropping = useCallback(() => {
    if (currentDisplayImageBase64 && currentDisplayImageMimeType) {
      setImageToCropSrc(createImageUrl(currentDisplayImageBase64, currentDisplayImageMimeType));
      setImageToCropMimeType(currentDisplayImageMimeType);
      setIsCropping(true);
      setError(undefined);
    } else {
      setError('Please upload an image first to crop.');
    }
  }, [currentDisplayImageBase64, currentDisplayImageMimeType]);

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
        pushToHistory(base64, mimeType);
        setIsCropping(false);
        setImageToCropSrc(undefined);
        setImageToCropMimeType(undefined);
        setCompletedCrop(undefined);
        setCrop(undefined);
        resetEditingStates();
      } catch (e: any) {
        console.error('Error processing cropped image:', e);
        setError(`Failed to process cropped image: ${e.message || 'Unknown error'}.`);
      }
    } else {
      setError('Could not apply crop. Please ensure an image is loaded and a crop area is selected.');
    }
  }, [completedCrop, imageToCropMimeType, pushToHistory, resetEditingStates]);

  const handleCancelCrop = useCallback(() => {
    setIsCropping(false);
    setImageToCropSrc(undefined);
    setImageToCropMimeType(undefined);
    setCompletedCrop(undefined);
    setCrop(undefined);
    setError(undefined);
  }, []);

  const applyFilterToImage = useCallback(async (filterName: string) => {
    if (!currentDisplayImageBase64 || !currentDisplayImageMimeType) {
      setError('No image to apply filter to.');
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const img = new Image();
      img.src = createImageUrl(currentDisplayImageBase64, currentDisplayImageMimeType);
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

        const newBase64 = canvas.toDataURL(currentDisplayImageMimeType).split(',')[1];
        pushToHistory(newBase64, currentDisplayImageMimeType);
        setSelectedFilter(filterName);
        setIsLoading(false);
        resetLogoOverlayStates();
      };

      img.onerror = () => {
        throw new Error('Failed to load image for filter application.');
      };
    } catch (e: any) {
      console.error('Failed to apply filter:', e);
      setError(`Failed to apply filter: ${e.message || 'Unknown error'}.`);
      setIsLoading(false);
    }
  }, [currentDisplayImageBase64, currentDisplayImageMimeType, pushToHistory, resetLogoOverlayStates]);

  // Logo Dragging Logic
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!logoRef.current || !resultImageContainerRef.current) return;
    e.preventDefault();
    setIsDraggingLogo(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingLogo || !logoRef.current || !resultImageContainerRef.current) return;

    const containerRect = resultImageContainerRef.current.getBoundingClientRect();
    const logoRect = logoRef.current.getBoundingClientRect();

    let newX = e.clientX - containerRect.left - (logoRect.width / 2);
    let newY = e.clientY - containerRect.top - (logoRect.height / 2);

    // Constrain movement within the container
    newX = Math.max(0, Math.min(newX, containerRect.width - logoRect.width));
    newY = Math.max(0, Math.min(newY, containerRect.height - logoRect.height));

    // Convert to percentage
    setLogoPosition({
      x: (newX / containerRect.width) * 100,
      y: (newY / containerRect.height) * 100,
    });
  }, [isDraggingLogo]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingLogo(false);
  }, []);

  useEffect(() => {
    // Attach and detach global mousemove/mouseup listeners for dragging
    if (isDraggingLogo) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLogo, handleMouseMove, handleMouseUp]);


  const handleApplyLogoOverlay = useCallback(async () => {
    if (!currentDisplayImageBase64 || !currentDisplayImageMimeType || !logoBase64 || !logoMimeType || !logoRef.current) {
      setError('Please ensure a main image and a logo are loaded before applying the overlay.');
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const mainImgElement = new Image();
      mainImgElement.src = createImageUrl(currentDisplayImageBase64, currentDisplayImageMimeType);
      mainImgElement.crossOrigin = 'Anonymous';

      mainImgElement.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = mainImgElement.width;
        canvas.height = mainImgElement.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas 2D context for logo overlay.');
        }

        ctx.drawImage(mainImgElement, 0, 0); // Draw main image first

        // Get the natural size of the logo itself, not its scaled size in the DOM
        const naturalLogoWidth = logoRef.current.naturalWidth;
        const naturalLogoHeight = logoRef.current.naturalHeight;

        // Calculate logo's desired display width/height based on logoScale
        // For simplicity, let's scale relative to the main image's width for now.
        // A more complex approach might involve comparing logo to min(width, height) or average.
        const scaledLogoWidth = naturalLogoWidth * logoScale;
        const scaledLogoHeight = naturalLogoHeight * logoScale;

        // Calculate position based on percentages and canvas dimensions
        const logoX = (logoPosition.x / 100) * canvas.width;
        const logoY = (logoPosition.y / 100) * canvas.height;

        ctx.drawImage(logoRef.current, logoX, logoY, scaledLogoWidth, scaledLogoHeight); // Draw logo on top

        const newBase64 = canvas.toDataURL(currentDisplayImageMimeType).split(',')[1];
        pushToHistory(newBase64, currentDisplayImageMimeType);
        setShowLogoOverlay(false); // Hide overlay after baking it in
        setIsLoading(false);
      };

      mainImgElement.onerror = () => {
        throw new Error('Failed to load main image for logo overlay application.');
      };
    } catch (e: any) {
      console.error('Failed to apply logo overlay:', e);
      setError(`Failed to apply logo overlay: ${e.message || 'Unknown error'}.`);
      setIsLoading(false);
    }
  }, [currentDisplayImageBase64, currentDisplayImageMimeType, logoBase64, logoMimeType, logoScale, logoPosition, pushToHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prevIndex => prevIndex - 1);
      setError(undefined);
      resetEditingStates();
    }
  }, [historyIndex, resetEditingStates]);

  const handleRedo = useCallback(() => {
    if (historyIndex < imageHistory.length - 1) {
      setHistoryIndex(prevIndex => prevIndex + 1);
      setError(undefined);
      resetEditingStates();
    }
  }, [historyIndex, imageHistory.length, resetEditingStates]);


  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4">
      <div className="flex-1 space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Edit Your Image</h2>
        <ImageUploader
          label="Source Image"
          onImageUpload={handleImageUpload}
          currentImageBase64={currentDisplayImageBase64}
          currentImageMimeType={currentDisplayImageMimeType}
        />

        <div className="flex gap-4 mt-6">
          <button
            onClick={handleUndo}
            className="flex-1 bg-gray-500 text-white py-3 rounded-md text-lg font-semibold hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={historyIndex <= 0 || isLoading || isCropping}
            aria-label="Undo last change"
          >
            Undo
          </button>
          <button
            onClick={handleRedo}
            className="flex-1 bg-gray-500 text-white py-3 rounded-md text-lg font-semibold hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={historyIndex >= imageHistory.length - 1 || isLoading || isCropping}
            aria-label="Redo last undone change"
          >
            Redo
          </button>
        </div>


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
            disabled={isLoading || isCropping || !currentDisplayImageBase64}
            aria-label="Image editing prompt"
          />
        </div>

        {/* Resolution Selection */}
        <div className="mt-6">
          <h3 className="text-xl font-bold text-gray-800 mb-3">Output Resolution</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['original', '720p', '1080p', '4K'].map((resolution) => (
              <button
                key={resolution}
                onClick={() => setOutputResolution(resolution)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
                            ${outputResolution === resolution ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
                            disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={isLoading || isCropping || !currentDisplayImageBase64}
                aria-pressed={outputResolution === resolution}
              >
                {resolution.charAt(0).toUpperCase() + resolution.slice(1).replace('original', 'Original (no resize)')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleRemoveBackground}
            className="flex-1 bg-purple-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-purple-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={isLoading || isCropping || !currentDisplayImageBase64}
            aria-label="Remove background from image"
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
            disabled={isLoading || isCropping || !currentDisplayImageBase64 || !prompt.trim()}
            aria-label="Generate edited image based on prompt"
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
        {currentDisplayImageBase64 && (
          <button
            onClick={handleStartCropping}
            className="w-full bg-indigo-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={isLoading || isCropping}
            aria-label="Open image cropping tool"
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
                disabled={isLoading || isCropping || !currentDisplayImageBase64}
                aria-pressed={selectedFilter === filter}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1).replace('none', 'Original')}
              </button>
            ))}
          </div>
        </div>

        {/* Logo Overlay Section */}
        <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
          <h3 className="text-xl font-bold text-gray-800 mb-3">Logo Overlay</h3>
          <ImageUploader label="Upload Logo" onImageUpload={handleLogoUpload} currentImageBase64={logoBase64} currentImageMimeType={logoMimeType}/>
          {logoBase64 && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="showLogo" className="text-base font-medium text-gray-700 cursor-pointer">
                  Show Logo Overlay
                </label>
                <input
                  type="checkbox"
                  id="showLogo"
                  checked={showLogoOverlay}
                  onChange={(e) => setShowLogoOverlay(e.target.checked)}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                  disabled={isLoading || isCropping}
                  aria-label="Toggle logo overlay visibility"
                />
              </div>

              {showLogoOverlay && (
                <>
                  <div>
                    <label htmlFor="logoSize" className="block text-sm font-medium text-gray-700 mb-2">
                      Logo Size: {Math.round(logoScale * 100)}%
                    </label>
                    <input
                      id="logoSize"
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={logoScale}
                      onChange={(e) => setLogoScale(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-sm"
                      disabled={isLoading || isCropping}
                      aria-valuenow={logoScale * 100}
                      aria-valuemin={10}
                      aria-valuemax={100}
                      aria-label="Adjust logo size"
                    />
                  </div>
                  <button
                    onClick={handleApplyLogoOverlay}
                    className="w-full bg-orange-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-orange-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    disabled={isLoading || isCropping || !currentDisplayImageSrc || !logoBase64}
                    aria-label="Apply logo overlay to main image"
                  >
                    Apply Logo Overlay
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-4 rounded-lg shadow-inner min-h-[300px] lg:min-h-[auto]">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Result</h3>
        {currentDisplayImageSrc ? (
          <div ref={resultImageContainerRef} className="relative max-w-full h-auto max-h-[500px] object-contain rounded-md shadow-lg border border-gray-200 group">
            <img
              src={currentDisplayImageSrc}
              alt="Edited"
              className="max-w-full h-auto block"
            />
            {showLogoOverlay && logoBase64 && logoMimeType && (
              <img
                ref={logoRef}
                src={createImageUrl(logoBase64, logoMimeType)}
                alt="Logo Overlay"
                className={`absolute cursor-grab ${isDraggingLogo ? 'cursor-grabbing border-2 border-blue-500 shadow-lg' : 'hover:border-2 hover:border-blue-300'}`}
                style={{
                  left: `${logoPosition.x}%`,
                  top: `${logoPosition.y}%`,
                  transform: 'translate(-50%, -50%)', // Center the logo on the cursor position
                  width: `${logoScale * 100}%`, // Adjust based on result image width
                  maxWidth: '100%',
                  height: 'auto',
                }}
                onMouseDown={handleMouseDown}
                draggable="false" // Prevent native browser drag
                aria-label="Draggable logo overlay"
              />
            )}
          </div>
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
                aria-label="Cancel image cropping"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCrop}
                className="px-6 py-3 bg-indigo-600 text-white rounded-md text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50"
                disabled={!completedCrop?.width || !completedCrop?.height}
                aria-label="Apply crop to image"
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