
import React, { useState, useMemo } from 'react';
import { vxplTemplates, PromptTemplate } from '../vxplTemplates';
import { useTranslations } from '../hooks/useTranslations';
import LazyLoadItem from './LazyLoadItem';

// A single template card component.
interface TemplateCardProps {
  template: PromptTemplate;
  isExpanded: boolean;
  onToggle: () => void;
  animationDelay: string;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, isExpanded, onToggle, animationDelay }) => {
  const { t } = useTranslations();
  const [isCopied, setIsCopied] = useState(false);
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!template.prompt || isCopied) return;
    navigator.clipboard.writeText(template.prompt).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const title = t(template.title);
  const description = t(template.description);
  
  return (
    <div 
      className={`
        relative overflow-hidden rounded-2xl border transition-all duration-500
        ${isExpanded ? 'bg-indigo-950/30 border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.15)]' : 'bg-gray-950/40 border-white/5 hover:border-indigo-500/30 hover:bg-gray-900/60'}
        animate-fade-in-up group
      `}
      style={{ animationDelay }}
    >
      {/* Holographic Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" style={{backgroundSize: '200% 200%'}}></div>

      <button 
        onClick={onToggle} 
        className="p-6 w-full text-left relative z-10 h-full flex flex-col"
        aria-expanded={isExpanded}
        aria-controls={`prompt-content-${template.id}`}
      >
        <div className="flex justify-between items-start w-full mb-4">
            <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-indigo-400 tracking-widest uppercase opacity-70">{template.category}</span>
                <h3 className="text-lg font-bold text-white group-hover:text-indigo-200 transition-colors leading-tight">{title}</h3>
            </div>
            <div className={`p-2 rounded-full bg-white/5 transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-indigo-500/20 text-indigo-300' : 'text-gray-500 group-hover:text-white'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
        
        <p className="text-sm text-gray-400 font-light leading-relaxed mb-4 line-clamp-2 group-hover:text-gray-300 transition-colors">
            {description}
        </p>
        
        {/* Visual Preview Placeholder (Optional - assuming images exist in template data) */}
        {template.afterImage && !isExpanded && (
            <div className="mt-auto w-full h-32 rounded-lg overflow-hidden relative opacity-60 group-hover:opacity-100 transition-opacity">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
                <img src={template.afterImage} alt="Preview" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" loading="lazy" />
            </div>
        )}
      </button>
      
      {isExpanded && (
        <div
          id={`prompt-content-${template.id}`}
          className="px-6 pb-6 relative z-10 animate-fade-in"
        >
          <div className="bg-black/50 border border-white/10 rounded-xl p-4 relative backdrop-blur-sm">
            <div className="absolute -top-3 left-4 px-2 bg-indigo-900/80 text-[10px] font-mono text-indigo-300 border border-indigo-500/30 rounded">RAW_DATA</div>
            <p className="text-xs text-gray-300 font-mono selectable-text leading-relaxed break-words pt-2">
              {template.prompt}
            </p>
            <div className="mt-4 flex justify-end">
                <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
                >
                {isCopied ? (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        <span>COPIED</span>
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" /></svg>
                        <span>COPY PROMPT</span>
                    </>
                )}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VXPLPage() {
    const { t } = useTranslations();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const handleToggleExpand = (templateId: string) => {
        setExpandedId(prevId => (prevId === templateId ? null : templateId));
    };

    const getTranslatedCategory = (category: string) => {
        const key = `vxplCategory${category.replace(/[^a-zA-Z]/g, '')}`;
        return t(key);
    };

    const filteredTemplates = useMemo(() => {
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        if (!lowercasedQuery) return vxplTemplates;

        return vxplTemplates.filter(template => {
            const translatedTitle = t(template.title).toLowerCase();
            const translatedDescription = t(template.description).toLowerCase();
            const translatedCategory = getTranslatedCategory(template.category).toLowerCase();
            const originalTitle = template.title.toLowerCase();
            const originalDescription = template.description.toLowerCase();
            const originalCategory = template.category.toLowerCase();

            return translatedTitle.includes(lowercasedQuery) ||
                   translatedDescription.includes(lowercasedQuery) ||
                   translatedCategory.includes(lowercasedQuery) ||
                   originalTitle.includes(lowercasedQuery) ||
                   originalDescription.includes(lowercasedQuery) ||
                   originalCategory.includes(lowercasedQuery);
        });
    }, [searchQuery, t]);
    
    const categories = useMemo(() => {
        return filteredTemplates.reduce((acc, template) => {
            (acc[template.category] = acc[template.category] || []).push(template);
            return acc;
        }, {} as Record<string, PromptTemplate[]>);
    }, [filteredTemplates]);
    
    const categoryOrder = [
        'Professional',
        'Photography',
        'Utility',
        'Character Design',
        'VXDL PERSONA',
        'Environment & Worlds',
        'Artistic',
        'UI & Icons',
        'Abstract & Sci-Fi',
        'Creative & Fun'
    ];

    return (
        <div className="max-w-[1600px] mx-auto px-4 pb-20">
            <div className="text-center mb-16 animate-fade-in-up pt-10">
                <div className="inline-block mb-4 px-4 py-1 rounded-full border border-indigo-500/30 bg-indigo-900/10 text-indigo-400 text-xs font-mono tracking-[0.2em]">
                    SEMANTIC DATABASE
                </div>
                <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-6">
                    VXPL <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-600">ARCHIVE</span>
                </h1>
                
                {/* Omnibar Search */}
                <div className="max-w-3xl mx-auto relative group z-20">
                     <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full blur opacity-20 group-focus-within:opacity-50 transition duration-1000"></div>
                     <div className="relative bg-gray-950 rounded-full flex items-center p-1 border border-white/10">
                        <div className="pl-6 text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('vxplSearchPlaceholder')}
                            className="w-full bg-transparent border-none py-4 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-0 text-lg font-light"
                            aria-label="Search archive"
                        />
                     </div>
                </div>
            </div>

            {filteredTemplates.length > 0 ? (
                <div className="space-y-16">
                    {categoryOrder.map(category => (
                        categories[category] && (
                            <LazyLoadItem key={category} placeholderHeight="300px">
                                <section className="animate-fade-in">
                                    <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-4">
                                        <div className="h-px flex-grow bg-gradient-to-r from-transparent to-indigo-900/50"></div>
                                        <h2 className="text-sm font-mono font-bold text-indigo-400 tracking-widest uppercase">
                                            // {getTranslatedCategory(category)}
                                        </h2>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                                        {categories[category].map((template, index) => (
                                            <TemplateCard
                                                key={template.id}
                                                template={template}
                                                isExpanded={expandedId === template.id}
                                                onToggle={() => handleToggleExpand(template.id)}
                                                animationDelay={`${index * 50}ms`}
                                            />
                                        ))}
                                    </div>
                                </section>
                            </LazyLoadItem>
                        )
                    ))}
                </div>
            ) : (
                <div className="text-center text-gray-500 py-24 animate-fade-in">
                     <div className="mb-4 inline-block p-4 rounded-full bg-white/5 text-gray-600">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     </div>
                    <p className="text-xl font-light">{t('vxplNoResults')}</p>
                    <p className="text-sm mt-2">Try adjusting your search terms.</p>
                </div>
            )}
            
             <div className="mt-24 text-center border-t border-white/5 pt-8">
                  <p className="text-xs text-gray-600 font-mono">
                      VXPL ARCHIVE V3.0 // INDEXING {vxplTemplates.length} RECORDS
                  </p>
              </div>
        </div>
    );
}

export default VXPLPage;
