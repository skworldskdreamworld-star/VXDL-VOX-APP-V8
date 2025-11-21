
import React, { useState, useCallback, useRef } from 'react';
import ImageUploader from './ImageUploader';
import Button from './Button';
import Spinner from './Spinner';
import { useTranslations } from '../hooks/useTranslations';
import { generateStoryboardPrompts, generateNextFrame } from '../services/geminiService';

interface StoryboardFrame {
    image: string;
    prompt: string;
    isLoading: boolean;
}

const VXSGPage = () => {
    const { t } = useTranslations();

    const [inputImage, setInputImage] = useState<{ base64: string; mimeType: string } | null>(null);
    const [storyIdea, setStoryIdea] = useState('');
    const [numFrames, setNumFrames] = useState(5);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [storyboard, setStoryboard] = useState<StoryboardFrame[]>([]);
    const [error, setError] = useState<string | null>(null);
    const isCancelledRef = useRef(false);
    const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
    const [mode, setMode] = useState<'simple' | 'complex'>('simple');
    const [nextPrompt, setNextPrompt] = useState('');

    const handleImageUpload = useCallback((base64: string, file: File) => {
        setInputImage({ base64, mimeType: file.type });
        setStoryboard([]);
        setError(null);
    }, []);

    const handleClearImage = useCallback(() => {
        setInputImage(null);
        setStoryboard([]);
        setError(null);
    }, []);

    const handleStartOver = useCallback(() => {
        setInputImage(null);
        setStoryboard([]);
        setStoryIdea('');
        setNumFrames(5);
        setError(null);
        setIsGenerating(false);
        setProgressMessage('');
        setNextPrompt('');
    }, []);
    
    const handleCancel = useCallback(() => {
        isCancelledRef.current = true;
        setIsGenerating(false);
        setProgressMessage('Cancelling...');
    }, []);

    const handleGenerate = async () => {
        if (!inputImage) return;

        setIsGenerating(true);
        setError(null);
        setProgressMessage(t('vxsg_generating_prompts'));
        isCancelledRef.current = false;
        setStoryboard([]);

        try {
            // Step 1: Generate all prompts
            const prompts = await generateStoryboardPrompts(inputImage.base64, storyIdea, numFrames);
            if (isCancelledRef.current) return;

            const initialStoryboard: StoryboardFrame[] = prompts.map(p => ({ image: '', prompt: p, isLoading: true }));
            setStoryboard(initialStoryboard);

            // Step 2: Generate frames sequentially
            let currentImageSource = inputImage;
            for (let i = 0; i < numFrames; i++) {
                if (isCancelledRef.current) break;
                
                setProgressMessage(t('vxsg_generating_frames', { current: i + 1, total: numFrames }));
                
                const result = await generateNextFrame(currentImageSource.base64, currentImageSource.mimeType, prompts[i]);
                
                if (result.images && result.images.length > 0) {
                    const newImageSrc = result.images[0];
                    setStoryboard(prev => prev.map((frame, index) => 
                        index === i ? { ...frame, image: newImageSrc, isLoading: false } : frame
                    ));
                    const newMimeType = newImageSrc.substring(newImageSrc.indexOf(':') + 1, newImageSrc.indexOf(';'));
                    currentImageSource = { base64: newImageSrc, mimeType: newMimeType };
                } else {
                    throw new Error(`Frame ${i+1} generation failed.`);
                }
            }
        } catch (err) {
            if (!isCancelledRef.current) {
                setError(err instanceof Error ? err.message : String(err));
            }
        } finally {
            setIsGenerating(false);
            setProgressMessage('');
        }
    };
    
    const handleGenerateNextFrame = async () => {
        if (!nextPrompt.trim() || isGenerating) return;
    
        let baseImage: { base64: string, mimeType: string };
        if (storyboard.length > 0) {
            const lastImageSrc = storyboard[storyboard.length - 1].image;
            const mimeType = lastImageSrc.substring(lastImageSrc.indexOf(':') + 1, lastImageSrc.indexOf(';'));
            baseImage = { base64: lastImageSrc, mimeType };
        } else if (inputImage) {
            baseImage = inputImage;
        } else {
            setError("No base image found to generate the next frame.");
            return;
        }
    
        setIsGenerating(true);
        setError(null);
        isCancelledRef.current = false;
        
        const newFrameIndex = storyboard.length;
        setProgressMessage(`Generating Frame ${newFrameIndex + 2}...`);
    
        const newFrame: StoryboardFrame = {
            prompt: nextPrompt,
            image: '',
            isLoading: true,
        };
        
        // Add inputImage as the first frame if storyboard is empty
        if (storyboard.length === 0 && inputImage) {
            const firstFrame: StoryboardFrame = { image: inputImage.base64, prompt: "Initial user-provided image.", isLoading: false };
            setStoryboard([firstFrame, newFrame]);
        } else {
            setStoryboard(prev => [...prev, newFrame]);
        }
        setNextPrompt('');
    
        try {
            const result = await generateNextFrame(baseImage.base64, baseImage.mimeType, newFrame.prompt);
            
            if (isCancelledRef.current) {
                setStoryboard(prev => prev.slice(0, -1)); // Remove placeholder
                return;
            }
    
            if (result.images && result.images.length > 0) {
                const newImageSrc = result.images[0];
                setStoryboard(prev => prev.map((frame, index) => 
                    index === newFrameIndex + (storyboard.length === 0 ? 1 : 0) ? { ...frame, image: newImageSrc, isLoading: false } : frame
                ));
            } else {
                throw new Error(`Frame ${newFrameIndex + 2} generation failed.`);
            }
        } catch (err) {
            if (!isCancelledRef.current) {
                setError(err instanceof Error ? err.message : String(err));
                setStoryboard(prev => prev.slice(0, -1)); // Remove placeholder on error
            }
        } finally {
            setIsGenerating(false);
            setProgressMessage('');
        }
    };

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedPromptIndex(index);
            setTimeout(() => setCopiedPromptIndex(null), 2000);
        });
    };
    
    const handleDownloadStoryboard = () => {
        let htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>VXSG Storyboard</title><style>body{font-family:sans-serif;background:#111;color:#eee;padding:2rem} .frame{border:1px solid #444;border-radius:8px;margin-bottom:2rem;padding:1rem;background:#222} img{max-width:100%;height:auto;border-radius:4px} p{background:#333;padding:.5rem;border-radius:4px;white-space:pre-wrap;font-family:monospace}</style></head><body><h1>VXSG Storyboard</h1>`;

        const framesToDownload = storyboard.length > 0 ? storyboard : (inputImage ? [{ image: inputImage.base64, prompt: 'Initial user-provided image.', isLoading: false }] : []);

        framesToDownload.forEach((frame, index) => {
            if (!frame.isLoading && frame.image) {
                htmlContent += `<div class="frame"><h2>Frame ${index + 1}</h2><img src="${frame.image}" alt="Storyboard Frame ${index + 1}"><p>${frame.prompt}</p></div>`;
            }
        });

        htmlContent += `</body></html>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'vxsg-storyboard.html';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const ModeSwitcher = () => (
        <div className="flex justify-center mb-8">
            <div className="flex p-1 space-x-1 bg-black/40 border border-white/10 rounded-xl backdrop-blur-md">
                <button
                    onClick={() => setMode('simple')}
                    disabled={isGenerating || storyboard.length > 0}
                    className={`px-6 py-2 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${mode === 'simple' ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'text-gray-400 hover:text-white'}`}
                >
                    AUTO-SEQUENCE
                </button>
                <button
                    onClick={() => setMode('complex')}
                    disabled={isGenerating || storyboard.length > 0}
                    className={`px-6 py-2 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${mode === 'complex' ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'text-gray-400 hover:text-white'}`}
                >
                    MANUAL-DIRECTOR
                </button>
            </div>
        </div>
    );

    const renderInitialState = () => (
        <div className="text-center max-w-lg mx-auto glass-panel p-8 rounded-3xl border border-dashed border-white/20 hover:border-amber-400/50 transition-colors duration-300">
            <div className="mb-4 flex justify-center">
                <div className="p-4 rounded-full bg-amber-500/10 text-amber-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2 tracking-wide">{t('vxsg_upload_prompt')}</h3>
            <p className="text-sm text-gray-400 mb-6">Upload your keyframe to begin narrative generation.</p>
            <ImageUploader 
                onImageUpload={handleImageUpload} 
                onClearImage={handleClearImage}
                inputImage={null}
                id="vxsg-image-upload"
            />
        </div>
    );
    
    const renderSimpleModeConfig = () => (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-1 space-y-6">
                <div className="relative aspect-square w-full bg-black/40 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                    <img src={inputImage!.base64} alt="Starting frame" className="w-full h-full object-cover"/>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2 text-center text-xs text-white font-mono border-t border-white/10">
                        KEYFRAME 001
                    </div>
                </div>
                <Button onClick={handleStartOver} variant="secondary" className="w-full">{t('vxsg_start_over_button')}</Button>
            </div>
            <div className="lg:col-span-2 space-y-6 p-8 glass-panel rounded-3xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-20">
                    <svg className="w-32 h-32 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/></svg>
                </div>
                <div className="relative z-10">
                    <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                        <span className="text-amber-400">SCENE</span> CONFIGURATION
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <label htmlFor="story-idea" className="block text-xs font-bold text-amber-400 mb-2 uppercase tracking-widest">{t('vxsg_story_idea_label')}</label>
                            <textarea 
                                id="story-idea"
                                rows={3}
                                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all resize-none"
                                placeholder={t('vxsg_story_idea_placeholder')}
                                value={storyIdea}
                                onChange={e => setStoryIdea(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="num-frames" className="block text-xs font-bold text-amber-400 mb-2 uppercase tracking-widest">{t('vxsg_num_frames_label')}: <span className="text-white">{numFrames}</span></label>
                            <input 
                                id="num-frames"
                                type="range"
                                min="2"
                                max="20"
                                value={numFrames}
                                onChange={e => setNumFrames(Number(e.target.value))}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                            />
                            <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono">
                                <span>SHORT (2)</span>
                                <span>EXTENDED (20)</span>
                            </div>
                        </div>
                        <div className="pt-4">
                             <Button onClick={handleGenerate} isLoading={isGenerating} className="w-full py-4 text-lg">
                                {t('vxsg_generate_button')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderComplexModeControls = () => (
        <div className="space-y-6 p-8 glass-panel rounded-3xl relative">
            <div className="relative z-10">
                 <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <span className="text-amber-400">MANUAL</span> DIRECTION
                </h3>
                <div>
                    <label htmlFor="next-prompt" className="block text-xs font-bold text-amber-400 mb-2 uppercase tracking-widest">
                        Prompt for Next Frame ({storyboard.length > 0 ? `Frame ${storyboard.length + 1}` : `Frame 2`})
                    </label>
                    <textarea 
                        id="next-prompt"
                        rows={3}
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all resize-none"
                        placeholder="e.g., The camera zooms in on the artifact..."
                        value={nextPrompt}
                        onChange={e => setNextPrompt(e.target.value)}
                        disabled={isGenerating}
                    />
                </div>
                <div className="mt-6">
                    <Button onClick={handleGenerateNextFrame} isLoading={isGenerating} disabled={!nextPrompt.trim()} className="w-full">
                        Generate Next Frame
                    </Button>
                </div>
            </div>
        </div>
    );

    const renderResultsState = () => {
        const framesToRender = (mode === 'complex' && storyboard.length === 1 && storyboard[0].isLoading && inputImage)
            ? [{ image: inputImage.base64, prompt: "Initial user-provided image.", isLoading: false }, ...storyboard]
            : storyboard;

        return (
            <div className="w-full animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">STORYBOARD <span className="text-gray-600 font-mono text-lg">SEQ_001</span></h2>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={handleDownloadStoryboard} variant="secondary" className="text-xs">
                            {t('vxsg_download_button')}
                        </Button>
                        <Button onClick={handleStartOver} variant="ghost" className="text-xs">
                            {t('vxsg_start_over_button')}
                        </Button>
                    </div>
                </div>
                
                {isGenerating && progressMessage && (
                    <div className="text-center mb-8">
                         <div className="inline-flex items-center gap-3 px-6 py-3 bg-amber-900/20 border border-amber-500/30 rounded-full text-amber-400 font-mono text-sm">
                            <Spinner /> 
                            <span>{progressMessage}</span>
                        </div>
                    </div>
                )}

                {/* Filmstrip Container */}
                <div className="relative">
                    {/* Sprocket Holes Top */}
                    <div className="h-6 w-full flex justify-between px-2 mb-2 opacity-20">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div key={i} className="w-4 h-3 bg-white rounded-sm"></div>
                        ))}
                    </div>

                    <div className="flex overflow-x-auto space-x-8 pb-8 pt-4 px-4 no-scrollbar snap-x snap-mandatory">
                        {framesToRender.map((frame, index) => (
                            <div key={index} className="w-80 md:w-96 flex-shrink-0 snap-center group perspective-1000" style={{ animationDelay: `${index * 100}ms` }}>
                                <div className="bg-gray-950 border border-white/10 rounded-lg p-4 shadow-2xl transform transition-all duration-500 hover:scale-[1.02] hover:border-amber-500/30">
                                    {/* Frame Number */}
                                    <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                                        <span className="text-xs font-mono text-amber-500">FRAME_{String(index + 1).padStart(3, '0')}</span>
                                        <div className="h-1.5 w-1.5 bg-gray-700 rounded-full"></div>
                                    </div>
                                    
                                    {/* Image */}
                                    <div className="relative aspect-video w-full bg-black rounded border border-white/5 overflow-hidden mb-4">
                                       {frame.isLoading ? (
                                           <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                                               <Spinner />
                                           </div>
                                       ) : (
                                           <img src={frame.image} alt={`Frame ${index + 1}`} className="w-full h-full object-cover"/>
                                       )}
                                    </div>
                                    
                                    {/* Prompt */}
                                    <div className="relative bg-black/40 p-3 rounded border border-white/5 h-32 overflow-y-auto custom-scrollbar group-hover:border-amber-500/20 transition-colors">
                                       <p className="text-[10px] font-mono text-gray-400 leading-relaxed">{frame.prompt}</p>
                                       <button onClick={() => handleCopy(frame.prompt, index)} title={t('vxsg_copy_prompt_tooltip')} className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-amber-500/20 rounded-md text-gray-500 hover:text-amber-400 transition-colors">
                                           {copiedPromptIndex === index ? (
                                               <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                           ) : (
                                               <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" /></svg>
                                           )}
                                       </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Sprocket Holes Bottom */}
                     <div className="h-6 w-full flex justify-between px-2 mt-2 opacity-20">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div key={i} className="w-4 h-3 bg-white rounded-sm"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div className="max-w-[1600px] mx-auto px-4 pb-20">
            <div className="text-center mb-12 animate-fade-in-up pt-10">
                <div className="inline-block mb-4 px-4 py-1 rounded-full border border-amber-500/30 bg-amber-900/10 text-amber-400 text-xs font-mono tracking-[0.2em]">
                    NARRATIVE ENGINE
                </div>
                <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-4">
                    VXSG <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600">STORYBOARD</span>
                </h1>
                <p className="text-gray-400 max-w-2xl mx-auto font-light text-lg">
                    Gemini 3.0 Pro powered sequential image generation.
                </p>
            </div>
            
            <ModeSwitcher />

            {error && (
                <div className="my-8 max-w-2xl mx-auto p-4 bg-red-950/50 border border-red-500/30 text-red-300 text-sm font-mono rounded-lg text-center shadow-lg">
                    <span className="font-bold text-red-500">SYSTEM ERROR:</span> {error}
                </div>
            )}
            
            {/* Case 1: No image uploaded yet */}
            {!inputImage && !isGenerating && renderInitialState()}

            {/* Case 2: Image uploaded, but generation not started */}
            {inputImage && storyboard.length === 0 && !isGenerating && (
                <>
                    {mode === 'simple' && renderSimpleModeConfig()}
                    {mode === 'complex' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                            <div className="lg:col-span-1 space-y-6">
                                <div className="relative aspect-square w-full bg-black/40 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                                    <img src={inputImage!.base64} alt="Starting frame" className="w-full h-full object-cover"/>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2 text-center text-xs text-white font-mono border-t border-white/10">
                                        KEYFRAME 001
                                    </div>
                                </div>
                                <Button onClick={handleStartOver} variant="secondary" className="w-full">{t('vxsg_start_over_button')}</Button>
                            </div>
                            <div className="lg:col-span-2">
                                {renderComplexModeControls()}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Case 3: Generation in progress or finished */}
            {(storyboard.length > 0 || isGenerating) && (
                <>
                    {renderResultsState()}
                    {mode === 'complex' && !isGenerating && storyboard.length < 20 && (
                        <div className="mt-12 max-w-3xl mx-auto">
                            {renderComplexModeControls()}
                        </div>
                    )}
                    {isGenerating && (
                        <div className="mt-8 text-center">
                            <button onClick={handleCancel} className="text-red-400 hover:text-red-300 text-xs uppercase tracking-widest border-b border-red-400/30 hover:border-red-300 transition-all pb-1">
                                {t('vxsg_cancel_button')}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default VXSGPage;
