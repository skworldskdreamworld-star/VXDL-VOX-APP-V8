
import React, { useState, useEffect, useRef } from 'react';
import { performGroundedSearch, generateFollowUpSuggestions } from '../services/geminiService';
import { useTranslations } from '../hooks/useTranslations';
import type { GroundingChunk } from '../types';

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    sources?: GroundingChunk[];
    usedMaps?: boolean;
}

// Typewriter Effect Component for immersive text streaming
const TypewriterText = ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
    const [displayedText, setDisplayedText] = useState('');
    const indexRef = useRef(0);

    useEffect(() => {
        indexRef.current = 0;
        setDisplayedText('');
        
        const interval = setInterval(() => {
            if (indexRef.current < text.length) {
                setDisplayedText((prev) => prev + text.charAt(indexRef.current));
                indexRef.current++;
            } else {
                clearInterval(interval);
                if (onComplete) onComplete();
            }
        }, 10); // Slightly faster for search engine feel

        return () => clearInterval(interval);
    }, [text, onComplete]);

    return <SimpleMarkdownRenderer text={displayedText} />;
};

const SimpleMarkdownRenderer = ({ text }: { text: string }) => {
    // Regex to bold text between ** **
    const parts = text.split(/(\*\*.*?\*\*)/g);
    
    return (
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm md:text-base font-light tracking-wide">
            {parts.map((part, index) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={index} className="text-emerald-300 font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">{part.slice(2, -2)}</strong>;
                }
                return <span key={index}>{part}</span>;
            })}
        </div>
    );
};

const SearchStatus = ({ query }: { query: string }) => {
    const [status, setStatus] = useState('Initializing uplink...');
    
    useEffect(() => {
        const phases = [
            "Parsing intent...",
            "Accessing Google Search index...",
            "Triangulating geolocation data...",
            "Querying Google Maps API...",
            "Cross-referencing sources...",
            "Synthesizing Gemini response..."
        ];
        
        // Heuristic: if query implies location, show maps status earlier
        const isLocational = /where|near|location|map|place|find/i.test(query);
        let currentPhases = isLocational 
            ? ["Locating...", "Accessing Google Maps...", "Retrieving place data...", "Synthesizing..."] 
            : phases;

        let i = 0;
        setStatus(currentPhases[0]);
        
        const interval = setInterval(() => {
            i = (i + 1) % currentPhases.length;
            setStatus(currentPhases[i]);
        }, 600);

        return () => clearInterval(interval);
    }, [query]);

    return (
        <div className="flex flex-col">
            <span className="text-xs font-bold text-emerald-300 tracking-wide animate-pulse">{status.toUpperCase()}</span>
            <span className="text-[10px] text-emerald-500/70 font-mono">Real-time latency: ~14ms</span>
        </div>
    );
};

