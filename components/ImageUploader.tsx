import React, { useState, useCallback, useRef } from 'react';
import { fileToBase64, createImageUrl } from '../utils';

interface ImageUploaderProps {
  label: string;
  onImageUpload: (base64: string, mimeType: string) => void;
  currentImageBase64?: string;
  currentImageMimeType?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  label,
  onImageUpload,
  currentImageBase64,
  currentImageMimeType,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    currentImageBase64 && currentImageMimeType
      ? createImageUrl(currentImageBase64, currentImageMimeType)
      : undefined
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const { base64, mimeType } = await fileToBase64(file);
        setPreviewUrl(createImageUrl(base64, mimeType));
        onImageUpload(base64, mimeType);
      } catch (error) {
        console.error('Error converting file to base64:', error);
        alert('Failed to load image. Please try again.');
        setPreviewUrl(undefined);
      }
    }
  }, [onImageUpload]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');

    const file = event.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
      const changeEvent = new Event('change', { bubbles: true });
      fileInputRef.current.dispatchEvent(changeEvent);
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
      <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 sr-only">
        {label}
      </label>
      <div
        className="w-full h-48 flex items-center justify-center cursor-pointer relative group"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-full max-w-full object-contain rounded-md shadow-sm"
            />
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-md">
              <span className="text-white text-lg font-semibold">Change {label}</span>
            </div>
          </>
        ) : (
          <div className="text-center text-gray-500">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-1 text-sm">{label} (Drag & Drop or Click to Upload)</p>
          </div>
        )}
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
          ref={fileInputRef}
        />
      </div>
    </div>
  );
};

export default ImageUploader;
