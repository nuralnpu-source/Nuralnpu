import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

const initializeGemini = () => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not defined in environment variables.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const editImage = async (
  base64Image: string,
  mimeType: string,
  prompt: string,
): Promise<string> => {
  const ai = initializeGemini();
  try {
    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Image,
      },
    };
    const textPart = {
      text: prompt,
    };
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [imagePart, textPart] },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const generatedImagePart = response.candidates?.[0]?.content?.parts?.[0];
    if (generatedImagePart?.inlineData?.data) {
      return generatedImagePart.inlineData.data;
    }
    throw new Error('No image data found in the response.');
  } catch (error) {
    console.error('Error editing image:', error);
    throw error;
  }
};

export const removeImageBackground = async (
  base64Image: string,
  mimeType: string,
): Promise<string> => {
  const ai = initializeGemini();
  try {
    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Image,
      },
    };
    const textPart = {
      text: 'Remove the background from this image. Keep only the main subject and make the background transparent.',
    };
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [imagePart, textPart] },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const generatedImagePart = response.candidates?.[0]?.content?.parts?.[0];
    if (generatedImagePart?.inlineData?.data) {
      return generatedImagePart.inlineData.data;
    }
    throw new Error('No image data found in the response for background removal.');
  } catch (error) {
    console.error('Error removing image background:', error);
    throw error;
  }
};

export const generateImageWithLogo = async (
    base64Logo: string,
    mimeType: string,
    productPrompt: string, // This prompt should guide the AI to place the logo on a product
): Promise<{ base64: string; mimeType: string }> => { // Modified return type
    const ai = initializeGemini();
    try {
        const logoPart = {
            inlineData: {
                mimeType: mimeType,
                data: base64Logo,
            },
        };
        const textPart = {
            text: `Create a product mockup image. Use the provided logo image and integrate it into the following scenario: ${productPrompt}.`,
        };
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [logoPart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const generatedImagePart = response.candidates?.[0]?.content?.parts?.[0];
        if (generatedImagePart?.inlineData?.data && generatedImagePart?.inlineData?.mimeType) {
            return {
                base64: generatedImagePart.inlineData.data,
                mimeType: generatedImagePart.inlineData.mimeType,
            };
        }
        throw new Error('No image data or mime type found in the response for mockup.');
    } catch (error) {
        console.error('Error generating mockup image:', error);
        throw error;
    }
};