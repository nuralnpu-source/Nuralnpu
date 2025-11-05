import React, { useState, useCallback } from 'react';
import ImageUploader from './ImageUploader';
import { generateImageWithLogo } from '../services/geminiService';
import { createImageUrl } from '../utils';

interface Mockup {
  id: string;
  base64: string;
  mimeType: string; // Store original mimeType
  prompt: string;
}

const productPrompts = [
  "A white t-shirt with the logo centered on the chest, worn by a diverse group of people in a city park, soft lighting.",
  "A sleek black ceramic coffee mug with the logo prominently displayed, on a wooden desk with a laptop and plant.",
  "A comfortable navy blue hoodie with the logo embroidered on the left chest, model standing against a brick wall.",
  "A stylish tote bag made of natural canvas with the logo printed large on one side, carried by a person walking in a market.",
  "A custom baseball cap with the logo on the front, being worn by someone enjoying an outdoor activity like hiking.",
];

const MerchMockupGenerator: React.FC = () => {
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [logoMimeType, setLogoMimeType] = useState<string | undefined>(undefined);
  const [mockups, setMockups] = useState<Mockup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [exportFormat, setExportFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [jpegQuality, setJpegQuality] = useState<number>(90); // 0-100

  const handleLogoUpload = useCallback((base64: string, mimeType: string) => {
    setLogoBase64(base64);
    setLogoMimeType(mimeType);
    setMockups([]);
    setError(undefined);
  }, []);

  const handleGenerateMockups = useCallback(async () => {
    if (!logoBase64 || !logoMimeType) {
      setError('Please upload your logo first.');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    setMockups([]);

    const generatedResults: Mockup[] = [];
    for (const prompt of productPrompts) {
      try {
        const { base64, mimeType } = await generateImageWithLogo(logoBase64, logoMimeType, prompt);
        generatedResults.push({
          id: `${Date.now()}-${Math.random()}`,
          base64: base64,
          mimeType: mimeType, // Use the mimeType returned by the service
          prompt: prompt,
        });
      } catch (e: any) {
        console.error(`Failed to generate mockup for prompt "${prompt}":`, e);
        setError(`Failed to generate some mockups: ${e.message || 'Unknown error'}. Please check your logo and try again.`);
      }
    }
    setMockups(generatedResults);
    setIsLoading(false);
  }, [logoBase64, logoMimeType]);

  const convertAndDownloadImage = useCallback((
    originalBase64: string,
    originalMimeType: string,
    filename: string,
    format: 'jpeg' | 'png',
    quality: number
  ) => {
    const img = new Image();
    img.src = createImageUrl(originalBase64, originalMimeType);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        let finalDataUrl;
        let finalMimeType;
        let finalFilename = filename;

        if (format === 'png') {
          finalDataUrl = canvas.toDataURL('image/png');
          finalMimeType = 'image/png';
          finalFilename += '.png';
        } else { // jpeg
          finalDataUrl = canvas.toDataURL('image/jpeg', quality / 100);
          finalMimeType = 'image/jpeg';
          finalFilename += '.jpeg';
        }

        const link = document.createElement('a');
        link.href = finalDataUrl;
        link.download = finalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };
    img.onerror = (err) => {
      console.error("Error loading image for conversion:", err);
      alert("Failed to prepare image for download. Check console for details.");
    };
  }, []);

  const handleDownloadSingleMockup = useCallback((mockup: Mockup) => {
    const filename = `merch-mockup-${mockup.id}`;
    convertAndDownloadImage(mockup.base64, mockup.mimeType, filename, exportFormat, jpegQuality);
  }, [convertAndDownloadImage, exportFormat, jpegQuality]);

  const handleBulkDownload = useCallback(async () => {
    if (mockups.length === 0) {
      alert('No mockups to download.');
      return;
    }
    setIsLoading(true);
    // Add a small delay between downloads to prevent browser blocking
    for (const mockup of mockups) {
      const filename = `merch-mockup-${mockup.id}`;
      convertAndDownloadImage(mockup.base64, mockup.mimeType, filename, exportFormat, jpegQuality);
      await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
    }
    setIsLoading(false);
    alert('All mockups have been downloaded!');
  }, [mockups, convertAndDownloadImage, exportFormat, jpegQuality]);


  return (
    <div className="flex flex-col gap-6 p-4">
      <h2 className="text-2xl font-bold text-gray-800">Generate Merch Mockups</h2>
      <ImageUploader label="Your Logo" onImageUpload={handleLogoUpload} />

      <button
        onClick={handleGenerateMockups}
        className="w-full bg-green-600 text-white py-3 rounded-md text-lg font-semibold hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        disabled={isLoading || !logoBase64}
      >
        {isLoading ? (
          <svg className="animate-spin h-5 w-5 text-white mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        ) : (
          `Generate ${productPrompts.length} Mockups`
        )}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {mockups.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Export Options</h3>
          <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <span className="font-medium text-gray-700">Format:</span>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio text-blue-600"
                  name="exportFormat"
                  value="jpeg"
                  checked={exportFormat === 'jpeg'}
                  onChange={() => setExportFormat('jpeg')}
                />
                <span className="ml-2">JPEG</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio text-blue-600"
                  name="exportFormat"
                  value="png"
                  checked={exportFormat === 'png'}
                  onChange={() => setExportFormat('png')}
                />
                <span className="ml-2">PNG</span>
              </label>
            </div>
            {exportFormat === 'jpeg' && (
              <div className="flex items-center space-x-2 w-full md:w-auto">
                <label htmlFor="jpegQuality" className="font-medium text-gray-700 whitespace-nowrap">JPEG Quality:</label>
                <input
                  id="jpegQuality"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-sm"
                />
                <span className="w-10 text-right text-gray-700">{jpegQuality}%</span>
              </div>
            )}
            <button
              onClick={handleBulkDownload}
              className="bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center md:ml-auto"
              disabled={isLoading || mockups.length === 0}
            >
              {isLoading ? (
                <svg className="animate-spin h-4 w-4 text-white mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                'Download All Mockups'
              )}
            </button>
          </div>

          <h3 className="text-xl font-bold text-gray-800 mb-4">Your Mockups</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockups.map((mockup) => (
              <div key={mockup.id} className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
                <div className="relative aspect-w-16 aspect-h-9 flex items-center justify-center bg-gray-100 p-2">
                  <img src={createImageUrl(mockup.base64, mockup.mimeType)} alt={`Mockup for ${mockup.prompt}`} className="max-w-full max-h-full object-contain rounded-md" />
                </div>
                <div className="p-4 flex flex-col flex-grow">
                  <p className="text-sm text-gray-600 mb-2 flex-grow">{mockup.prompt}</p>
                  <button
                    onClick={() => handleDownloadSingleMockup(mockup)}
                    className="mt-auto bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors duration-200"
                  >
                    Download Print-Ready
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MerchMockupGenerator;