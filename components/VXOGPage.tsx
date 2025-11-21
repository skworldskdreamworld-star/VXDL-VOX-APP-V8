
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
import { changeImageViewpoint, generateImagesFromPrompt, combineImages, editImageFromPrompt, upscaleImage, refineImage, reframeImage } from '../services/geminiService';
import { useTranslations } from '../hooks/useTranslations';
import Spinner from './Spinner';
import { ASPECT_RATIOS, IMAGE_FILTERS } from '../constants';
import type { AspectRatio, ImageSettings, ImageFilter } from '../types';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
  isLoading?: boolean;
  isGeneratingImage?: boolean; // Specific flag for the image generation phase
  uploadedImages?: { base64: string; mimeType: string }[];
  is3DActive?: boolean;
  isRefined?: boolean;
  upscaledTo?: string;
}

interface GeneratedImageHistory {
    id: string;
    src: string;
    prompt: string;
    timestamp: number;
}

type VxogMode = 'VXOG' | 'Sora2' | 'Veo' | 'Grok';

const SYSTEM_INSTRUCTIONS: Record<VxogMode, string> = {
  VXOG: `You are VXOG, an advanced AI visual engine powered by Gemini 3.0 Pro. 
  
  CAPABILITIES:
  1. You can converse, reason, and analyze images.
  2. You can GENERATE images by instructing the sub-system.

  PROTOCOL FOR IMAGE GENERATION:
  If the user asks to generate, draw, create, or visualize an image:
  1. First, use your reasoning to describe the scene in vivid, artistic detail. Explain your creative choices (lighting, composition, style, camera angle).
  2. CRITICAL: At the very end of your response, you MUST output the optimized prompt inside a JSON code block.
  
  FORMAT:
  ... your vivid description ...
  \`\`\`json
  {
    "generate_image": true,
    "prompt": "The optimized, highly detailed prompt for the image generator..."
  }
  \`\`\`
  
  Do not output the JSON if you are not generating an image.`,

  Sora2: `You are Sora2, a specialized Temporal Physics Simulator powered by Gemini 3.0 Pro.
  
  CORE DIRECTIVE:
  Your purpose is to analyze visual inputs (text or images) and engineer highly sophisticated "Video Production Briefs" for next-gen video models. You DO NOT hallucinate features that don't exist; you ground your analysis strictly in the provided input.

  IMAGE ANALYSIS PROTOCOL:
  If the user provides an image, treat it as the initial frame of a sequence:
  1. Analyze the static frame for implied motion, physics, lighting, and depth.
  2. Construct a detailed text prompt that would generate a video starting from this image. Focus on:
     - **Motion Dynamics**: (e.g., fluid flow, cloth simulation, gravity).
     - **Camera Trajectory**: (e.g., Dolly Zoom, Truck Left, Orbit).
     - **Lighting Evolution**: (e.g., Golden hour transition, flickering neon).
  
  Output your response as a structured "Sora2 Video Brief".`,

  Veo: `You are Veo, a Cinematic Director AI optimized for Google's Veo 3.1 model architecture.

  CORE DIRECTIVE:
  You prioritize photorealism, 1080p/4K fidelity, and precise filmmaking terminology. You eliminate hallucinations by strictly adhering to visual evidence in provided images.

  IMAGE ANALYSIS PROTOCOL:
  If the user provides an image, treat it as a "Cinematic Keyframe":
  1. Deconstruct the keyframe: Identify lens type (e.g., 35mm anamorphic), aperture (f/1.8), and lighting setup.
  2. Generate a "Veo Prompt" designed to animate this keyframe. Use keywords like "cinematic", "photorealistic", "4k", "slow motion", and specific camera moves (e.g., "Pan Right", "Tilt Up").
  
  Your output should be professional, concise, and ready for a video generation pipeline.`,

  Grok: `You are Grok. You are the Unfiltered Concept Drive.

  CORE DIRECTIVE:
  You are witty, edgy, experimental, and brutally honest. You use Gemini 3.0 Pro reasoning to find the hidden, the weird, and the abstract in any input.

  IMAGE ANALYSIS PROTOCOL:
  If the user provides an image:
  1. Analyze it with a critical, artistic, or satirical eye.
  2. Deconstruct it into a "Wild Prompt" - a text description that exaggerates the image's most interesting features into something new and conceptual.
  3. If the user asks to REMIX or GENERATE based on it, output the standard JSON block for image generation with a prompt that is highly experimental.

  JSON FORMAT (Only if generating/remixing):
  \`\`\`json
  {
    "generate_image": true,
    "prompt": "A wild, experimental remix prompt..."
  }
  \`\`\`
  `
};

