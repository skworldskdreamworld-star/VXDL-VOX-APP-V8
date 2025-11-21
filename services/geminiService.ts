
import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { Part } from "@google/genai";
import { ImageSettings, AspectRatio, UpscaleResolution, GroundingChunk } from '../types';

const getAi = () => {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable is not set. Please select a key.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const executeWithApiKeyHandling = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const message = error.message || error.toString();
    
    // Check for various shapes of 403/404 errors
    const isPermissionDenied = 
        message.includes("does not have permission") || 
        message.includes("PERMISSION_DENIED") || 
        error.status === 403 || 
        error.code === 403 ||
        (error.error && error.error.code === 403);

    const isNotFound = 
        message.includes("Requested entity was not found") || 
        message.includes("NOT_FOUND") || 
        error.status === 404 || 
        error.code === 404 ||
        (error.error && error.error.code === 404);

    if (isPermissionDenied || isNotFound) {
        if (typeof window !== 'undefined' && (window as any).aistudio) {
            try {
                await (window as any).aistudio.openSelectKey();
                return await fn();
            } catch (e) {
                // User cancelled or selection failed, throw original error
                throw error;
            }
        }
    }
    throw error;
  }
};

const resizeImage = (base64Str: string, maxWidth: number = 1024, maxHeight: number = 1024): Promise<{resizedBase64: string, mimeType: string}> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = base64Str.substring(base64Str.indexOf(':') + 1, base64Str.indexOf(';'));
      const quality = mimeType === 'image/jpeg' ? 0.9 : undefined;
      const resizedBase64 = canvas.toDataURL(mimeType, quality);
      resolve({ resizedBase64, mimeType });
    };
    img.onerror = (error) => {
      reject(new Error(`Failed to load image for resizing: ${error}`));
    };
  });
};

const parseGeminiError = (error: any): string => {
  console.error("Gemini API Error:", error);

  let message = 'An unknown and unexpected error occurred. Please try again.';

  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object') {
    if (error.error && typeof error.error.message === 'string') {
      message = error.error.message;
    } else if (typeof error.message === 'string') {
      message = error.message;
    }
  }
  
  if (message.includes('Requested entity was not found.')) {
      return "The requested AI model is not available with your current API key. Please ensure your key has access to Gemini 3.0 Preview models.";
  }
  if (message.includes('does not have permission') || message.includes('PERMISSION_DENIED')) {
      return "Permission denied. Your API key does not have access to this model. Please select a different key or check your Google Cloud project permissions.";
  }

  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('xhr error') || lowerMessage.includes('network error') || lowerMessage.includes('failed to fetch')) {
    return 'A network connection error occurred. Please check your internet connection and try again. The API service may be temporarily unavailable.';
  }
  if (message.startsWith('Model refusal:')) {
    return message;
  }
  if (lowerMessage.includes('safety policies') || lowerMessage.includes('blocked')) {
    return 'Your request was blocked due to safety policies. Please adjust your prompt and try again.';
  }
  if (lowerMessage.includes('api key not valid')) {
    return 'The provided API key is invalid. Please ensure it is configured correctly.';
  }
  if (lowerMessage.includes('quota')) {
    return 'API quota exceeded. Please check your usage and limits.';
  }
  if (lowerMessage.includes('resource has been exhausted') || lowerMessage.includes('rate limit')) {
      return 'The server is busy or you have hit a rate limit. Please try again in a moment.';
  }

  return `An unexpected API error occurred: ${message}`;
};

interface HistoryItemForSearch {
  role: 'user' | 'model';
  parts: Part[];
}

