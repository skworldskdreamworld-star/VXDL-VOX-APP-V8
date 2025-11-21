

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateImagesFromPrompt, editImageFromPrompt, inpaintImage, enhancePrompt, generateVideo, upscaleImage, refineImage, reframeImage, combineImages } from '../services/geminiService';
import { ImageSettings, GenerationModel, AspectRatio, HistoryItem, ImageInfo, VoxSettings, GenerationMode, ImageFilter } from '../types';
import { AVAILABLE_MODELS, STYLE_PRESETS, DETAIL_LEVELS, ASPECT_RATIOS, IMAGE_FILTERS } from '../constants';
import Spinner from './Spinner';
import { useTranslations } from '../hooks/useTranslations';
import VideoTools from './VideoTools';

// --- Constants & Types ---
const MAX_HISTORY_ITEMS = 10;
const DAILY_FREE_QUOTA = 3;
const MAX_SESSION_HISTORY = 50; // Limit undo stack

interface VoxPageProps {
  history: HistoryItem[];
  addToHistory: (item: HistoryItem) => void;
  updateHistoryItem: (itemId: string, updatedImages: ImageInfo[]) => void;
  clearHistory: () => void;
  deleteHistoryItems: (ids: Set<string>) => void;
}

interface SessionState {
    image: { base64: string; mimeType: string } | null;
    prompt: string;
}

