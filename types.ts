

export type AppView = 'vxdl' | 'vox' | 'vxpl' | 'cos' | 'vxog' | 'vux' | 'vxsg';

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export type GenerationMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video';

export type GenerationModel = 'veo-3.1-fast-generate-preview' | 'vx-0';

export type ImageFilter = 'None' | 'Grayscale' | 'Sepia' | 'Invert' | 'Blur';
export type UpscaleResolution = '2x' | '4x';

export type User = {
  type: 'member' | 'guest';
  loginTime?: number;
} | null;

export interface ImageSettings {
  numberOfImages: number;
  aspectRatio: AspectRatio;
  model: GenerationModel;
}

export interface ImageInfo {
  src: string;
  upscaledTo?: UpscaleResolution;
  isRefined: boolean;
  filter?: ImageFilter;
}

export interface VoxSettings {
  negativePrompt: string;
  activeStyles: string[]; // Store names of active styles
  detailIntensity: number;
  aspectRatio?: AspectRatio | 'auto';
}

export interface HistoryItem {
  id: string;
  prompt: string;
  settings: ImageSettings;
  images: ImageInfo[];
  timestamp: number;
  generationMode: GenerationMode;
  inputImage?: string; // Base64 of the input image
  voxSettings?: VoxSettings; // Added for VOX state
  videoSrc?: string; // Base64 or Object URL of the generated video
  seed?: number;
}

export interface GroundingSourceWeb {
  uri?: string;
  title?: string;
}

export interface ReviewSnippet {
  uri?: string;
  content?: string;
  author?: string;
  rating?: number;
}

export interface PlaceAnswerSource {
  reviewSnippets?: ReviewSnippet[];
}

export interface GroundingSourceMaps {
  uri?: string;
  title?: string;
  placeAnswerSources?: PlaceAnswerSource[];
}

export interface GroundingChunk {
  web?: GroundingSourceWeb;
  maps?: GroundingSourceMaps;
}