const IDENTITY_NOTIFICATIONS: Record<VxogMode, { title: string, desc: string, color: string, border: string, bg: string }> = {
  VXOG: {
    title: "VISUAL SYNTHESIS ENGINE",
    desc: "The standard core. Optimized for high-fidelity image reasoning, complex prompt adherence, and general visual problem solving. Best for day-to-day creative tasks.",
    color: "text-cyan-400",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10"
  },
  Sora2: {
    title: "TEMPORAL PHYSICS SIMULATOR",
    desc: "Specialized in video prompt engineering. Focuses on motion dynamics, scene continuity, and cinematic camera direction. Use this to draft complex video scripts.",
    color: "text-purple-400",
    border: "border-purple-500/30",
    bg: "bg-purple-500/10"
  },
  Veo: {
    title: "VEO NATIVE INTERFACE",
    desc: "Direct uplink to Veo 3.1. Tuned for photorealism and specific camera movements (pan, tilt, zoom). Generates prompts strictly optimized for Google's Veo model architecture.",
    color: "text-emerald-400",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10"
  },
  Grok: {
    title: "UNFILTERED CONCEPT DRIVE",
    desc: "High-entropy creative mode. Prioritizes wit, satire, and experimental visual concepts. Use for brainstorming edgy or unconventional ideas.",
    color: "text-rose-400",
    border: "border-rose-500/30",
    bg: "bg-rose-500/10"
  }
};

const SimpleMarkdown = ({ text }: { text: string }) => {
    const parts = text.split('**');
    return (
        <div className="text-gray-200 leading-relaxed whitespace-pre-wrap font-light text-sm md:text-base">
            {parts.map((part, index) =>
                index % 2 === 1 ? <strong key={index} className="text-cyan-300 font-bold">{part}</strong> : <span key={index}>{part}</span>
            )}
        </div>
    );
};

