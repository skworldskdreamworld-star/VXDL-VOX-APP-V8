
import React, { useState } from 'react';
import Button from './Button';
import Spinner from './Spinner';

interface VideoToolsProps {
    currentImage: { base64: string; mimeType: string } | null;
    onGenerateVideo: (motionPrompt: string) => void;
    quota: number;
    onRedeemToken: (token: string) => boolean;
    isGenerating: boolean;
    progress: string;
}

const VideoTools: React.FC<VideoToolsProps> = ({ currentImage, onGenerateVideo, quota, onRedeemToken, isGenerating, progress }) => {
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [motionPrompt, setMotionPrompt] = useState('');
    const [tokenError, setTokenError] = useState('');

    const handleOpenGenerate = () => {
        if (quota > 0) {
            setIsPromptModalOpen(true);
        } else {
            setIsTokenModalOpen(true);
        }
    };

    const handleTokenSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (onRedeemToken(tokenInput)) {
            setIsTokenModalOpen(false);
            setTokenInput('');
            setTokenError('');
        } else {
            setTokenError('Invalid token code.');
        }
    };

    const handleGenerateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalPrompt = motionPrompt.trim() || "Animate this scene naturally.";
        onGenerateVideo(finalPrompt);
        setIsPromptModalOpen(false);
        setMotionPrompt('');
    };

    if (!currentImage && !isGenerating) return null;

    return (
        <>
            {/* Floating Pill UI */}
            <div className="flex items-center gap-2 bg-gray-900/80 backdrop-blur-md border border-white/10 rounded-full px-2 py-2 shadow-2xl animate-fade-in">
                {/* Status / Progress */}
                {isGenerating ? (
                     <div className="flex items-center gap-3 px-2">
                         <Spinner />
                         <span className="text-xs text-purple-300 font-mono animate-pulse">{progress}</span>
                     </div>
                ) : (
                    <>
                         {/* Quota Indicator */}
                        <button 
                            onClick={() => setIsTokenModalOpen(true)}
                            className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-mono text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                            title="Video Quota (Daily Reset)"
                        >
                            <span>VEO CREDITS</span>
                            <span className={`font-bold ${quota > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{quota}/3</span>
                        </button>

                        <div className="w-px h-4 bg-white/10"></div>

                        {/* Animate Button */}
                        <button
                            onClick={handleOpenGenerate}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-300 hover:text-white rounded-full transition-all group"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs font-bold tracking-wide">ANIMATE (VEO)</span>
                        </button>
                    </>
                )}
            </div>

            {/* Prompt Modal */}
            {isPromptModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 border border-purple-500/30 p-6 rounded-2xl w-full max-w-md shadow-2xl shadow-purple-900/20 relative">
                        <button onClick={() => setIsPromptModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        <h3 className="text-lg font-bold text-white mb-1">Director's Instruction</h3>
                        <p className="text-xs text-gray-400 mb-4">Describe the motion you want to see (e.g., "Pan right", "Character waves", "Zoom in").</p>
                        <form onSubmit={handleGenerateSubmit} className="space-y-4">
                            <textarea
                                value={motionPrompt}
                                onChange={(e) => setMotionPrompt(e.target.value)}
                                placeholder="e.g., Cinematic zoom into the subject, slow motion..."
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-purple-500/50 h-24 resize-none"
                                autoFocus
                            />
                            <div className="flex justify-end gap-3">
                                <Button type="submit" disabled={isGenerating}>
                                    Generate Video
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Token Modal */}
            {isTokenModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative">
                        <button onClick={() => setIsTokenModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 text-purple-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-white">Refill Quota</h3>
                            <p className="text-xs text-gray-400 mt-1">Enter a valid API token to add credits.</p>
                        </div>
                        <form onSubmit={handleTokenSubmit} className="space-y-4">
                            <div>
                                <input
                                    type="text"
                                    value={tokenInput}
                                    onChange={(e) => setTokenInput(e.target.value)}
                                    placeholder="ENTER TOKEN (e.g. VEO-FAST)"
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-center text-white text-sm focus:outline-none focus:border-white/30 font-mono tracking-wider uppercase"
                                />
                                {tokenError && <p className="text-xs text-red-400 mt-2 text-center">{tokenError}</p>}
                            </div>
                            <button 
                                type="submit"
                                className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors text-sm"
                            >
                                REDEEM TOKEN
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default VideoTools;