function VUXPage() {
    const { t } = useTranslations();
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isSearching]);

    // Auto-focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSendMessage = async (prompt?: string) => {
        const text = prompt || query;
        if (!text.trim()) return;
        
        setQuery('');
        setFollowUpSuggestions([]); // Clear old suggestions while thinking
        setShowSuggestions(false);
        setIsSearching(true);
        
        // Add User Message locally
        const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
        setMessages(prev => [...prev, userMsg]);
        
        // Construct history for API context
        const historyPayload = messages
            .filter(msg => !msg.text.includes("SYSTEM ERROR")) // Skip error messages
            .map(msg => ({
                role: msg.role,
                parts: [{ text: msg.text }]
            }));
        
        // Add the new message to the payload
        historyPayload.push({ role: 'user', parts: [{ text }] });

        try {
            // 1. Perform Search with full context
            const response = await performGroundedSearch(historyPayload);
            
            // Check if Maps was used
            const usedMaps = response.sources.some(s => s.maps);

            // 2. Add Model Message
            const modelMsg: Message = { 
                id: (Date.now() + 1).toString(), 
                role: 'model', 
                text: response.text, 
                sources: response.sources,
                usedMaps
            };
            setMessages(prev => [...prev, modelMsg]);

            // 3. Generate Next Steps (in background)
            const suggestions = await generateFollowUpSuggestions(response.text);
            setFollowUpSuggestions(suggestions);
            
        } catch (e: any) {
            console.error(e);
            setMessages(prev => [...prev, { 
                id: Date.now().toString(), 
                role: 'model', 
                text: `**SYSTEM ERROR:** ${e.message || 'Connection to Gemini Core interrupted.'}` 
            }]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleCopyText = (text: string, id: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-black flex flex-col pb-safe">
            
            {/* Background Elements */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]"></div>
                
                {/* Glows */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-900/20 blur-[120px] rounded-full opacity-50"></div>
                <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-cyan-900/10 blur-[120px] rounded-full opacity-30"></div>
            </div>

            {/* Content Area */}
            <div className="relative z-10 flex-1 flex flex-col max-w-5xl mx-auto w-full pt-20 md:pt-24 pb-4 px-4 md:px-8 min-h-0">
                
                {messages.length === 0 ? (
                    // Initial State
                    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in-up min-h-0 overflow-y-auto">
                        <div className="relative group mb-8">
                             <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
                             <div className="relative w-20 h-20 rounded-2xl bg-black border border-emerald-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                             </div>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tight text-center">
                            VUX <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">INTELLIGENCE</span>
                        </h1>
                        <p className="text-gray-400 text-center max-w-lg font-light text-lg mb-8">
                            Real-time reasoning engine powered by Gemini 3.0 Pro. Access Google Search and Maps with grounded truth.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                            {[
                                "Best Italian restaurants nearby",
                                "Latest breakthroughs in quantum computing",
                                "Navigate to the nearest coffee shop",
                                "Market analysis for renewable energy 2025"
                            ].map((suggestion, i) => (
                                <button 
                                    key={i}
                                    onClick={() => handleSendMessage(suggestion)}
                                    className="p-4 text-left glass-panel rounded-xl hover:bg-white/5 border-white/5 hover:border-emerald-500/30 transition-all group"
                                >
                                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{suggestion}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    // Chat Stream
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-2 scroll-smooth">
                        {messages.map((msg, idx) => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                                <div className={`
                                    max-w-[90%] md:max-w-[80%] 
                                    ${msg.role === 'user' 
                                        ? 'bg-white/5 border border-white/10 rounded-2xl rounded-tr-sm px-6 py-4' 
                                        : 'glass-panel border-emerald-500/20 rounded-2xl rounded-tl-sm p-6 shadow-2xl shadow-black/50'
                                    }
                                `}>
                                    {msg.role === 'model' && (
                                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"></div>
                                                <span className="text-[10px] font-mono text-emerald-400 tracking-widest uppercase">GEMINI 3.0 PRO</span>
                                            </div>
                                            {/* Maps Notification */}
                                            {msg.usedMaps && (
                                                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono text-amber-400 animate-pulse">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                    GEO-SPATIAL LOCK
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Only typewrite the last message if it's from the model */}
                                    {msg.role === 'model' && idx === messages.length - 1 && !showSuggestions ? (
                                        <TypewriterText 
                                            text={msg.text} 
                                            onComplete={() => setShowSuggestions(true)} 
                                        />
                                    ) : (
                                        <SimpleMarkdownRenderer text={msg.text} />
                                    )}
                                    
                                    {msg.role === 'model' && (
                                        <div className="mt-2 flex justify-start">
                                            <button 
                                                onClick={() => handleCopyText(msg.text, msg.id)}
                                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-emerald-400 transition-all"
                                                title="Copy text"
                                            >
                                                {copiedId === msg.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                        <span className="text-[10px] text-emerald-400 font-mono">COPIED</span>
                                                    </div>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {/* Sources Display */}
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-6 pt-4 border-t border-white/5">
                                            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                                Verified Data Streams
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {msg.sources.slice(0, 4).map((s, i) => (
                                                    <a 
                                                        href={s.web?.uri || s.maps?.uri} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        key={i} 
                                                        className={`flex items-center gap-3 p-2 rounded-lg border transition-all group ${
                                                            s.maps 
                                                            ? 'bg-amber-900/10 border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-900/30'
                                                            : 'bg-black/40 border-white/5 hover:border-emerald-500/40 hover:bg-emerald-900/20'
                                                        }`}
                                                    >
                                                        <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono ${
                                                            s.maps ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400 group-hover:text-emerald-300'
                                                        }`}>
                                                            {s.maps ? (
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                            ) : (
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-xs text-gray-300 truncate group-hover:text-white font-medium">
                                                                {s.web?.title || s.maps?.title || 'External Source'}
                                                            </div>
                                                            <div className={`text-[10px] truncate ${s.maps ? 'text-amber-400/70' : 'text-gray-600 group-hover:text-emerald-400/70'}`}>
                                                                {s.maps ? 'Google Maps Data' : new URL(s.web?.uri || 'https://google.com').hostname}
                                                            </div>
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isSearching && (
                            <div className="flex justify-start animate-fade-in">
                                <div className="glass-panel px-6 py-4 rounded-2xl rounded-tl-sm flex items-center gap-4 border border-emerald-500/20">
                                    <div className="relative w-6 h-6">
                                        <div className="absolute inset-0 border-2 border-emerald-500/30 rounded-full"></div>
                                        <div className="absolute inset-0 border-t-2 border-emerald-400 rounded-full animate-spin"></div>
                                    </div>
                                    <SearchStatus query={messages[messages.length - 1]?.text || ""} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-px" />
                    </div>
                )}

                {/* Footer Area */}
                <div className="mt-4 space-y-4 relative z-20 flex-shrink-0">
                    
                    {/* Follow-up Suggestions */}
                    {(showSuggestions || (!isSearching && followUpSuggestions.length > 0)) && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 mask-linear-fade">
                            {followUpSuggestions.map((s, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => handleSendMessage(s)} 
                                    className="whitespace-nowrap px-4 py-2 rounded-lg bg-gray-900/80 border border-white/10 hover:border-emerald-500/50 text-xs text-gray-400 hover:text-emerald-300 transition-all backdrop-blur-md flex items-center gap-2 animate-fade-in-up"
                                    style={{ animationDelay: `${i * 100}ms` }}
                                >
                                    <span className="opacity-50">+</span> {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input Omnibar */}
                    <div className="relative group max-w-3xl mx-auto">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/50 via-teal-500/50 to-cyan-500/50 rounded-full blur opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition duration-700"></div>
                        <div className="relative flex items-center bg-black rounded-full border border-white/10 group-focus-within:border-transparent transition-all shadow-2xl">
                            <div className="pl-5 text-gray-500 group-focus-within:text-emerald-400 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <input 
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                placeholder={t('vux_placeholder')}
                                className="flex-grow bg-transparent border-none focus:ring-0 text-white px-4 py-4 placeholder-gray-600 font-light"
                                disabled={isSearching}
                                autoComplete="off"
                            />
                            <button 
                                onClick={() => handleSendMessage()} 
                                disabled={!query.trim() || isSearching}
                                className="m-1.5 p-2.5 rounded-full bg-white/5 hover:bg-emerald-500 text-gray-400 hover:text-white transition-all disabled:opacity-50 disabled:hover:bg-transparent"
                            >
                                <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" /></svg>
                            </button>
                        </div>
                    </div>
                    
                    <div className="text-center">
                         <p className="text-[10px] font-mono text-gray-700 uppercase tracking-[0.3em]">VUX Secure Connection // v3.0.1</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default VUXPage;