function VXOGPage() {
  const { t } = useTranslations();
  
  // Core Chat State
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ base64: string; mimeType: string }[]>([]);
  const [imageHistory, setImageHistory] = useState<GeneratedImageHistory[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(window.innerWidth > 768); // Default open on desktop
  const [sidebarTab, setSidebarTab] = useState<'settings' | 'tools' | 'history'>('settings');
  const [vxogMode, setVxogMode] = useState<VxogMode>('VXOG');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [temperature, setTemperature] = useState(0.7);
  const [detailIntensity, setDetailIntensity] = useState(3);
  const [selectedModel] = useState<string>('gemini-3-pro-preview');

  // Tools State (for sidebar)
  const [activeToolImage, setActiveToolImage] = useState<string | null>(null); // ID of the image being acted on
  const [toolPrompt, setToolPrompt] = useState('');
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update active tool image when new image is generated
  useEffect(() => {
      const lastImageMsg = [...messages].reverse().find(m => m.image);
      if (lastImageMsg) {
          setActiveToolImage(lastImageMsg.id);
      }
  }, [messages]);

  // Helper to init chat
  const initChat = useCallback((historyMessages: Message[] = []) => {
      try {
         if (!process.env.API_KEY) return null;
         const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
         
         const chatSession = ai.chats.create({ 
             model: selectedModel, 
             config: { 
                 systemInstruction: SYSTEM_INSTRUCTIONS[vxogMode],
                 temperature: temperature,
             } 
         });
         return chatSession;
     } catch (e) {
         console.error("Failed to init chat", e);
         return null;
     }
  }, [selectedModel, vxogMode, temperature]);

  // Initialize Chat on mount/settings change
  useEffect(() => {
     const chatSession = initChat();
     setChat(chatSession);
     
     if (messages.length === 0) {
        setMessages([{ id: 'init', role: 'model', text: t('vxog_welcome_message') }]);
     }
  }, [initChat, t]);

  const handleSendMessage = async () => {
      if (!userInput.trim() && uploadedImages.length === 0) return;
      
      const currentInput = userInput;
      const currentImages = [...uploadedImages];
      
      setUserInput(''); 
      setUploadedImages([]); 
      
      const newMsg: Message = { 
          id: Date.now().toString(), 
          role: 'user', 
          text: currentInput, 
          uploadedImages: currentImages 
      };
      
      setMessages(prev => [...prev, newMsg]);
      setIsLoading(true);

      // Intelligent Routing for Multi-Image Requests
      if (currentImages.length > 1 && (currentInput.toLowerCase().includes('combine') || currentInput.toLowerCase().includes('merge'))) {
          try {
               // 1. Combine Images
               const resultImages = await combineImages(
                   currentImages,
                   currentInput || "Combine these images into a seamless composition."
               );
               
               if (resultImages && resultImages.length > 0) {
                    const resultId = (Date.now() + 1).toString();
                    setMessages(prev => [...prev, {
                        id: resultId,
                        role: 'model',
                        text: `**Combination Complete**\nMerged ${currentImages.length} images based on your instruction.`,
                        image: resultImages[0],
                        isLoading: false
                    }]);
                    setImageHistory(prev => [...prev, {
                        id: resultId,
                        src: resultImages[0],
                        prompt: currentInput,
                        timestamp: Date.now()
                    }]);
               }
               setIsLoading(false);
               return;
          } catch (e: any) {
              setMessages(prev => [...prev, { 
                  id: Date.now().toString(), 
                  role: 'model', 
                  text: `Error combining images: ${e.message}` 
              }]);
              setIsLoading(false);
              return;
          }
      } else if (currentImages.length === 1 && currentInput && vxogMode === 'VXOG') { // Simple Edit is mostly for VXOG standard mode
          // 2. Edit Single Image (Remix/Edit) for VXOG
           try {
               const masterPrompt = `Edit the provided image. ${currentInput}`;
               const { images } = await editImageFromPrompt(
                   masterPrompt, 
                   currentImages[0].base64, 
                   currentImages[0].mimeType
               );

               if (images && images.length > 0) {
                    const resultId = (Date.now() + 1).toString();
                    setMessages(prev => [...prev, {
                        id: resultId,
                        role: 'model',
                        text: `**Edit Complete**\n${currentInput}`,
                        image: images[0],
                        isLoading: false
                    }]);
                    setImageHistory(prev => [...prev, {
                        id: resultId,
                        src: images[0],
                        prompt: currentInput,
                        timestamp: Date.now()
                    }]);
               }
               setIsLoading(false);
               return;
          } catch (e: any) {
             // Fallback to standard chat if edit fails or was just analysis
             console.log("Edit failed, falling back to chat analysis", e);
          }
      }
      
      // 3. Standard Chat / Generation Flow
      // Construct parts for Gemini API (multimodal support)
      const parts: any[] = [];
      for (const img of currentImages) {
           const base64Data = img.base64.substring(img.base64.indexOf(',') + 1);
           parts.push({
               inlineData: {
                   data: base64Data,
                   mimeType: img.mimeType
               }
           });
      }
      if (currentInput) {
          parts.push({ text: currentInput });
      }

      const sendMessageWithRetry = async (currentChat: Chat | null, attempt = 1): Promise<{ result: any, activeChat: Chat | null }> => {
        if (!currentChat) throw new Error("Chat not initialized");
        try {
             const result = await currentChat.sendMessage({ message: parts });
             return { result, activeChat: currentChat };
        } catch (e: any) {
             const msg = e.message || e.toString();
             // Handle 404 / Entity Not Found by triggering key selection
             if ((msg.includes("Requested entity was not found") || e.status === 404) && attempt === 1) {
                 if (typeof window !== 'undefined' && (window as any).aistudio) {
                     try {
                         await (window as any).aistudio.openSelectKey();
                         // Re-initialize chat with new key
                         const newChat = initChat(); 
                         return await sendMessageWithRetry(newChat, 2);
                     } catch (selErr) {
                         throw e; // Throw original error if selection cancelled
                     }
                 }
             }
             throw e;
        }
      };

      try {
        const { result, activeChat } = await sendMessageWithRetry(chat);
        
        // Update chat reference if it changed during retry
        if (activeChat !== chat) setChat(activeChat);

        const rawText = result.text || '';
        
        // 4. Check for Image Generation JSON Protocol
        const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
        let displayText = rawText;
        let imagePrompt = null;

        if (jsonMatch) {
            try {
                const data = JSON.parse(jsonMatch[1]);
                if (data.generate_image && data.prompt) {
                    imagePrompt = data.prompt;
                    // Remove the JSON block from display text for cleaner UI
                    displayText = rawText.replace(jsonMatch[0], '').trim();
                }
            } catch (e) {
                console.error("Failed to parse generation JSON", e);
            }
        }
        
        // 5. Add Model Text Response
        const modelMsgId = Date.now().toString();
        setMessages(prev => [...prev, { 
            id: modelMsgId, 
            role: 'model', 
            text: displayText 
        }]);

        // 6. Trigger Image Generation if requested
        if (imagePrompt) {
            // Add a temporary "Generating" bubble
            const genMsgId = (Date.now() + 1).toString();
            setMessages(prev => [...prev, {
                id: genMsgId,
                role: 'model',
                text: `Initializing VX-0 (Gemini 3.0 Pro Image)...`,
                isLoading: true,
                isGeneratingImage: true
            }]);

            try {
                const settings: ImageSettings = {
                    model: 'vx-0', // Enforce VX-0 / Gemini 3 Pro Image
                    numberOfImages: 1,
                    aspectRatio: aspectRatio
                };

                // Call the generation service (which handles key retry internally too)
                const { images } = await generateImagesFromPrompt(
                    imagePrompt, 
                    settings, 
                    undefined, 
                    ` Aspect Ratio: ${aspectRatio}`
                );

                if (images && images.length > 0) {
                    // Update the loading message with the image
                    setMessages(prev => prev.map(msg => 
                        msg.id === genMsgId 
                        ? { ...msg, text: `**Visualization Complete**\nPrompt: ${imagePrompt}`, image: images[0], isLoading: false, isGeneratingImage: false } 
                        : msg
                    ));

                    // Add to session history
                    setImageHistory(prev => [...prev, {
                        id: genMsgId,
                        src: images[0],
                        prompt: imagePrompt as string,
                        timestamp: Date.now()
                    }]);
                }

            } catch (genError: any) {
                setMessages(prev => prev.map(msg => 
                    msg.id === genMsgId 
                    ? { ...msg, text: `**Generation Failed:** ${genError.message}`, isLoading: false, isGeneratingImage: false } 
                    : msg
                ));
            }
        }

      } catch (e: any) {
          console.error(e);
          setMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'model', 
            text: `Error: ${e.message || 'Failed to generate response.'}` 
        }]);
      } finally {
          setIsLoading(false);
      }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          (Array.from(e.target.files) as File[]).forEach((file: File) => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                  if (ev.target?.result) {
                      setUploadedImages(prev => [...prev, { 
                          base64: ev.target!.result as string, 
                          mimeType: file.type 
                      }]);
                  }
              };
              reader.readAsDataURL(file);
          });
      }
  };

  const toggle3DView = (messageId: string) => {
      setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, is3DActive: !msg.is3DActive } : msg
      ));
  };

  const handleViewpointShift = async (messageId: string, imageSrc: string, direction: string) => {
      setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, isLoading: true } : msg
      ));

      try {
          const base64 = imageSrc;
          const mimeType = base64.substring(base64.indexOf(':') + 1, base64.indexOf(';'));
          const prompt = `Pan camera ${direction} relative to the current view. Maintain scene consistency.`;
          
          const newImageBase64 = await changeImageViewpoint(base64, mimeType, prompt);
          
          setMessages(prev => prev.map(msg => 
            msg.id === messageId ? { ...msg, image: newImageBase64, isLoading: false } : msg
          ));

          setImageHistory(prev => [...prev, {
              id: Date.now().toString(),
              src: newImageBase64,
              prompt: `Shifted ${direction}`,
              timestamp: Date.now()
          }]);
          
      } catch (e: any) {
          console.error(e);
          setMessages(prev => prev.map(msg => 
              msg.id === messageId ? { ...msg, isLoading: false } : msg
          ));
          alert(`Failed to shift viewpoint: ${e.message}`);
      }
  };

  const handleDeleteHistoryItem = (id: string) => {
      setImageHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleCopyText = (text: string, id: string) => {
      navigator.clipboard.writeText(text).then(() => {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 2000);
      });
  };

  // Tool Actions
  const handleUpscale = async (resolution: '2x' | '4x') => {
      const msg = messages.find(m => m.id === activeToolImage);
      if (!msg || !msg.image) return;
      
      // Find index to update
      const msgIndex = messages.findIndex(m => m.id === activeToolImage);
      
      // Optimistic update to show loading
      setMessages(prev => {
          const newArr = [...prev];
          newArr[msgIndex] = { ...newArr[msgIndex], isLoading: true };
          return newArr;
      });

      try {
          const promptText = resolution === '2x' 
            ? "CRITICAL INSTRUCTION: Execute a high-fidelity 2x upscale..." 
            : "CRITICAL INSTRUCTION: Execute a maximum-fidelity 4x upscale...";
          
          const newSrc = await upscaleImage(msg.image, resolution, promptText);
          
          // Add new message with upscaled result
          setMessages(prev => {
             const newArr = [...prev];
             newArr[msgIndex] = { ...newArr[msgIndex], isLoading: false }; // Stop loading on original
             newArr.push({
                 id: Date.now().toString(),
                 role: 'model',
                 text: `**Upscale Complete** (${resolution})`,
                 image: newSrc,
                 upscaledTo: resolution
             });
             return newArr;
          });
           setImageHistory(prev => [...prev, {
              id: Date.now().toString(),
              src: newSrc,
              prompt: `Upscale ${resolution}`,
              timestamp: Date.now()
          }]);

      } catch (e: any) {
          alert(e.message);
          setMessages(prev => {
              const newArr = [...prev];
              newArr[msgIndex] = { ...newArr[msgIndex], isLoading: false };
              return newArr;
          });
      }
  };

  const handleRefine = async () => {
       const msg = messages.find(m => m.id === activeToolImage);
      if (!msg || !msg.image || !toolPrompt.trim()) return;
      
      const msgIndex = messages.findIndex(m => m.id === activeToolImage);
      
      setMessages(prev => {
          const newArr = [...prev];
          newArr[msgIndex] = { ...newArr[msgIndex], isLoading: true };
          return newArr;
      });

      try {
          const masterPrompt = `You are an AI refinement expert. Refine this image: ${toolPrompt}`;
          const newSrc = await refineImage(msg.image, masterPrompt);
          
          setMessages(prev => {
             const newArr = [...prev];
             newArr[msgIndex] = { ...newArr[msgIndex], isLoading: false };
             newArr.push({
                 id: Date.now().toString(),
                 role: 'model',
                 text: `**Refinement Complete**\n${toolPrompt}`,
                 image: newSrc,
                 isRefined: true
             });
             return newArr;
          });
          setImageHistory(prev => [...prev, {
              id: Date.now().toString(),
              src: newSrc,
              prompt: `Refine: ${toolPrompt}`,
              timestamp: Date.now()
          }]);
          setToolPrompt('');

      } catch (e: any) {
          alert(e.message);
           setMessages(prev => {
              const newArr = [...prev];
              newArr[msgIndex] = { ...newArr[msgIndex], isLoading: false };
              return newArr;
          });
      }
  };

  const handleReframe = async () => {
      const msg = messages.find(m => m.id === activeToolImage);
      if (!msg || !msg.image) return;
       const msgIndex = messages.findIndex(m => m.id === activeToolImage);

       setMessages(prev => {
          const newArr = [...prev];
          newArr[msgIndex] = { ...newArr[msgIndex], isLoading: true };
          return newArr;
      });

      try {
           const masterPrompt = toolPrompt.trim() 
              ? `Expand canvas: ${toolPrompt}`
              : "Expand the image canvas naturally.";
          
          const mimeType = msg.image.substring(msg.image.indexOf(':') + 1, msg.image.indexOf(';'));
          const res = await reframeImage(msg.image, mimeType, masterPrompt);
          
          if (res.length > 0) {
              setMessages(prev => {
                 const newArr = [...prev];
                 newArr[msgIndex] = { ...newArr[msgIndex], isLoading: false };
                 newArr.push({
                     id: Date.now().toString(),
                     role: 'model',
                     text: `**Reframe Complete**`,
                     image: res[0],
                     isRefined: true
                 });
                 return newArr;
              });
              setImageHistory(prev => [...prev, {
                  id: Date.now().toString(),
                  src: res[0],
                  prompt: `Reframe: ${toolPrompt}`,
                  timestamp: Date.now()
              }]);
          }
           setToolPrompt('');
      } catch (e: any) {
          alert(e.message);
           setMessages(prev => {
              const newArr = [...prev];
              newArr[msgIndex] = { ...newArr[msgIndex], isLoading: false };
              return newArr;
          });
      }
  };

  const handleDownload = (src: string) => {
      const link = document.createElement('a');
      link.href = src;
      link.download = `vxog_gen_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };
  
  const getAnalysisMessage = (mode: VxogMode, count: number) => {
      switch (mode) {
          case 'Sora2': return `Analyzing ${count} frame${count > 1 ? 's' : ''} for temporal motion vectors...`;
          case 'Veo': return `Extracting cinematic keyframe data from ${count} image${count > 1 ? 's' : ''}...`;
          case 'Grok': return `Deconstructing ${count} visual input${count > 1 ? 's' : ''} for raw concept extraction...`;
          default: return `Visual Synthesis Engine ready to analyze ${count} image${count > 1 ? 's' : ''}.`;
      }
  };

  const activeMessageForTools = messages.find(m => m.id === activeToolImage);

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row pt-20 bg-black overflow-hidden pb-safe">
        
        {/* Sidebar / Settings Panel */}
        <div className={`
            fixed md:relative z-30 top-20 md:top-0 bottom-0 left-0 h-[calc(100dvh-5rem)] md:h-auto
            glass-panel border-r border-white/10 
            transition-all duration-300 ease-in-out flex flex-col
            ${isSettingsOpen ? 'translate-x-0 w-full md:w-80' : '-translate-x-full md:translate-x-0 md:w-0 md:border-none'}
        `}>
            <div className="flex items-center border-b border-white/10 bg-white/5 flex-shrink-0">
                <button 
                    onClick={() => setSidebarTab('settings')}
                    className={`flex-1 py-3 text-xs font-bold tracking-widest transition-colors ${sidebarTab === 'settings' ? 'text-cyan-400 bg-white/5 shadow-[inset_0_-2px_0_0_rgba(34,211,238,0.5)]' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    CORE
                </button>
                <button 
                    onClick={() => setSidebarTab('tools')}
                    className={`flex-1 py-3 text-xs font-bold tracking-widest transition-colors ${sidebarTab === 'tools' ? 'text-purple-400 bg-white/5 shadow-[inset_0_-2px_0_0_rgba(168,85,247,0.5)]' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    TOOLS
                </button>
                <button 
                    onClick={() => setSidebarTab('history')}
                    className={`flex-1 py-3 text-xs font-bold tracking-widest transition-colors ${sidebarTab === 'history' ? 'text-cyan-400 bg-white/5 shadow-[inset_0_-2px_0_0_rgba(34,211,238,0.5)]' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    MEMORY
                </button>
                {/* Minimize Button */}
                <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-3 text-gray-500 hover:text-white hover:bg-white/5 transition-colors border-l border-white/10"
                    title="Minimize System Core"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            <div className="p-6 h-full overflow-y-auto no-scrollbar w-full md:w-80 flex-shrink-0">
                {sidebarTab === 'settings' ? (
                    <>
                         <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white tracking-wider">SYSTEM CORE</h2>
                        </div>

                        {/* Identity Core */}
                        <div className="mb-6">
                            <label className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 block">Identity Core</label>
                            <div className="space-y-2">
                                {(Object.keys(SYSTEM_INSTRUCTIONS) as VxogMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setVxogMode(mode)}
                                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 flex items-center justify-between group ${
                                            vxogMode === mode 
                                            ? 'bg-cyan-500/10 border-cyan-400/50 text-white shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
                                            : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                    >
                                        <span className="font-medium">{mode}</span>
                                        {vxogMode === mode && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>}
                                    </button>
                                ))}
                            </div>
                            
                            {/* Identity Notification Panel */}
                            <div className={`mt-4 p-4 rounded-lg border ${IDENTITY_NOTIFICATIONS[vxogMode].border} ${IDENTITY_NOTIFICATIONS[vxogMode].bg} animate-fade-in`}>
                                <h4 className={`text-xs font-bold mb-2 tracking-widest ${IDENTITY_NOTIFICATIONS[vxogMode].color}`}>
                                    {IDENTITY_NOTIFICATIONS[vxogMode].title}
                                </h4>
                                <p className="text-[11px] text-gray-300 leading-relaxed">
                                    {IDENTITY_NOTIFICATIONS[vxogMode].desc}
                                </p>
                            </div>
                        </div>

                        {/* Visual Parameters */}
                        <div className="mb-8">
                            <label className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3 block">Visual Parameters</label>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-gray-500 mb-2 block">Aspect Ratio</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {ASPECT_RATIOS.map(ratio => (
                                            <button
                                                key={ratio}
                                                onClick={() => setAspectRatio(ratio)}
                                                className={`px-2 py-2 text-xs rounded-lg border transition-all ${
                                                    aspectRatio === ratio 
                                                    ? 'bg-purple-500/20 border-purple-500/50 text-white' 
                                                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                                }`}
                                            >
                                                {ratio}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                     <label className="text-xs text-gray-500 mb-2 block">Detail Intensity: {detailIntensity}</label>
                                     <input type="range" min="1" max="5" value={detailIntensity} onChange={e => setDetailIntensity(Number(e.target.value))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-400"/>
                                </div>
                            </div>
                        </div>

                        {/* System Temperature */}
                        <div className="mb-8">
                            <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block">Reasoning Temp</label>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <div className="flex justify-between text-xs text-gray-400 mb-2">
                                    <span>Precise</span>
                                    <span>{temperature}</span>
                                    <span>Creative</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1" 
                                    value={temperature} 
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                                />
                            </div>
                        </div>

                        {/* Model Info */}
                        <div className="mt-auto pt-6 border-t border-white/10">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
                                Reasoning: Gemini 3.0 Pro
                            </div>
                             <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]"></div>
                                Generation: Gemini 3.0 Pro Image
                            </div>
                        </div>
                    </>
                ) : sidebarTab === 'tools' ? (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white tracking-wider">IMAGE TOOLS</h2>
                        </div>
                        {activeMessageForTools ? (
                            <div className="space-y-6">
                                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                                    <img src={activeMessageForTools.image} alt="Active" className="w-full h-24 object-cover rounded mb-2 opacity-50" />
                                    <p className="text-[10px] text-gray-400 text-center">TARGET LOCKED</p>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 block">Enhance</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => handleUpscale('2x')} className="py-3 bg-cyan-900/20 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-xs text-cyan-300 transition-all">
                                            UPSCALE 2X
                                        </button>
                                        <button onClick={() => handleUpscale('4x')} className="py-3 bg-cyan-900/20 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-xs text-cyan-300 transition-all">
                                            UPSCALE 4X
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3 block">Refine & Reframe</label>
                                    <textarea 
                                        value={toolPrompt}
                                        onChange={e => setToolPrompt(e.target.value)}
                                        placeholder="Instructions for Refine/Reframe..."
                                        className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-xs text-white mb-2 focus:border-purple-500/50 outline-none resize-none"
                                        rows={3}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={handleRefine} disabled={!toolPrompt} className="py-3 bg-purple-900/20 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg text-xs text-purple-300 transition-all disabled:opacity-50">
                                            REFINE
                                        </button>
                                        <button onClick={handleReframe} className="py-3 bg-blue-900/20 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs text-blue-300 transition-all">
                                            REFRAME
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block">Filters (Visual Only)</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {IMAGE_FILTERS.filter(f => f !== 'None').map(filter => (
                                            <button key={filter} className="py-2 border border-white/10 rounded bg-white/5 text-[10px] text-gray-400 hover:text-white hover:bg-white/10">
                                                {filter.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[9px] text-gray-600 mt-2">*Filters apply to view only</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-8">Generate an image to use tools.</p>
                        )}
                    </>
                ) : (
                    <>
                        <div className="mb-4 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white tracking-wider">SESSION GALLERY</h2>
                            <span className="text-xs text-gray-500">{imageHistory.length} items</span>
                        </div>
                        <div className="space-y-4">
                            {imageHistory.length === 0 ? (
                                <p className="text-sm text-gray-500">No images generated in this session.</p>
                            ) : (
                                imageHistory.map((img) => (
                                    <div key={img.id} className="relative group rounded-lg overflow-hidden border border-white/10 bg-black/40">
                                        <img src={img.src} alt="History" className="w-full h-32 object-cover" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <a href={img.src} download={`vxog_${img.id}.png`} className="p-2 bg-white/20 hover:bg-white text-white hover:text-black rounded-full transition-all border border-white/20">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            </a>
                                            <button onClick={() => handleDeleteHistoryItem(img.id)} className="p-2 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-full transition-all border border-red-500/30">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                        <div className="p-2">
                                            <p className="text-xs text-gray-400 truncate">{img.prompt}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-grow flex flex-col h-full relative">
            {/* Settings Toggle (Visible when sidebar is closed) */}
            <div className={`absolute top-4 left-4 z-20 transition-all duration-300 ${isSettingsOpen ? 'opacity-0 pointer-events-none -translate-x-4' : 'opacity-100 translate-x-0'}`}>
                <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-3 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 text-cyan-400 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(0,243,255,0.3)] transition-all hover:scale-105"
                    title="Open System Core"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>

            {/* Messages Stream */}
            <div ref={chatContainerRef} className="flex-grow overflow-y-auto no-scrollbar p-4 md:p-8 space-y-6 pb-24">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'model' && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 p-[1px] shrink-0 mt-1 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                                <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[10px] font-bold text-white">VX</div>
                            </div>
                        )}
                        
                        <div className={`
                            max-w-[90%] md:max-w-[70%] p-4 rounded-2xl backdrop-blur-xl border
                            ${msg.role === 'user' 
                                ? 'bg-white/5 border-white/10 rounded-tr-sm' 
                                : 'glass-panel border-white/5 rounded-tl-sm shadow-xl'
                            }
                            animate-fade-in-up
                        `}>
                            {msg.uploadedImages && msg.uploadedImages.length > 0 && (
                                 <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                                     {msg.uploadedImages.map((img, i) => (
                                         <img key={i} src={img.base64} alt="Upload" className="h-24 rounded-lg border border-white/10 object-cover"/>
                                     ))}
                                 </div>
                            )}
                            
                            {msg.isLoading && !msg.text ? (
                                <div className="flex items-center gap-2 text-cyan-400">
                                    <Spinner /> 
                                    <span className="text-xs animate-pulse">
                                        {msg.isGeneratingImage ? 'Rendering Pixels (Gemini 3.0 Pro Image)...' : 'Reasoning (Gemini 3.0 Pro)...'}
                                    </span>
                                </div>
                            ) : (
                                <SimpleMarkdown text={msg.text} />
                            )}
                            
                            {msg.role === 'model' && !msg.isLoading && msg.text && (
                                <div className="mt-2 flex justify-start">
                                    <button 
                                        onClick={() => handleCopyText(msg.text, msg.id)}
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-cyan-400 transition-all"
                                        title="Copy text"
                                    >
                                        {copiedId === msg.id ? (
                                            <div className="flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                                <span className="text-[10px] text-green-400 font-mono">COPIED</span>
                                            </div>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            )}
                            
                            {msg.image && (
                                <div className="mt-4 relative group inline-block rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-black w-full">
                                    <img src={msg.image} alt="Generated" className="w-full h-auto block object-contain" />
                                    
                                    {/* Loading Overlay for 3D ops */}
                                    {msg.isLoading && (
                                         <div className="absolute inset-0 bg-black/70 flex items-center justify-center backdrop-blur-sm z-20">
                                             <Spinner />
                                         </div>
                                    )}
                                    
                                    {/* In-Image Interactive Menu */}
                                    <div className="absolute top-3 left-3 z-30">
                                        <div className="relative group/menu">
                                            <button className="p-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white hover:bg-white hover:text-black transition-all shadow-lg">
                                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
                                            </button>
                                            {/* Dropdown */}
                                            <div className="absolute top-full left-0 mt-2 w-40 bg-gray-900/90 backdrop-blur-xl border border-white/20 rounded-xl p-1 shadow-2xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all transform origin-top-left scale-95 group-hover/menu:scale-100 z-40">
                                                <button onClick={() => { setActiveToolImage(msg.id); handleUpscale('2x'); }} className="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors">Upscale 2x</button>
                                                <button onClick={() => { setActiveToolImage(msg.id); handleUpscale('4x'); }} className="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors">Upscale 4x</button>
                                                <button onClick={() => { setActiveToolImage(msg.id); setSidebarTab('tools'); setToolPrompt('Enhance lighting'); }} className="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors">Quick Refine</button>
                                                <button onClick={() => { setActiveToolImage(msg.id); setSidebarTab('tools'); }} className="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors border-t border-white/10 mt-1 pt-2">Open Tools...</button>
                                                <button onClick={() => handleDownload(msg.image!)} className="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors border-t border-white/10 mt-1 pt-2">Download</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3D Toggle Button */}
                                    <button 
                                        onClick={() => toggle3DView(msg.id)}
                                        className={`
                                            absolute top-3 right-3 p-2 rounded-full backdrop-blur-md border transition-all z-10
                                            ${msg.is3DActive 
                                                ? 'bg-cyan-500/80 border-cyan-300 text-white shadow-[0_0_15px_cyan]' 
                                                : 'bg-black/50 border-white/20 text-white/70 hover:bg-black/70 hover:text-white'
                                            }
                                        `}
                                        title="Toggle 3D Exploration Mode"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                                        </svg>
                                    </button>

                                    {/* 3D Navigation Overlay */}
                                    {msg.is3DActive && (
                                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center animate-fade-in">
                                            <div className="relative w-48 h-48">
                                                {/* Up */}
                                                <button 
                                                    onClick={() => handleViewpointShift(msg.id, msg.image!, "up")}
                                                    className="absolute top-0 left-1/2 -translate-x-1/2 p-3 bg-black/60 hover:bg-cyan-500/80 rounded-full border border-white/20 hover:border-cyan-300 transition-all text-white shadow-lg"
                                                    title="Tilt Up"
                                                >
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                                </button>
                                                
                                                {/* Down */}
                                                <button 
                                                    onClick={() => handleViewpointShift(msg.id, msg.image!, "down")}
                                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 p-3 bg-black/60 hover:bg-cyan-500/80 rounded-full border border-white/20 hover:border-cyan-300 transition-all text-white shadow-lg"
                                                    title="Tilt Down"
                                                >
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                </button>
                                                
                                                {/* Left */}
                                                <button 
                                                    onClick={() => handleViewpointShift(msg.id, msg.image!, "left")}
                                                    className="absolute left-0 top-1/2 -translate-y-1/2 p-3 bg-black/60 hover:bg-cyan-500/80 rounded-full border border-white/20 hover:border-cyan-300 transition-all text-white shadow-lg"
                                                    title="Pan Left"
                                                >
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                                </button>
                                                
                                                {/* Right */}
                                                <button 
                                                    onClick={() => handleViewpointShift(msg.id, msg.image!, "right")}
                                                    className="absolute right-0 top-1/2 -translate-y-1/2 p-3 bg-black/60 hover:bg-cyan-500/80 rounded-full border border-white/20 hover:border-cyan-300 transition-all text-white shadow-lg"
                                                    title="Pan Right"
                                                >
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                </button>
                                                
                                                {/* Center / Compass UI */}
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-white/10 bg-white/5 flex items-center justify-center pointer-events-none">
                                                    <div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_15px_cyan]"></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 md:p-6 glass-panel border-t border-white/10 relative z-20 !overflow-visible">
                <div className="max-w-4xl mx-auto relative flex items-end gap-3">
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2H6a2 2 0 00-2-2 2z" /></svg>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} multiple accept="image/*" />
                    
                    <div className="flex-grow relative">
                        {uploadedImages.length > 0 && (
                            <div className="absolute bottom-full left-0 mb-2 px-2 w-full z-50">
                                <div className="flex gap-2 mb-2">
                                    {uploadedImages.map((img, i) => (
                                        <div key={i} className="relative group">
                                            <img src={img.base64} className="h-16 rounded-lg border border-white/20" alt="Preview" />
                                            <button 
                                                onClick={() => setUploadedImages(prev => prev.filter((_, idx) => idx !== i))}
                                                className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                
                                {/* Analysis Pop-up Box */}
                                <div className="bg-gray-900/90 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl animate-fade-in-up flex items-center gap-3 max-w-md">
                                     <div className={`p-2 rounded-full bg-black/50 ${
                                         vxogMode === 'Sora2' ? 'text-purple-400 border-purple-500/50' :
                                         vxogMode === 'Veo' ? 'text-emerald-400 border-emerald-500/50' :
                                         vxogMode === 'Grok' ? 'text-rose-400 border-rose-500/50' : 'text-cyan-400 border-cyan-500/50'
                                     } border`}>
                                         <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                         </svg>
                                     </div>
                                     <div>
                                         <p className={`text-xs font-bold uppercase tracking-wider ${
                                             vxogMode === 'Sora2' ? 'text-purple-400' :
                                             vxogMode === 'Veo' ? 'text-emerald-400' :
                                             vxogMode === 'Grok' ? 'text-rose-400' : 'text-cyan-400'
                                         }`}>
                                             {vxogMode} Vision Core Active
                                         </p>
                                         <p className="text-[10px] text-gray-400">
                                             {getAnalysisMessage(vxogMode, uploadedImages.length)}
                                         </p>
                                     </div>
                                 </div>
                            </div>
                        )}
                        <textarea 
                            value={userInput}
                            onChange={e => setUserInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                            placeholder={`Message ${vxogMode}...`}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent resize-none min-h-[50px] max-h-32"
                            rows={1}
                        />
                    </div>
                    
                    <button 
                        onClick={() => handleSendMessage()}
                        disabled={!userInput.trim() && uploadedImages.length === 0 || isLoading}
                        className="p-3 bg-white text-black rounded-xl hover:bg-cyan-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_rgba(255,255,255,0.5)]"
                    >
                        {isLoading ? <Spinner /> : <svg className="w-6 h-6 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" /></svg>}
                    </button>
                </div>
                <p className="text-center text-[10px] text-gray-600 mt-2 font-mono tracking-wider">GEMINI 3.0 PRO PREVIEW // LATENCY: ~120ms</p>
            </div>
        </div>
    </div>
  );
}

export default VXOGPage;