export const performGroundedSearch = async (
  contents: HistoryItemForSearch[],
  location?: { latitude: number; longitude: number },
): Promise<{ text: string; sources: GroundingChunk[] }> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const model = 'gemini-2.5-flash';
        const config: any = {
            tools: [{ googleSearch: {} }, { googleMaps: {} }],
            systemInstruction: "You are a knowledgeable, helpful, and real-time AI search assistant. You have access to Google Search and Google Maps. \n\n1. **Context Awareness**: Always consider the conversation history to understand follow-up questions (e.g., 'who is he?' refers to the person in the previous turn).\n2. **Real-Time Info**: Use Google Search to find the latest information, news, and updates. Do not rely solely on internal knowledge for current events.\n3. **Synthesis**: Synthesize information from multiple sources into a clear, concise, and comprehensive answer.\n4. **Formatting**: Use clear formatting with paragraphs and bullet points where appropriate to make the answer easy to read.\n5. **Grounded Truth**: Prioritize accuracy and grounding in search results.",
        };

        if (location) {
        config.toolConfig = {
            retrievalConfig: {
            latLng: {
                latitude: location.latitude,
                longitude: location.longitude,
            },
            },
        };
        }

        const response = await ai.models.generateContent({
        model,
        contents,
        config,
        });

        const text = response.text || "";
        // Cast to unknown first to bypass type mismatch with SDK types if necessary
        const sources = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as unknown as GroundingChunk[];

        if (!text && sources.length === 0) {
            throw new Error("The model did not return a response. This may be due to safety policies or an empty query.");
        }
        
        return { text, sources };
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const generateFollowUpSuggestions = async (
  conversationTurn: string,
): Promise<string[]> => {
  if (!conversationTurn.trim()) {
    return [];
  }
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Based on the following user query and model response, generate exactly 3 concise and relevant follow-up questions a user might ask next. Return a JSON object with a single key "suggestions" which is an array of 3 strings.\n\nConversation:\n${conversationTurn}`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
            type: Type.OBJECT,
            properties: {
                suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Array of 3 follow-up questions.'
                }
            },
            required: ['suggestions']
            },
        },
        });

        const jsonString = response.text?.trim() || "";
        const result = JSON.parse(jsonString);

        if (result && Array.isArray(result.suggestions)) {
        return result.suggestions.slice(0, 3);
        }
        return [];
    } catch (error) {
        console.error("Failed to generate follow-up suggestions:", error);
        return []; 
    }
  });
};


export const enhancePrompt = async (
  currentPrompt: string,
  systemInstruction: string,
): Promise<string> => {
  if (!currentPrompt.trim()) {
    throw new Error("Prompt cannot be empty.");
  }
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: currentPrompt,
        config: {
            systemInstruction,
        },
        });

        const enhancedPrompt = response.text?.trim() || "";
        
        const cleanPrompt = enhancedPrompt.replace(/^(enhanced prompt|prompt):\s*/i, '').trim();

        if (!cleanPrompt) {
        throw new Error("The model could not enhance the prompt.");
        }
        
        return cleanPrompt;

    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const generateCreativePrompt = async (
    instruction: string,
    systemInstruction: string,
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: instruction,
        config: {
            systemInstruction,
        },
        });

        const creativePrompt = (response.text?.trim() || "").replace(/^prompt:\s*/i, '').trim();

        if (!creativePrompt) {
        throw new Error("The model could not generate a creative prompt.");
        }
        
        return creativePrompt;

    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const generateVariations = async (
  base64ImageData: string,
  _mimeType: string,
  instruction: string,
): Promise<string[]> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);
        const finalInstruction = instruction;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureBase64,
                mimeType: mimeType,
                },
            },
            { text: finalInstruction },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
        });

        const images: string[] = [];
        let refusalText: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            } else if (part.text) {
            refusalText = (refusalText || "") + part.text;
            }
        }
        }

        if (images.length === 0) {
        if (refusalText) {
            throw new Error(`Model refusal: ${refusalText}`);
        }
        throw new Error("The model did not return any variations. It may have refused the request due to safety policies.");
        }

        return images;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};


export const generateImagesFromPrompt = async (
  prompt: string,
  settings: ImageSettings,
  vxdlUltraSystemInstruction: string | undefined,
  aspectRatioTextTemplate: string,
  seed?: number,
): Promise<{ images: string[], seed: number }> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const usedSeed = seed ?? Math.floor(Math.random() * 2147483647);
        const finalPrompt = prompt;
        
        // Map 'vx-0' (or any request) to 'gemini-3-pro-image-preview'
        const backendModel = 'gemini-3-pro-image-preview';

        const response = await ai.models.generateContent({
            model: backendModel,
            contents: {
                parts: [{ text: finalPrompt + aspectRatioTextTemplate.replace('{{ratio}}', settings.aspectRatio) }],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
                ...(vxdlUltraSystemInstruction && { systemInstruction: vxdlUltraSystemInstruction }),
                seed: usedSeed,
            },
        });

        const images: string[] = [];
        let refusalText: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                } else if (part.text) {
                    refusalText = (refusalText || "") + part.text;
                }
            }
        }

        if (images.length === 0) {
            if (refusalText) {
                throw new Error(`Model refusal: ${refusalText}`);
            }
            throw new Error(`VX-0 (Gemini 3 Pro): The model did not return an image. This might be due to safety policies.`);
        }
        return { images: [images[0]], seed: usedSeed };
        
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const editImageFromPrompt = async (
  masterPrompt: string,
  base64ImageData: string,
  _mimeType: string,
  seed?: number,
): Promise<{images: string[], seed: number}> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const usedSeed = seed ?? Math.floor(Math.random() * 2147483647);
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);
        const finalPrompt = masterPrompt;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureBase64,
                mimeType: mimeType,
                },
            },
            { text: finalPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
            seed: usedSeed,
        },
        });

        const images: string[] = [];
        let refusalText: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            } else if (part.text) {
            refusalText = (refusalText || "") + part.text;
            }
        }
        }

        if (images.length === 0) {
        if (refusalText) {
            throw new Error(`Model refusal: ${refusalText}`);
        }
        throw new Error("The model did not return an edited image. It may have refused the request due to safety policies or an unclear prompt.");
        }

        return { images, seed: usedSeed };
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const inpaintImage = async (
  originalImageBase64: string,
  maskImageBase64: string,
  mimeType: string,
  masterPrompt: string
): Promise<string[]> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const pureOriginalBase64 = originalImageBase64.substring(originalImageBase64.indexOf(',') + 1);
        const pureMaskBase64 = maskImageBase64.substring(maskImageBase64.indexOf(',') + 1);
        const finalPrompt = masterPrompt;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureOriginalBase64,
                mimeType: mimeType,
                },
            },
            {
                inlineData: {
                    data: pureMaskBase64,
                    mimeType: 'image/png', 
                },
            },
            { text: finalPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
        });

        const images: string[] = [];
        let refusalText: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            } else if (part.text) {
            refusalText = (refusalText || "") + part.text;
            }
        }
        }

        if (images.length === 0) {
        if (refusalText) {
            throw new Error(`Model refusal: ${refusalText}`);
        }
        throw new Error("The model did not return an inpainted image. It may have refused the request.");
        }

        return images;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const combineImages = async (
  images: { base64: string; mimeType: string }[],
  masterPrompt: string,
): Promise<string[]> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        if (images.length < 2 || images.length > 6) {
        throw new Error("Combining requires 2 to 6 images.");
        }

        const resizedImagePromises = images.map(image => resizeImage(image.base64));
        const resizedImages = await Promise.all(resizedImagePromises);

        const imageParts = resizedImages.map(image => {
        const pureBase64 = image.resizedBase64.substring(image.resizedBase64.indexOf(',') + 1);
        return {
            inlineData: {
            data: pureBase64,
            mimeType: image.mimeType,
            },
        };
        });

        const finalPrompt = masterPrompt;
        const textPart = { text: finalPrompt };

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [...imageParts, textPart],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
        });

        const resultImages: string[] = [];
        let refusalText: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            resultImages.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            } else if (part.text) {
            refusalText = (refusalText || "") + part.text;
            }
        }
        }

        if (resultImages.length === 0) {
        if (refusalText) {
            throw new Error(`Model refusal: ${refusalText}`);
        }
        throw new Error("The model did not return a combined image. It may have refused the request due to safety policies or an unclear prompt.");
        }

        return resultImages;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};


export const upscaleImage = async (
  base64ImageData: string,
  resolution: UpscaleResolution,
  upscalePrompt: string
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const pureBase64 = base64ImageData.substring(base64ImageData.indexOf(',') + 1);
        const mimeType = base64ImageData.substring(base64ImageData.indexOf(':') + 1, base64ImageData.indexOf(';'));
        const finalPrompt = upscalePrompt;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureBase64,
                mimeType: mimeType,
                },
            },
            { text: finalPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
        });

        let upscaledImage: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            upscaledImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
            }
        }
        }

        if (!upscaledImage) {
        throw new Error("The model did not return an upscaled image. This may be due to safety policies.");
        }

        return upscaledImage;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const refineImage = async (
  base64ImageData: string,
  masterPrompt: string
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);
        const finalPrompt = masterPrompt;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureBase64,
                mimeType: mimeType,
                },
            },
            { text: finalPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
        });

        let refinedImage: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            refinedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
            }
        }
        }

        if (!refinedImage) {
        throw new Error("The model did not return a refined image. This may be due to safety policies.");
        }

        return refinedImage;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const reframeImage = async (
  base64ImageData: string,
  _mimeType: string,
  masterPrompt: string,
): Promise<string[]> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);
        const finalPrompt = masterPrompt;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureBase64,
                mimeType: mimeType,
                },
            },
            { text: finalPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
        });

        const images: string[] = [];
        let refusalText: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            } else if (part.text) {
            refusalText = (refusalText || "") + part.text;
            }
        }
        }

        if (images.length === 0) {
        if (refusalText) {
            throw new Error(`Model refusal: ${refusalText}`);
        }
        throw new Error("The model did not return a reframed image. It may have refused the request.");
        }

        return images;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};


export const generateVideo = async (
  prompt: string,
  image: { base64: string; mimeType: string } | null,
  aspectRatio: '16:9' | '9:16',
  onProgress: (message: string) => void,
  progressMessages: string[],
  isCancelledRef: { current: boolean }
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        let resizedImage: { base64: string; mimeType: string } | null = null;
        if (image) {
        const { resizedBase64, mimeType } = await resizeImage(image.base64);
        resizedImage = { base64: resizedBase64, mimeType: mimeType };
        }
        const pureBase64 = resizedImage ? resizedImage.base64.substring(resizedImage.base64.indexOf(',') + 1) : null;

        const requestPayload: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
            numberOfVideos: 1,
            aspectRatio: aspectRatio,
        },
        };

        if (pureBase64 && resizedImage) {
        requestPayload.image = {
            imageBytes: pureBase64,
            mimeType: resizedImage.mimeType,
        };
        }
        
        onProgress(progressMessages[0]);

        let operation = await ai.models.generateVideos(requestPayload);
        
        onProgress(progressMessages[1]);

        const progressInterval = 20000;
        let progressCounter = 2;

        while (!operation.done) {
        if (isCancelledRef.current) {
            throw new Error("Video generation cancelled by user.");
        }
        await new Promise(resolve => setTimeout(resolve, progressInterval));
        operation = await ai.operations.getVideosOperation({operation: operation});
        
        if (!operation.done) {
            onProgress(progressMessages[progressCounter % progressMessages.length]);
            progressCounter++;
        }
        }

        if (isCancelledRef.current) {
            throw new Error("Video generation cancelled by user.");
        }
        
        onProgress("Finalizing video...");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;

        if (!downloadLink) {
            throw new Error("Video generation completed, but no download link was found.");
        }

        const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!videoResponse.ok) {
            throw new Error(`Failed to download video file. Status: ${videoResponse.statusText}`);
        }
        const videoBlob = await videoResponse.blob();
        
        return URL.createObjectURL(videoBlob);

    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const changeImageViewpoint = async (
  base64ImageData: string,
  _mimeType: string,
  instruction: string,
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);
        const finalInstruction = instruction;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureBase64,
                mimeType: mimeType,
                },
            },
            { text: finalInstruction },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
        });

        let newImage: string | null = null;
        let refusalText: string | null = null;

        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            newImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
            } else if (part.text) {
            refusalText = (refusalText || "") + part.text;
            }
        }
        }

        if (!newImage) {
        if (refusalText) {
            throw new Error(`Model refusal: ${refusalText}`);
        }
        throw new Error("The model did not return an image from the new viewpoint. It may have refused the request.");
        }

        return newImage;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const analyzeImageForSuggestions = async (
  base64ImageData: string,
  instruction: string,
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData, 512, 512);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [
            { inlineData: { data: pureBase64, mimeType: mimeType } },
            { text: instruction },
            ],
        },
        });

        const suggestions = response.text?.trim() || "";
        if (!suggestions) {
        throw new Error("The model could not analyze the image.");
        }
        return suggestions;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const suggestNegativePrompt = async (
  positivePrompt: string,
  instruction: string,
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: `${instruction}: "${positivePrompt}"`,
        });

        const suggestions = response.text?.trim() || "";
        if (!suggestions) {
        throw new Error("The model could not provide suggestions.");
        }
        return suggestions;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const analyzeImageStyle = async (
  base64ImageData: string,
  instruction: string,
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData, 512, 512);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [
            { inlineData: { data: pureBase64, mimeType: mimeType } },
            { text: instruction },
            ],
        },
        });

        const styleKeywords = response.text?.trim() || "";
        if (!styleKeywords) {
        throw new Error("The model could not analyze the image style.");
        }
        return styleKeywords;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const generateVisualPromptFromImage = async (
  base64ImageData: string,
  instruction: string,
): Promise<string> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData, 1024, 1024);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [
            { inlineData: { data: pureBase64, mimeType: mimeType } },
            { text: instruction },
            ],
        },
        });

        const visualPrompt = response.text?.trim() || "";
        if (!visualPrompt) {
        throw new Error("The model could not generate a visual prompt from the image.");
        }
        return visualPrompt;
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const generateStoryboardPrompts = async (
  base64ImageData: string,
  storyIdea: string,
  numFrames: number
): Promise<string[]> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const { resizedBase64, mimeType } = await resizeImage(base64ImageData, 512, 512);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);

        const instruction = `Analyze the provided starting image and the user's story idea: "${storyIdea}". Based on this, generate a sequence of exactly ${numFrames} distinct but connected scene descriptions for a visual storyboard. These scenes should logically follow each other to form a short narrative. The first scene description MUST be based on the provided image and describe it as the starting point. Subsequent prompts should describe the *next* logical frame in the story. The prompts should be rich, detailed, and suitable for an image generation model that works by modifying a previous image. Each prompt should clearly state the changes from the previous scene. Output a JSON object with a single key "prompts" which is an array of ${numFrames} strings.`;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [
            { inlineData: { data: pureBase64, mimeType: mimeType } },
            { text: instruction },
            ],
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
            type: Type.OBJECT,
            properties: {
                prompts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: `Array of ${numFrames} storyboard prompts.`
                }
            },
            required: ['prompts']
            },
        },
        });

        const jsonString = response.text?.trim() || "";
        const result = JSON.parse(jsonString);

        if (result && Array.isArray(result.prompts) && result.prompts.length === numFrames) {
        return result.prompts;
        }
        throw new Error("The model did not return the expected number of prompts.");
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};

export const generateNextFrame = async (
  base64ImageData: string,
  mimeType: string,
  prompt: string,
  seed?: number,
): Promise<{images: string[], seed: number}> => {
  return executeWithApiKeyHandling(async () => {
    try {
        const ai = getAi();
        const usedSeed = seed ?? Math.floor(Math.random() * 2147483647);
        const { resizedBase64, mimeType: resizedMimeType } = await resizeImage(base64ImageData);
        const pureBase64 = resizedBase64.substring(resizedBase64.indexOf(',') + 1);
        const finalPrompt = prompt;

        const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
            parts: [
            {
                inlineData: {
                data: pureBase64,
                mimeType: resizedMimeType,
                },
            },
            { text: finalPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
            seed: usedSeed,
        },
        });

        const images: string[] = [];
        let refusalText: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
            images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            } else if (part.text) {
            refusalText = (refusalText || "") + part.text;
            }
        }
        }

        if (images.length === 0) {
        if (refusalText) {
            throw new Error(`Model refusal: ${refusalText}`);
        }
        throw new Error("The model did not return an edited image for the storyboard frame.");
        }

        return { images, seed: usedSeed };
    } catch (error) {
        throw new Error(parseGeminiError(error));
    }
  });
};
