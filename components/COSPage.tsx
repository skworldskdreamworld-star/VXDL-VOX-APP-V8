
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import ImageUploader from './ImageUploader';
import Button from './Button';
import Spinner from './Spinner';
import { COS_STYLE_PRESETS } from '../constants';
import { useTranslations } from '../hooks/useTranslations';
import { editImageFromPrompt } from '../services/geminiService';

const COSPage = () => {
  const { t } = useTranslations();
  
  const [inputImage, setInputImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<(typeof COS_STYLE_PRESETS)[number] | 'custom' | null>(null);
  const [manualPrompt, setManualPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 20 });
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState(0);
  const isCancelledRef = useRef(false);

  const categorizedStyles = useMemo(() => {
    return COS_STYLE_PRESETS.reduce((acc, style) => {
        (acc[style.category] = acc[style.category] || []).push(style);
        return acc;
    }, {} as Record<string, (typeof COS_STYLE_PRESETS)[number][]>);
  }, []);

  const categoryOrder = [
    'Professional',
    'Studio Shoots',
    'Photography',
    'Pose & Viewpoint',
    'Themed Outfits & Wardrobe',
    'Artistic',
    'Character Design',
    'PERSONA'
  ];
  
  const handleImageUpload = useCallback((base64: string, file: File) => {
    setInputImage({ base64, mimeType: file.type });
    setGeneratedImages([]);
    setSelectedStyle(null);
    setManualPrompt('');
    setError(null);
    setTokenUsage(0);
  }, []);

  const handleClearImage = useCallback(() => {
    setInputImage(null);
    setGeneratedImages([]);
    setSelectedStyle(null);
    setManualPrompt('');
    setError(null);
    setTokenUsage(0);
  }, []);

  const handleCancel = useCallback(() => {
    isCancelledRef.current = true;
    setIsGenerating(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isGenerating) {
            e.preventDefault();
            handleCancel();
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
        document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGenerating, handleCancel]);
  
  const handleGenerate = async () => {
    if (!inputImage || !selectedStyle) return;
    if (selectedStyle === 'custom' && !manualPrompt.trim()) return;

    setIsGenerating(true);
    setGeneratedImages([]);
    setError(null);
    setProgress({ current: 0, total: 20 });
    setTokenUsage(0);
    isCancelledRef.current = false;
    
    const newImages: string[] = [];
    const estimatedTokensPerImage = 300;

    const masterPrompt = selectedStyle === 'custom'
      ? t('gemini_editImage_masterPrompt', { prompt: manualPrompt })
      : t((selectedStyle as (typeof COS_STYLE_PRESETS)[number]).promptId);

    try {
      for (let i = 1; i <= 20; i++) {
        if (isCancelledRef.current) {
          break;
        }
        setProgress({ current: i, total: 20 });
        
        const result = await editImageFromPrompt(masterPrompt, inputImage.base64, inputImage.mimeType);
        
        if (result && result.images && result.images.length > 0) {
          newImages.push(result.images[0]);
          setGeneratedImages([...newImages]);
          setTokenUsage(prev => prev + estimatedTokensPerImage);
        } else {
          console.warn(`Generation ${i} failed to return an image.`);
        }
      }
    } catch (err) {
      if (isCancelledRef.current) {
        console.log("Generation was cancelled by the user.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred during generation.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAll = () => {
    const styleName = (selectedStyle === 'custom' ? 'custom_prompt' : selectedStyle?.name)?.replace(/\s+/g, '_');
    generatedImages.forEach((src, index) => {
      const link = document.createElement('a');
      link.href = src;
      link.download = `cos_variation_${styleName}_${index + 1}.jpeg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 pb-20">
      <div className="text-center mb-12 animate-fade-in-up pt-10">
          <div className="inline-block mb-4 px-4 py-1 rounded-full border border-rose-500/30 bg-rose-900/10 text-rose-400 text-xs font-mono tracking-[0.2em]">
              PHOTONIC ENGINE
          </div>
        <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-4">
          COS <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-600">STUDIO</span>
        </h1>
        <p className="mt-4 text-lg text-gray-400 max-w-3xl mx-auto font-light">
            Automated fashion & portrait generation pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Control Panel */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Upload / Viewfinder */}
          <div className="p-6 glass-panel rounded-3xl border border-white/10 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-rose-500/50 m-4"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-rose-500/50 m-4"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-rose-500/50 m-4"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-rose-500/50 m-4"></div>

            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-4">Subject Input</h3>
            <ImageUploader 
                onImageUpload={handleImageUpload} 
                onClearImage={handleClearImage}
                inputImage={inputImage?.base64 || null}
                disabled={isGenerating}
                id="cos-image-upload"
            />
            <p className="text-[10px] text-gray-500 font-mono mt-2 text-center uppercase tracking-wide">
                {inputImage ? `SOURCE LOCKED: ${inputImage.mimeType.split('/')[1].toUpperCase()}` : 'NO SIGNAL'}
            </p>
          </div>

          {/* Style Selector */}
          {inputImage && (
              <div className="glass-panel rounded-3xl overflow-hidden flex flex-col max-h-[600px] animate-fade-in-up" style={{animationDelay: '100ms'}}>
                 <div className="p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Lens Selection</h3>
                 </div>
                 
                 <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar flex-grow">
                      <button
                          onClick={() => setSelectedStyle('custom')}
                          disabled={isGenerating}
                          className={`w-full text-left p-4 rounded-xl transition-all duration-200 flex items-center justify-between group ${selectedStyle === 'custom' ? 'bg-rose-500/20 border border-rose-500/50 text-white' : 'hover:bg-white/5 border border-transparent text-gray-400'}`}
                      >
                          <div>
                              <p className="font-bold text-sm">MANUAL PROMPT</p>
                              <p className="text-[10px] opacity-70 font-mono">USER DEFINED</p>
                          </div>
                          {selectedStyle === 'custom' && <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></div>}
                      </button>

                      {categoryOrder.map(category => (
                          categorizedStyles[category] && (
                              <div key={category} className="pt-4 pb-2">
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-2 px-4">{category}</h4>
                                  <div className="space-y-1">
                                      {categorizedStyles[category].map(style => (
                                          <button
                                              key={style.name}
                                              onClick={() => setSelectedStyle(style)}
                                              disabled={isGenerating}
                                              className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center justify-between group ${selectedStyle && typeof selectedStyle !== 'string' && selectedStyle.name === style.name ? 'bg-rose-500/10 border border-rose-500/30 text-white' : 'hover:bg-white/5 border border-transparent text-gray-400 hover:text-gray-200'}`}
                                          >
                                              <span className="text-sm font-medium">{t(style.name)}</span>
                                          </button>
                                      ))}
                                  </div>
                              </div>
                          )
                      ))}
                 </div>
                 
                 {selectedStyle === 'custom' && (
                    <div className="p-4 border-t border-white/10 bg-black/20">
                        <textarea
                            rows={3}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-gray-600 focus:outline-none focus:border-rose-500/50 text-sm resize-none"
                            placeholder={t('cos_custom_prompt_placeholder')}
                            value={manualPrompt}
                            onChange={(e) => setManualPrompt(e.target.value)}
                            disabled={isGenerating}
                        />
                    </div>
                 )}

                 <div className="p-4 border-t border-white/10 bg-white/5">
                    <Button onClick={handleGenerate} isLoading={isGenerating} disabled={!selectedStyle || (selectedStyle === 'custom' && !manualPrompt.trim()) || isGenerating} className="w-full py-4">
                         {isGenerating ? 'PROCESSING...' : 'START SHOOT'}
                    </Button>
                     {isGenerating && (
                        <button onClick={handleCancel} className="w-full mt-2 py-2 text-xs text-red-400 hover:text-white hover:bg-red-900/30 rounded transition-colors uppercase tracking-wider">
                            ABORT SEQUENCE
                        </button>
                    )}
                 </div>
              </div>
          )}
        </div>

        {/* Right: Results Lightbox */}
        <div className="lg:col-span-8">
            <div className="glass-panel rounded-3xl p-1 min-h-[50vh] lg:min-h-[70vh] border border-white/10 h-full flex flex-col relative overflow-hidden">
                {/* Header Strip */}
                <div className="h-10 bg-black/40 border-b border-white/5 flex items-center px-4 justify-between">
                     <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                         <span>BATCH_ID: {Date.now().toString().slice(-6)}</span>
                         <span>STATUS: {isGenerating ? 'RENDERING' : generatedImages.length > 0 ? 'COMPLETE' : 'IDLE'}</span>
                     </div>
                     {tokenUsage > 0 && <div className="text-[10px] font-mono text-rose-400/70">TOKENS: {tokenUsage}</div>}
                </div>

                <div className="flex-grow p-6 overflow-y-auto no-scrollbar relative">
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
                        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                    </div>

                    {!isGenerating && generatedImages.length === 0 && !error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                            <div className="w-16 h-16 border-2 border-gray-800 rounded-full flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <p className="font-light tracking-wider">WAITING FOR INPUT</p>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center">
                             <div className="bg-red-900/20 border border-red-500/50 text-red-400 px-6 py-4 rounded-xl backdrop-blur-sm">
                                 <p className="font-mono text-sm font-bold">ERR: {error}</p>
                             </div>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {generatedImages.map((src, index) => (
                            <div key={index} className="relative aspect-[3/4] group animate-fade-in bg-gray-900 rounded-sm border-4 border-white shadow-lg transform transition-all hover:scale-105 hover:rotate-1 hover:z-10">
                                <img src={src} alt={`Print ${index + 1}`} className="w-full h-full object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 h-6 bg-white flex items-center justify-between px-2">
                                     <span className="text-[8px] font-mono text-black">IMG_{String(index+1).padStart(3,'0')}</span>
                                     <a href={src} download={`cos_${index+1}.jpg`} className="text-black hover:text-rose-500">
                                         <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                     </a>
                                </div>
                            </div>
                        ))}
                        {isGenerating && (
                             <div className="aspect-[3/4] bg-gray-900/50 border border-white/10 rounded-sm flex flex-col items-center justify-center animate-pulse">
                                 <Spinner />
                                 <p className="text-[10px] font-mono text-rose-400 mt-2">DEVELOPING...</p>
                                 <p className="text-[10px] text-gray-500">{progress.current} / {progress.total}</p>
                             </div>
                        )}
                    </div>
                </div>
                
                 {generatedImages.length > 0 && !isGenerating && (
                    <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
                        <Button onClick={handleDownloadAll} variant="ghost" className="text-xs">
                            DOWNLOAD BATCH
                        </Button>
                    </div>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default COSPage;
