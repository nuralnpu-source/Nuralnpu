import React, { useState, useCallback } from 'react';
import ImageUploader from './ImageUploader';
import { editImage, removeImageBackground } from '../services/geminiService';
import { createImageUrl } from '../utils';

const ImageEditor: React.FC = () => {
  const [originalImageBase64, setOriginalImageBase64] = useState<string | undefined>(undefined);
  const [originalImageMimeType, setOriginalImageMimeType] = useState<string | undefined>(undefined);
  const [editedImageBase64, setEditedImageBase64] = useState<string | undefined>(undefined);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleImageUpload = useCallback((base64: string, mimeType: string) => {
    setOriginalImageBase64(base64);
    setOriginalImageMimeType(mimeType);
    setEditedImageBase64(undefined); // Clear edited image on new upload
    setError(undefined);
  }, []);

  const handleEditImage = useCallback(async () => {
    if (!originalImageBase64 || !originalImageMimeType || !prompt.trim()) {
      setError('Please upload an image and enter a prompt.');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      // For text-based edits, always operate on the original image for now.
      const resultBase64 = await editImage(originalImageBase64, originalImageMimeType, prompt);
      setEditedImageBase64(resultBase64);
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
    } catch (e: any) {
      console.error('Failed to remove background:', e);
      setError(`Failed to remove background: ${e.message || 'Unknown error'}. Please try again.`);
      setEditedImageBase64(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [originalImageBase64, originalImageMimeType]);


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
            disabled={isLoading}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
            <button
            onClick={handleRemoveBackground}
            className="flex-1 bg-purple-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-purple-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={isLoading || !originalImageBase64}
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
            disabled={isLoading || !originalImageBase64 || !prompt.trim()}
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


        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-4 rounded-lg shadow-inner min-h-[300px] lg:min-h-[auto]">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Result</h3>
        {editedImageBase64 && originalImageMimeType ? (
          <img
            src={createImageUrl(editedImageBase64, originalImageMimeType)}
            alt="Edited"
            className="max-w-full h-auto max-h-[500px] object-contain rounded-md shadow-lg border border-gray-200"
          />
        ) : (
          <p className="text-gray-500">Your edited image will appear here.</p>
        )}
      </div>
    </div>
  );
};

export default ImageEditor;