function VoxPage({ history, addToHistory }: VoxPageProps) {
  const { t } = useTranslations();
  
  // --- Core State ---
  const [prompt, setPrompt] = useState('');
  const [bgUrl1, setBgUrl1] = useState<string | null>(null);
  const [bgUrl2, setBgUrl2] = useState<string | null>(null);
  const [isBg1Active, setIsBg1Active] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Single active image for editing/viewing
  const [currentImage, setCurrentImage] = useState<{ base64: string; mimeType: string; } | null>(null);
  // Multiple input images for combining
  const [inputImages, setInputImages] = useState<{ base64: string; mimeType: string }[]>([]);
  
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'config' | 'tools'>('config');

  // --- Session Undo/Redo State ---
  const [sessionHistory, setSessionHistory] = useState<SessionState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // --- Tools State ---
  const [toolPrompt, setToolPrompt] = useState('');
  const [activeFilter, setActiveFilter] = useState<ImageFilter>('None');

  // --- Video Generation State ---
  const [videoQuota, setVideoQuota] = useState(DAILY_FREE_QUOTA);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState('');

  // --- Inpainting State ---
  const [isInpaintingMode, setIsInpaintingMode] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // --- Settings State ---
  const [selectedModel, setSelectedModel] = useState<GenerationModel>('vx-0');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [activeStyles, setActiveStyles] = useState<Set<string>>(new Set());
  const [detailIntensity, setDetailIntensity] = useState(3);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio | 'auto'>('auto');
  const [seed, setSeed] = useState('');
  
  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const isCancelledRef = useRef<{ current: boolean }>({ current: false });

  // --- Quota Logic ---
  useEffect(() => {
      const storedDate = localStorage.getItem('vox_quota_date');
      const today = new Date().toDateString();
      
      if (storedDate !== today) {
          // Reset quota for new day
          setVideoQuota(DAILY_FREE_QUOTA);
          localStorage.setItem('vox_quota_date', today);
          localStorage.setItem('vox_video_quota', DAILY_FREE_QUOTA.toString());
      } else {
          const storedQuota = localStorage.getItem('vox_video_quota');
          if (storedQuota) setVideoQuota(parseInt(storedQuota));
      }
  }, []);

  const updateQuota = (newQuota: number) => {
      setVideoQuota(newQuota);
      localStorage.setItem('vox_video_quota', newQuota.toString());
  };

  const handleRedeemToken = (token: string): boolean => {
      // Simulated token validation
      const validTokens: Record<string, number> = {
          'VEO-FAST': 5,
          'GEMINI-VIDEO': 10,
          'VXDL-PRO': 20,
          'DEMO-123': 3
      };
      
      const value = validTokens[token.toUpperCase()];
      if (value) {
          updateQuota(videoQuota + value);
          return true;
      }
      return false;
  };

  // --- Helpers ---
  const getActiveAspectRatio = (): AspectRatio => {
    if (selectedAspectRatio !== 'auto') return selectedAspectRatio;
    if (typeof window === 'undefined') return '16:9';
    const ratio = window.innerWidth / window.innerHeight;
    return ratio > 1.5 ? '16:9' : ratio > 1.2 ? '4:3' : ratio > 0.8 ? '1:1' : '9:16';
  };

  const constructFinalPrompt = () => { 
    let finalPrompt = prompt; 
    const styleKeywords = [...activeStyles].map(name => STYLE_PRESETS.find(p => p.name === name)?.keywords || '').join(', '); 
    if (styleKeywords) finalPrompt += `, ${styleKeywords}`; 
    const detailKeywords = DETAIL_LEVELS[detailIntensity]; 
    if (detailKeywords) finalPrompt += `, ${detailKeywords}`; 
    if (negativePrompt.trim()) finalPrompt += ` --no ${negativePrompt.trim()}`; 
    return finalPrompt; 
  };

  const createAndStoreHistoryItem = (thumbnail: ImageInfo[], userPrompt: string, settings: ImageSettings, mode: GenerationMode, videoSrc: string | null = null, seed: number | null = null) => { 
    const voxSettings: VoxSettings = { negativePrompt, activeStyles: Array.from(activeStyles), detailIntensity, aspectRatio: selectedAspectRatio }; 
    const newHistoryItem: HistoryItem = { 
        id: new Date().toISOString(), 
        prompt: userPrompt, 
        settings, 
        images: thumbnail, 
        timestamp: Date.now(), 
        generationMode: mode, 
        inputImage: currentImage?.base64, 
        voxSettings, 
        videoSrc: videoSrc ?? undefined, 
        seed: seed ?? undefined 
    }; 
    addToHistory(newHistoryItem); 
  };

  const updateCurrentImage = (newSrc: string | null, newMimeType?: string) => {
    if (newSrc) {
        if (isBg1Active) setBgUrl2(newSrc); else setBgUrl1(newSrc);
        setIsBg1Active(!isBg1Active);
        const mime = newMimeType || newSrc.substring(newSrc.indexOf(':') + 1, newSrc.indexOf(';'));
        setCurrentImage({ base64: newSrc, mimeType: mime });
    } else {
        setCurrentImage(null);
        setBgUrl1(null);
        setBgUrl2(null);
    }
    // Reset video if image updates
    if (currentVideoUrl) setCurrentVideoUrl(null);
  };

  // --- Session History Logic ---
  const pushToSessionHistory = (image: { base64: string, mimeType: string } | null, currentPrompt: string) => {
      const newState: SessionState = { image, prompt: currentPrompt };
      const newHistory = sessionHistory.slice(0, historyIndex + 1);
      newHistory.push(newState);
      
      if (newHistory.length > MAX_SESSION_HISTORY) {
          newHistory.shift(); // Remove oldest
      } else {
          setHistoryIndex(prev => prev + 1);
      }
      setSessionHistory(newHistory);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          const prevState = sessionHistory[prevIndex];
          setHistoryIndex(prevIndex);
          
          // Restore state
          if (prevState.image) {
              updateCurrentImage(prevState.image.base64, prevState.image.mimeType);
          } else {
              updateCurrentImage(null);
          }
          setPrompt(prevState.prompt);
      } else if (historyIndex === 0) {
           // Undo to initial empty state
           setHistoryIndex(-1);
           updateCurrentImage(null);
           setPrompt('');
      }
  };

  const handleRedo = () => {
      if (historyIndex < sessionHistory.length - 1) {
          const nextIndex = historyIndex + 1;
          const nextState = sessionHistory[nextIndex];
          setHistoryIndex(nextIndex);
          
          // Restore state
          if (nextState.image) {
              updateCurrentImage(nextState.image.base64, nextState.image.mimeType);
          } else {
               updateCurrentImage(null);
          }
          setPrompt(nextState.prompt);
      }
  };

  // --- Inpainting Logic ---
  const initCanvases = useCallback(() => {
      if (!imageContainerRef.current || !uiCanvasRef.current || !maskCanvasRef.current) return;
      
      const { width, height } = imageContainerRef.current.getBoundingClientRect();
      
      // UI Canvas (Visuals)
      uiCanvasRef.current.width = width;
      uiCanvasRef.current.height = height;
      
      // Mask Canvas (Logic - Black background)
      maskCanvasRef.current.width = width;
      maskCanvasRef.current.height = height;
      const maskCtx = maskCanvasRef.current.getContext('2d');
      if (maskCtx) {
          maskCtx.fillStyle = 'black';
          maskCtx.fillRect(0, 0, width, height);
      }
  }, [isInpaintingMode]);

  useEffect(() => {
      if (isInpaintingMode) {
          setTimeout(initCanvases, 50);
          window.addEventListener('resize', initCanvases);
      }
      return () => window.removeEventListener('resize', initCanvases);
  }, [isInpaintingMode, initCanvases]);

  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = uiCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      return {
          x: clientX - rect.left,
          y: clientY - rect.top
      };
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !uiCanvasRef.current || !maskCanvasRef.current) return;
      e.preventDefault(); 

      const { x, y } = getPointerPos(e);
      
      const uiCtx = uiCanvasRef.current.getContext('2d');
      if (uiCtx) {
          uiCtx.globalCompositeOperation = 'source-over';
          uiCtx.beginPath();
          uiCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
          uiCtx.fillStyle = 'rgba(6, 182, 212, 0.5)'; 
          uiCtx.fill();
      }

      const maskCtx = maskCanvasRef.current.getContext('2d');
      if (maskCtx) {
          maskCtx.beginPath();
          maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
          maskCtx.fillStyle = 'white';
          maskCtx.fill();
      }
  };

  const clearMask = () => {
      initCanvases();
  };

  // --- Actions ---
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
        const rawPrompt = constructFinalPrompt();
        const inputSeed = seed ? parseInt(seed, 10) : undefined;
        let resultImages: string[] = [];
        let resultSeed: number | undefined;
        
        if (inputImages.length > 1) {
            // Combine Mode
             const res = await combineImages(inputImages, rawPrompt);
             resultImages = res;
             // Reset inputs after combine
             setInputImages([]);
        } else if (isInpaintingMode && currentImage && maskCanvasRef.current) {
             // Inpainting
             const enhancementInstruction = `Refine this image editing instruction for an AI inpainting model. The goal is to modify the masked area seamlessly. User instruction: "${rawPrompt}"`;
             const enhancedPrompt = await enhancePrompt(rawPrompt, enhancementInstruction);
             const maskBase64 = maskCanvasRef.current.toDataURL('image/png');
             const inpaintRes = await inpaintImage(currentImage.base64, maskBase64, currentImage.mimeType, enhancedPrompt);
             if (inpaintRes.length > 0) {
                 resultImages = inpaintRes;
                 setIsInpaintingMode(false);
             }
        } else if (currentImage) {
             // Editing (Remix)
             const masterPrompt = t('gemini_editImage_masterPrompt', { prompt: rawPrompt });
             const res = await editImageFromPrompt(masterPrompt, currentImage.base64, currentImage.mimeType, inputSeed);
             resultImages = res.images;
             resultSeed = res.seed;
        } else {
             // Generation (Text-to-Image)
             const settings: ImageSettings = { model: selectedModel, numberOfImages: 1, aspectRatio: getActiveAspectRatio() };
             const vxdlUltraSystemInstruction = selectedModel === 'vx-0' ? t('gemini_vx0_systemInstruction') : undefined;
             const res = await generateImagesFromPrompt(rawPrompt, settings, vxdlUltraSystemInstruction, t('gemini_aspectRatio_text'), inputSeed);
             resultImages = res.images;
             resultSeed = res.seed;
        }

        if (resultImages.length > 0) {
             const newSrc = resultImages[0];
             const newMime = newSrc.substring(newSrc.indexOf(':') + 1, newSrc.indexOf(';'));
             updateCurrentImage(newSrc, newMime);

             // Push to Undo Stack
             pushToSessionHistory({ base64: newSrc, mimeType: newMime }, prompt);

             createAndStoreHistoryItem(
                 [{ src: newSrc, isRefined: false }], 
                 prompt, 
                 { model: selectedModel, numberOfImages: 1, aspectRatio: getActiveAspectRatio() }, 
                 isInpaintingMode ? 'image-to-image' : (inputImages.length > 1 ? 'image-to-image' : (currentImage ? 'image-to-image' : 'text-to-image')), 
                 null, 
                 resultSeed
             );
             setPrompt(''); 
        }
    } catch (err: any) {
        setError(err.message || "Generation failed");
    } finally {
        setIsLoading(false);
    }
  };

  // --- Tool Actions ---
  const handleUpscale = async (resolution: '2x' | '4x') => {
      if (!currentImage) return;
      setIsLoading(true);
      setError(null);
      try {
          const promptText = resolution === '2x' ? t('gemini_upscale_2x_prompt') : t('gemini_upscale_4x_prompt');
          const newSrc = await upscaleImage(currentImage.base64, resolution, promptText);
          const newMime = newSrc.substring(newSrc.indexOf(':') + 1, newSrc.indexOf(';'));
          
          updateCurrentImage(newSrc, newMime);
          pushToSessionHistory({ base64: newSrc, mimeType: newMime }, prompt);

          createAndStoreHistoryItem([{ src: newSrc, isRefined: true, upscaledTo: resolution }], `Upscale ${resolution}`, { model: selectedModel, numberOfImages: 1, aspectRatio: getActiveAspectRatio() }, 'image-to-image');
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsLoading(false);
      }
  };

  const handleRefine = async () => {
      if (!currentImage || !toolPrompt.trim()) return;
      setIsLoading(true);
      setError(null);
      try {
          const masterPrompt = t('gemini_refine_masterPrompt', { prompt: toolPrompt });
          const newSrc = await refineImage(currentImage.base64, masterPrompt);
          const newMime = newSrc.substring(newSrc.indexOf(':') + 1, newSrc.indexOf(';'));

          updateCurrentImage(newSrc, newMime);
          pushToSessionHistory({ base64: newSrc, mimeType: newMime }, toolPrompt);

          createAndStoreHistoryItem([{ src: newSrc, isRefined: true }], `Refine: ${toolPrompt}`, { model: selectedModel, numberOfImages: 1, aspectRatio: getActiveAspectRatio() }, 'image-to-image');
          setToolPrompt('');
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsLoading(false);
      }
  };

  const handleReframe = async () => {
      if (!currentImage) return;
      setIsLoading(true);
      setError(null);
      try {
          const masterPrompt = toolPrompt.trim() 
              ? t('gemini_reframe_masterPrompt', { aspectRatio: "wide", prompt: toolPrompt }) // Simplification for now
              : "Expand the image canvas naturally, maintaining the scene continuity.";
          const res = await reframeImage(currentImage.base64, currentImage.mimeType, masterPrompt);
          if (res.length > 0) {
              const newSrc = res[0];
              const newMime = newSrc.substring(newSrc.indexOf(':') + 1, newSrc.indexOf(';'));

              updateCurrentImage(newSrc, newMime);
              pushToSessionHistory({ base64: newSrc, mimeType: newMime }, toolPrompt);

              createAndStoreHistoryItem([{ src: newSrc, isRefined: true }], `Reframe: ${toolPrompt}`, { model: selectedModel, numberOfImages: 1, aspectRatio: getActiveAspectRatio() }, 'image-to-image');
              setToolPrompt('');
          }
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsLoading(false);
      }
  };

  const handleGenerateVideo = async (motionPrompt: string) => {
      if (!currentImage) return;
      if (videoQuota <= 0) {
          setError("Daily video quota exceeded. Please add tokens.");
          return;
      }
      
      setIsGeneratingVideo(true);
      setVideoProgress("Initializing Veo 3.1...");
      setError(null);
      isCancelledRef.current = { current: false };
      
      try {
          const aspectRatio = getActiveAspectRatio() === '9:16' ? '9:16' : '16:9';
          const progressMessages = [
              "Analyzing scene dynamics...",
              "Generating motion vectors...",
              "Rendering frames (this may take a moment)...",
              "Synthesizing audio track...",
              "Finalizing video output..."
          ];

          // Deduct quota immediately to prevent spam
          updateQuota(videoQuota - 1);

          const videoUrl = await generateVideo(
              motionPrompt,
              currentImage,
              aspectRatio,
              setVideoProgress,
              progressMessages,
              isCancelledRef.current
          );
          
          setCurrentVideoUrl(videoUrl);
          
          // Add to history
          createAndStoreHistoryItem(
              [{ src: currentImage.base64, isRefined: false }], 
              motionPrompt, 
              { model: 'veo-3.1-fast-generate-preview' as GenerationModel, numberOfImages: 1, aspectRatio }, 
              'image-to-video',
              videoUrl
          );
          
      } catch (err: any) {
          setError(err.message);
          // Refund quota on error? Optional. For now, strict consumption.
      } finally {
          setIsGeneratingVideo(false);
          setVideoProgress("");
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      if (files.length === 1 && inputImages.length === 0) {
          // Single image upload flow
          const reader = new FileReader();
          reader.onload = (ev) => {
              const base64 = ev.target?.result as string;
              const mimeType = files[0].type;
              
              updateCurrentImage(base64, mimeType);
              pushToSessionHistory({ base64, mimeType }, prompt);

              setCurrentVideoUrl(null);
              setIsInpaintingMode(false);
          };
          reader.readAsDataURL(files[0]);
      } else {
          // Multi-image / Add to tray flow
          const newImages: { base64: string; mimeType: string }[] = [];
          Array.from(files).forEach((file: File) => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                  if (ev.target?.result) {
                      newImages.push({ base64: ev.target.result as string, mimeType: file.type });
                      if (newImages.length === files.length) {
                          // All processed
                          setInputImages(prev => [...prev, ...newImages].slice(0, 6)); // Cap at 6
                          // Preview the first new one
                          if (newImages.length > 0) {
                              const first = newImages[0];
                              updateCurrentImage(first.base64, first.mimeType);
                          }
                      }
                  }
              };
              reader.readAsDataURL(file);
          });
      }
  };

  const handleRemoveFromTray = (index: number) => {
      setInputImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleHistorySelect = (item: HistoryItem) => {
      if (item.videoSrc) {
          setCurrentVideoUrl(item.videoSrc);
          setBgUrl1(null); setBgUrl2(null);
          // If it has a thumbnail/image, set it as currentImage so we can edit/animate again
          if (item.images && item.images.length > 0) {
             const src = typeof item.images[0] === 'string' ? item.images[0] : item.images[0].src;
             setCurrentImage({ base64: src, mimeType: 'image/png' });
          }
      } else if (item.images[0]) {
          const src = typeof item.images[0] === 'string' ? item.images[0] : item.images[0].src;
          const mimeType = 'image/png';

          updateCurrentImage(src, mimeType);
          pushToSessionHistory({ base64: src, mimeType }, item.prompt);

          setCurrentVideoUrl(null);
          setIsInpaintingMode(false);
      }
      setPrompt(item.prompt);
      setIsHistoryOpen(false);
      setInputImages([]); // Clear tray on history load
  };

  const handleDownload = () => {
      if (!currentImage) return;
      const link = document.createElement('a');
      link.href = currentImage.base64;
      link.download = `vox_image_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const getCssFilterValue = (filter: ImageFilter) => {
    switch (filter) {
      case 'Grayscale': return 'grayscale(100%)';
      case 'Sepia': return 'sepia(100%)';
      case 'Invert': return 'invert(100%)';
      case 'Blur': return 'blur(4px)';
      default: return 'none';
    }
  };

  const activeUrl = isBg1Active ? bgUrl1 : bgUrl2;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-black text-white font-sans pb-safe">
      
      {/* Layer 0: Canvas / Background */}
      <div 
        ref={imageContainerRef}
        className="absolute inset-0 z-0 flex items-center justify-center"
      >
        {!activeUrl && !currentVideoUrl && (
            <div className="flex flex-col items-center justify-center text-gray-800 animate-pulse">
                 <svg className="w-24 h-24 mb-4 opacity-20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.22-7.52-3.22 1.5 3.22z"/></svg>
                 <div className="text-sm font-mono tracking-widest">AWAITING VISUAL INPUT...</div>
            </div>
        )}
        
        {/* Display Images */}
        <img 
            src={bgUrl1 || ''} 
            className={`absolute w-full h-full object-contain transition-opacity duration-700 ease-in-out ${bgUrl1 && isBg1Active && !currentVideoUrl ? 'opacity-100' : 'opacity-0'}`} 
            style={{ filter: getCssFilterValue(activeFilter) }}
            alt="Canvas 1" 
        />
        <img 
            src={bgUrl2 || ''} 
            className={`absolute w-full h-full object-contain transition-opacity duration-700 ease-in-out ${bgUrl2 && !isBg1Active && !currentVideoUrl ? 'opacity-100' : 'opacity-0'}`} 
            style={{ filter: getCssFilterValue(activeFilter) }}
            alt="Canvas 2" 
        />
        
        {currentVideoUrl && (
            <div className="absolute w-full h-full z-10 bg-black flex items-center justify-center">
                <video 
                    ref={videoRef} 
                    src={currentVideoUrl} 
                    className="w-full h-full object-contain animate-fade-in" 
                    controls 
                    autoPlay 
                    loop 
                />
                <button 
                    onClick={() => setCurrentVideoUrl(null)}
                    className="absolute top-24 left-4 p-2 bg-black/50 rounded-full text-white/70 hover:text-white border border-white/10"
                    title="Close Video"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        )}

        {/* Inpainting Canvases */}
        {isInpaintingMode && (
            <>
                {/* Hidden Mask Canvas (Logic) */}
                <canvas ref={maskCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-0" />
                
                {/* Visible UI Canvas (Interaction) */}
                <canvas 
                    ref={uiCanvasRef}
                    className="absolute inset-0 w-full h-full cursor-crosshair z-20 touch-none"
                    onMouseDown={(e) => { setIsDrawing(true); draw(e); }}
                    onMouseMove={draw}
                    onMouseUp={() => setIsDrawing(false)}
                    onMouseLeave={() => setIsDrawing(false)}
                    onTouchStart={(e) => { setIsDrawing(true); draw(e); }}
                    onTouchMove={draw}
                    onTouchEnd={() => setIsDrawing(false)}
                />
            </>
        )}
      </div>

      {/* Layer 1: UI Overlay */}
      <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 md:p-6 pt-safe pb-safe">
        
        {/* Undo / Redo Controls (Top Left) */}
        <div className="absolute top-20 md:top-4 left-4 z-40 flex gap-2 pointer-events-auto">
             <button
                onClick={handleUndo}
                disabled={historyIndex < 0}
                className="p-3 rounded-xl glass-panel text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Undo"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
            <button
                onClick={handleRedo}
                disabled={historyIndex >= sessionHistory.length - 1}
                className="p-3 rounded-xl glass-panel text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Redo"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
            </button>
        </div>

        {/* Top Floating Controls (Top Right) */}
        <div className="flex justify-end gap-3 pointer-events-auto pt-16 md:pt-16">
             {currentImage && (
                <>
                    <button 
                        onClick={handleDownload}
                        className="p-3 rounded-full glass-panel text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                        title="Download Image"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </button>
                    <button 
                        onClick={() => setIsInpaintingMode(!isInpaintingMode)}
                        className={`p-3 rounded-full glass-panel transition-all hover:bg-white/10 ${isInpaintingMode ? 'border-cyan-400 bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'text-gray-300'}`}
                        title="Inpaint / Mask Mode"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                </>
            )}
           <button 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className={`p-3 rounded-full glass-panel transition-all hover:bg-white/10 ${isHistoryOpen ? 'border-cyan-400/50 text-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'text-gray-300'}`}
                title="History"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`p-3 rounded-full glass-panel transition-all hover:bg-white/10 ${isSettingsOpen ? 'border-cyan-400/50 text-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'text-gray-300'}`}
                title="Settings & Tools"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
        </div>

        {/* Middle Area */}
        <div className="flex-grow relative">
            
            {/* Inpainting Tools */}
            {isInpaintingMode && (
                <div className="absolute top-1/2 -translate-y-1/2 right-0 glass-panel p-4 rounded-2xl flex flex-col gap-4 pointer-events-auto animate-fade-in">
                    <div className="flex flex-col items-center gap-2">
                        <label className="text-[10px] font-mono text-cyan-400 uppercase">Brush Size</label>
                        <input 
                            type="range" 
                            min="5" 
                            max="100" 
                            value={brushSize} 
                            onChange={(e) => setBrushSize(Number(e.target.value))} 
                            className="h-32 w-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400 writing-mode-vertical"
                            style={{ writingMode: 'vertical-lr', WebkitAppearance: 'slider-vertical' }}
                        />
                        <div className="w-6 h-6 rounded-full bg-cyan-500/50 border border-cyan-300" style={{ width: Math.min(24, brushSize/2), height: Math.min(24, brushSize/2) }}></div>
                    </div>
                    <button onClick={clearMask} className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors" title="Clear Mask">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            )}

            {/* Configuration / Tools Panel */}
            {isSettingsOpen && (
                <div className="absolute top-20 md:top-4 right-4 left-4 md:left-auto md:right-0 w-auto md:w-80 glass-panel rounded-2xl p-0 pointer-events-auto animate-fade-in-up z-40 flex flex-col max-h-[calc(100vh-180px)] md:max-h-[80vh]">
                    <div className="flex border-b border-white/10">
                        <button 
                            onClick={() => setSettingsTab('config')}
                            className={`flex-1 py-3 text-xs font-bold tracking-widest transition-colors ${settingsTab === 'config' ? 'text-cyan-400 bg-white/5' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            CONFIG
                        </button>
                        <button 
                            onClick={() => setSettingsTab('tools')}
                            className={`flex-1 py-3 text-xs font-bold tracking-widest transition-colors ${settingsTab === 'tools' ? 'text-cyan-400 bg-white/5' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            TOOLS
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto custom-scrollbar">
                        {settingsTab === 'config' ? (
                            <div className="space-y-6 text-sm">
                                <div>
                                    <label className="block text-gray-400 mb-2 text-xs font-mono">GENERATION MODEL</label>
                                    <select 
                                        value={selectedModel} 
                                        onChange={e => setSelectedModel(e.target.value as GenerationModel)} 
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-400/50"
                                        disabled={isInpaintingMode}
                                    >
                                        {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id} className="bg-black">{m.name}</option>)}
                                    </select>
                                    {isInpaintingMode && <p className="text-[10px] text-cyan-500 mt-1">Locked to Gemini 3.0 Pro Image for Inpainting</p>}
                                </div>
                                <div>
                                    <label className="block text-gray-400 mb-2 text-xs font-mono">ASPECT RATIO</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {ASPECT_RATIOS.map(r => (
                                            <button 
                                                key={r} 
                                                onClick={() => setSelectedAspectRatio(r)} 
                                                disabled={isInpaintingMode}
                                                className={`px-2 py-2 rounded-lg border text-xs transition-all ${selectedAspectRatio === r ? 'bg-cyan-500/20 border-cyan-400/50 text-white' : 'bg-black/20 border-white/10 hover:bg-white/5 text-gray-400'} ${isInpaintingMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-gray-400 mb-2 text-xs font-mono">DETAIL INTENSITY: {detailIntensity}</label>
                                    <input type="range" min="1" max="5" value={detailIntensity} onChange={e => setDetailIntensity(Number(e.target.value))} className="w-full accent-cyan-400 h-1 bg-gray-700 rounded-lg appearance-none"/>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 text-sm">
                                {!currentImage ? (
                                    <p className="text-gray-500 text-xs text-center py-4">Generate or upload an image to use tools.</p>
                                ) : (
                                    <>
                                        {/* Enhance / Upscale */}
                                        <div>
                                            <label className="block text-cyan-400 mb-3 text-xs font-bold tracking-widest uppercase">Enhance</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button onClick={() => handleUpscale('2x')} disabled={isLoading} className="px-3 py-2 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 rounded-lg text-xs text-gray-300 hover:text-white transition-all">
                                                    UPSCALE 2X
                                                </button>
                                                <button onClick={() => handleUpscale('4x')} disabled={isLoading} className="px-3 py-2 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 rounded-lg text-xs text-gray-300 hover:text-white transition-all">
                                                    UPSCALE 4X
                                                </button>
                                            </div>
                                        </div>

                                        {/* Refine / Reframe */}
                                        <div>
                                            <label className="block text-purple-400 mb-3 text-xs font-bold tracking-widest uppercase">Edit & Reframe</label>
                                            <textarea 
                                                value={toolPrompt}
                                                onChange={(e) => setToolPrompt(e.target.value)}
                                                placeholder="Describe refinement or reframe expansion..."
                                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-purple-500/50 mb-2 resize-none"
                                                rows={3}
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <button onClick={handleRefine} disabled={isLoading || !toolPrompt.trim()} className="px-3 py-2 bg-purple-900/20 hover:bg-purple-500/20 border border-purple-500/30 hover:border-purple-500/50 rounded-lg text-xs text-purple-300 hover:text-white transition-all disabled:opacity-50">
                                                    REFINE
                                                </button>
                                                <button onClick={handleReframe} disabled={isLoading} className="px-3 py-2 bg-blue-900/20 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/50 rounded-lg text-xs text-blue-300 hover:text-white transition-all disabled:opacity-50">
                                                    REFRAME
                                                </button>
                                            </div>
                                        </div>

                                        {/* Filters */}
                                        <div>
                                            <label className="block text-emerald-400 mb-3 text-xs font-bold tracking-widest uppercase">Visual Filters</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {IMAGE_FILTERS.map(filter => (
                                                    <button 
                                                        key={filter} 
                                                        onClick={() => setActiveFilter(filter)}
                                                        className={`px-2 py-2 rounded-lg border text-[10px] transition-all ${activeFilter === filter ? 'bg-emerald-500/20 border-emerald-400/50 text-white' : 'bg-black/20 border-white/10 hover:bg-white/5 text-gray-400'}`}
                                                    >
                                                        {filter.toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

             {/* History Panel */}
             {isHistoryOpen && (
                <div className="absolute top-20 md:top-4 right-12 md:right-12 left-4 md:left-auto w-auto md:w-72 max-h-[60vh] glass-panel rounded-2xl p-2 pointer-events-auto overflow-y-auto no-scrollbar animate-fade-in-up z-40">
                     <h3 className="text-xs font-bold text-gray-400 mb-2 px-4 py-2 tracking-widest">MEMORY BANK</h3>
                     <div className="space-y-2">
                         {history.map(item => (
                             <button key={item.id} onClick={() => handleHistorySelect(item)} className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-white/5 text-left group transition-colors">
                                 <img src={typeof item.images[0] === 'string' ? item.images[0] : item.images[0].src} className="w-12 h-12 rounded-lg bg-gray-800 object-cover border border-white/10 group-hover:border-white/30" />
                                 <div className="overflow-hidden flex-1">
                                     <p className="text-xs text-white truncate font-medium">{item.prompt}</p>
                                     <div className="flex justify-between items-center mt-1">
                                        <span className="text-[10px] text-gray-500 font-mono">{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        <span className={`text-[10px] border px-1 rounded ${item.generationMode === 'image-to-video' ? 'text-purple-400 border-purple-900/50 bg-purple-900/10' : 'text-cyan-500/70 border-cyan-900/50 bg-cyan-900/10'}`}>
                                            {item.generationMode === 'image-to-video' ? 'VEO' : (item.generationMode === 'image-to-image' ? 'REMIX' : 'GEN')}
                                        </span>
                                     </div>
                                 </div>
                             </button>
                         ))}
                         {history.length === 0 && <p className="text-xs text-gray-500 text-center py-8">No history data found.</p>}
                     </div>
                </div>
             )}
        </div>

        {/* Bottom Omnibar & Floating Video Tools */}
        <div className="w-full flex flex-col items-center gap-4 pointer-events-auto z-40 pb-2">
            {/* Video Tools - Floating Pill */}
            {currentImage && !isInpaintingMode && inputImages.length <= 1 && (
                <VideoTools 
                    currentImage={currentImage}
                    onGenerateVideo={handleGenerateVideo}
                    quota={videoQuota}
                    onRedeemToken={handleRedeemToken}
                    isGenerating={isGeneratingVideo}
                    progress={videoProgress}
                />
            )}

            {/* Floating Image Tray (Multi-Upload) */}
            {inputImages.length > 0 && (
                <div className="flex gap-3 p-2 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 animate-fade-in-up overflow-x-auto max-w-[90vw]">
                    {inputImages.map((img, idx) => (
                        <div key={idx} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-white/20 flex-shrink-0">
                            <img src={img.base64} alt={`Input ${idx}`} className="w-full h-full object-cover" />
                            <button 
                                onClick={() => handleRemoveFromTray(idx)}
                                className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                    ))}
                    {inputImages.length < 6 && (
                         <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-16 h-16 rounded-xl border border-dashed border-white/20 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                    )}
                </div>
            )}

            {error && <div className="text-red-300 text-sm bg-red-950/80 backdrop-blur-md px-6 py-2 rounded-full border border-red-500/30 animate-fade-in shadow-lg mx-4 text-center">{error}</div>}
            
            <div className={`w-[90%] md:w-full max-w-3xl relative group transition-all ${isInpaintingMode ? 'scale-105' : ''}`}>
                <div className={`absolute -inset-0.5 bg-gradient-to-r ${isInpaintingMode ? 'from-cyan-400 via-blue-500 to-cyan-400 opacity-50' : 'from-cyan-500/30 via-purple-500/30 to-cyan-500/30 opacity-0 group-hover:opacity-100'} rounded-full blur transition duration-1000 group-focus-within:opacity-100`}></div>
                
                <div className="relative flex items-center glass-panel rounded-full p-2 transition-all duration-300 border-white/10 group-focus-within:border-cyan-500/30">
                    {/* Upload */}
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-3 rounded-full transition-all ${inputImages.length > 0 || currentImage ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                        title="Upload Image(s)"
                        disabled={isInpaintingMode || isGeneratingVideo}
                    >
                         {inputImages.length > 1 ? (
                            <div className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2 2z" /></svg>
                                <span className="absolute -top-2 -right-2 bg-cyan-500 text-black text-[8px] font-bold px-1 rounded-full">{inputImages.length}</span>
                            </div>
                         ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2 2z" /></svg>
                         )}
                    </button>

                    {/* Input */}
                    <input 
                        type="text" 
                        value={prompt} 
                        onChange={e => setPrompt(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                        placeholder={
                            isInpaintingMode ? "Describe changes for mask..." : 
                            (inputImages.length > 1 ? `Combine these ${inputImages.length} images...` : 
                            (currentImage ? "Edit this image..." : "Imagine something new..."))
                        }
                        className="flex-grow bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 px-4 text-base min-w-0"
                        disabled={isLoading || isGeneratingVideo}
                    />

                    {/* Action Button */}
                    <button 
                        onClick={handleGenerate} 
                        disabled={isLoading || !prompt.trim() || isGeneratingVideo}
                        className={`p-2 px-4 md:px-6 rounded-full font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] whitespace-nowrap
                            ${isInpaintingMode ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-white text-black hover:bg-cyan-50'}
                        `}
                    >
                        {isLoading ? <Spinner /> : (isInpaintingMode ? 'REFINE' : (inputImages.length > 1 ? 'COMBINE' : (currentImage ? 'REMIX' : 'GENERATE')))}
                    </button>
                </div>
            </div>
            
            {/* Footer Status */}
            <div className="flex gap-4 md:gap-6 text-[10px] font-mono text-gray-500 tracking-widest">
                <span>VOX ENGINE V3.0</span>
                <span className="text-gray-800 hidden md:inline">|</span>
                <span className="hidden md:inline">{isInpaintingMode ? 'MODE: INPAINTING' : (inputImages.length > 1 ? 'MODE: COMBINATION' : `MEMORY: ${history.length}/${MAX_HISTORY_ITEMS}`)}</span>
                <span className="text-gray-800 hidden md:inline">|</span>
                <span className="text-cyan-900">GEMINI 3.0 PRO</span>
            </div>
        </div>
      </div>
    </div>
  );
}

export default VoxPage;