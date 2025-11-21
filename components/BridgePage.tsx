
import React, { useState } from 'react';
import { AppView, User } from '../types';
import { useTranslations } from '../hooks/useTranslations';
import LanguageSelector from './LanguageSelector';
import KnowledgeBaseModal from './KnowledgeBaseModal';

// Refined Icons
const VxdlIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="4" strokeOpacity="0.5"/>
        <path d="M9 9h6M9 12h6M9 15h4" strokeLinecap="round"/>
    </svg>
);
const VoxIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3L3 8l9 5 9-5-9-5z" />
        <path d="M3 13l9 5 9-5" />
        <path d="M3 18l9 5 9-5" />
    </svg>
);
const VuxIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
);
const VxogIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
);
const VxsgIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="4" />
        <path d="M6 4v16M18 4v16M2 12h4M18 12h4" />
    </svg>
);
const CosIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M6 6h12v12H6z" strokeOpacity="0.5" />
        <path d="M3 3l3 3M18 18l3 3M18 6l3-3M6 18l-3 3" />
    </svg>
);
const VxplIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
);

interface BridgePageProps {
  onSelectView: (view: AppView) => void;
  user: User;
  onGoToStart: () => void;
}

function BridgePage({ onSelectView, user, onGoToStart }: BridgePageProps) {
  const { t } = useTranslations();
  const [isKbOpen, setIsKbOpen] = useState(false);

  const apps = [
    { id: 'vox', icon: VoxIcon, title: 'VOX', desc: 'Immersive Visual Engine', color: 'text-cyan-400', colSpan: 'col-span-1 md:col-span-2 row-span-2', gradient: 'from-cyan-900/20 to-transparent' },
    { id: 'vxog', icon: VxogIcon, title: 'VXOG', desc: 'Gemini 3.0 Pro', color: 'text-purple-400', colSpan: 'col-span-1 row-span-2', gradient: 'from-purple-900/20 to-transparent' },
    { id: 'vux', icon: VuxIcon, title: 'VUX', desc: 'Reasoning Search', color: 'text-emerald-400', colSpan: 'col-span-1 row-span-1', gradient: 'from-emerald-900/20 to-transparent' },
    { id: 'vxsg', icon: VxsgIcon, title: 'VXSG', desc: 'Storyboard', color: 'text-amber-400', colSpan: 'col-span-1 row-span-1', gradient: 'from-amber-900/20 to-transparent' },
    { id: 'cos', icon: CosIcon, title: 'COS', desc: 'AI Photoshoot', color: 'text-rose-400', colSpan: 'col-span-1 row-span-1', gradient: 'from-rose-900/20 to-transparent' },
    { id: 'vxpl', icon: VxplIcon, title: 'VXPL', desc: 'Prompt Library', color: 'text-indigo-400', colSpan: 'col-span-1 row-span-1', gradient: 'from-indigo-900/20 to-transparent' },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden pb-safe">
        {/* Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-purple-900/10 rounded-full blur-[150px] animate-float"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-cyan-900/10 rounded-full blur-[150px] animate-float" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="w-full max-w-6xl relative z-10 mt-16 md:mt-0">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 animate-fade-in-up gap-6">
                <div>
                    <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight mb-2">
                        VXDL<span className="font-light text-gray-500">abs</span>
                    </h1>
                    <div className="flex items-center gap-2 text-sm font-mono text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span>SYSTEM: ONLINE // USER: {user?.type.toUpperCase()}</span>
                    </div>
                </div>
                <div className="flex gap-4 items-center w-full md:w-auto justify-end">
                    <LanguageSelector />
                    <button onClick={() => onGoToStart()} className="p-3 rounded-full glass-panel text-gray-400 hover:text-white transition-all hover:scale-105">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[160px] md:auto-rows-[180px]">
                {apps.map((app, idx) => {
                    const Icon = app.icon;
                    return (
                        <button
                            key={app.id}
                            onClick={() => onSelectView(app.id as AppView)}
                            className={`
                                ${app.colSpan} glass-panel rounded-3xl p-6 md:p-8 text-left group relative overflow-hidden
                                hover:border-white/20 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50
                                animate-fade-in-up flex flex-col justify-between
                            `}
                            style={{ animationDelay: `${idx * 75}ms` }}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${app.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                            
                            <div className="flex justify-between items-start relative z-10">
                                <div className={`p-3 rounded-2xl bg-white/5 backdrop-blur-sm ${app.color} group-hover:scale-110 transition-transform duration-300`}>
                                    <div className="w-6 h-6 md:w-8 md:h-8">
                                        <Icon />
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                    </svg>
                                </div>
                            </div>
                            
                            <div className="relative z-10">
                                <h2 className="text-2xl md:text-3xl font-bold text-white mb-1 tracking-wide">{app.title}</h2>
                                <p className="text-xs md:text-sm text-gray-400 font-medium">{app.desc}</p>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="mt-12 flex justify-center animate-fade-in" style={{ animationDelay: '600ms' }}>
                <button 
                    onClick={() => setIsKbOpen(true)}
                    className="text-xs font-mono text-gray-600 hover:text-cyan-400 transition-colors flex items-center gap-2 group"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-600 group-hover:bg-cyan-400 transition-colors"></span>
                    ACCESS KNOWLEDGE BASE
                </button>
            </div>
        </div>
        <KnowledgeBaseModal isOpen={isKbOpen} onClose={() => setIsKbOpen(false)} />
    </div>
  );
}

export default BridgePage;
