import React, { useState } from 'react';
import ImageEditor from './components/ImageEditor';
import MerchMockupGenerator from './components/MerchMockupGenerator';

type Feature = 'image-editor' | 'merch-mockups';

const App: React.FC = () => {
  const [activeFeature, setActiveFeature] = useState<Feature>('image-editor');

  const getButtonClasses = (feature: Feature) =>
    `px-4 py-2 rounded-lg transition-colors duration-200 ${
      activeFeature === feature
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 sm:p-6 font-sans">
      <h1 className="text-4xl font-extrabold text-gray-900 mb-8 mt-4 text-center">
        Gemini Image Studio
      </h1>

      <div className="flex space-x-4 mb-8 bg-white p-2 rounded-xl shadow-lg">
        <button
          onClick={() => setActiveFeature('image-editor')}
          className={getButtonClasses('image-editor')}
        >
          Image Editor
        </button>
        <button
          onClick={() => setActiveFeature('merch-mockups')}
          className={getButtonClasses('merch-mockups')}
        >
          Merch Mockups
        </button>
      </div>

      <div className="w-full max-w-5xl bg-white p-6 rounded-xl shadow-xl">
        {activeFeature === 'image-editor' && <ImageEditor />}
        {activeFeature === 'merch-mockups' && <MerchMockupGenerator />}
      </div>
    </div>
  );
};

export default App;
