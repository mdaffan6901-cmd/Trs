/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  Sparkles, 
  Download, 
  Image as ImageIcon, 
  RefreshCw, 
  Type as TypeIcon,
  X,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TRENDING_TEMPLATES } from './constants';
import { AICaption } from './types';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [selectedImage, setSelectedImage] = useState<string>(TRENDING_TEMPLATES[0].url);
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AICaption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draw meme on canvas whenever inputs change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = selectedImage;
    img.onload = () => {
      // Set canvas size to match image aspect ratio but keep it manageable
      const maxWidth = 800;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      // Draw background image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Text styling
      const fontSize = canvas.width / 10;
      ctx.font = `bold ${fontSize}px Impact, sans-serif`;
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = fontSize / 15;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Draw Top Text
      if (topText) {
        ctx.fillText(topText.toUpperCase(), canvas.width / 2, 20);
        ctx.strokeText(topText.toUpperCase(), canvas.width / 2, 20);
      }

      // Draw Bottom Text
      ctx.textBaseline = 'bottom';
      if (bottomText) {
        ctx.fillText(bottomText.toUpperCase(), canvas.width / 2, canvas.height - 20);
        ctx.strokeText(bottomText.toUpperCase(), canvas.width / 2, canvas.height - 20);
      }
    };
  }, [selectedImage, topText, bottomText]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setSuggestions([]); // Clear suggestions for new image
      };
      reader.readAsDataURL(file);
    }
  };

  const generateMagicCaptions = async () => {
    if (!selectedImage) return;
    setIsGenerating(true);
    setError(null);

    try {
      // Convert image to base64 for Gemini
      let base64Data = '';
      if (selectedImage.startsWith('data:')) {
        base64Data = selectedImage.split(',')[1];
      } else {
        // For templates, we need to fetch and convert to base64
        const response = await fetch(selectedImage);
        const blob = await response.blob();
        base64Data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              { text: "Analyze this image and suggest 5 funny, relevant meme captions. Each caption should have a 'top' and 'bottom' part. Keep them short, punchy, and culturally relevant. Return the result as a JSON array of objects with 'top' and 'bottom' keys." },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                top: { type: Type.STRING },
                bottom: { type: Type.STRING }
              },
              required: ["top", "bottom"]
            }
          }
        }
      });

      const result = JSON.parse(response.text || '[]');
      setSuggestions(result);
    } catch (err) {
      console.error("Error generating captions:", err);
      setError("Failed to generate magic captions. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const applySuggestion = (suggestion: AICaption) => {
    setTopText(suggestion.top);
    setBottomText(suggestion.bottom);
  };

  const downloadMeme = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'my-awesome-meme.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-zinc-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
              <Sparkles size={18} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">MemeMagic <span className="text-emerald-500">AI</span></h1>
          </div>
          <button 
            onClick={downloadMeme}
            className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-zinc-800 transition-colors shadow-sm"
          >
            <Download size={16} />
            Download Meme
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Editor */}
          <div className="lg:col-span-7 space-y-6">
            {/* Canvas Preview */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="aspect-square w-full bg-zinc-100 rounded-xl flex items-center justify-center relative group">
                <canvas 
                  ref={canvasRef} 
                  className="max-w-full max-h-full rounded-lg shadow-lg"
                />
                {!selectedImage && (
                  <div className="text-zinc-400 flex flex-col items-center gap-2">
                    <ImageIcon size={48} strokeWidth={1} />
                    <p>Select a template or upload an image</p>
                  </div>
                )}
              </div>
            </div>

            {/* Template Picker */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Trending Templates</h2>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <Upload size={14} />
                  Upload Custom
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  className="hidden" 
                  accept="image/*"
                />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {TRENDING_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => {
                      setSelectedImage(template.url);
                      setSuggestions([]);
                    }}
                    className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      selectedImage === template.url ? 'border-emerald-500 scale-95 shadow-inner' : 'border-transparent hover:border-zinc-300'
                    }`}
                  >
                    <img 
                      src={template.url} 
                      alt={template.name} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Controls */}
          <div className="lg:col-span-5 space-y-6">
            {/* Text Controls */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <TypeIcon size={16} />
                Captions
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1 block">Top Text</label>
                  <input
                    type="text"
                    value={topText}
                    onChange={(e) => setTopText(e.target.value)}
                    placeholder="ENTER TOP TEXT"
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1 block">Bottom Text</label>
                  <input
                    type="text"
                    value={bottomText}
                    onChange={(e) => setBottomText(e.target.value)}
                    placeholder="ENTER BOTTOM TEXT"
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all uppercase font-bold"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={generateMagicCaptions}
                  disabled={isGenerating || !selectedImage}
                  className="w-full py-4 bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Analyzing Image...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Magic Caption
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AI Suggestions */}
            <AnimatePresence mode="wait">
              {(suggestions.length > 0 || isGenerating) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">AI Suggestions</h2>
                    {suggestions.length > 0 && (
                      <button 
                        onClick={() => setSuggestions([])}
                        className="text-zinc-400 hover:text-zinc-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {isGenerating ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-20 bg-zinc-200 animate-pulse rounded-xl" />
                      ))
                    ) : (
                      suggestions.map((suggestion, idx) => (
                        <motion.button
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          onClick={() => applySuggestion(suggestion)}
                          className="w-full p-4 bg-white border border-zinc-200 rounded-xl text-left hover:border-emerald-500 hover:shadow-md transition-all group relative"
                        >
                          <div className="pr-8">
                            <p className="text-xs font-bold text-zinc-400 uppercase mb-1">{suggestion.top || '...'}</p>
                            <p className="text-sm font-bold text-zinc-900 uppercase">{suggestion.bottom || '...'}</p>
                          </div>
                          <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300 group-hover:text-emerald-500 transition-colors" size={18} />
                        </motion.button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-zinc-200 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-400 text-sm">
          <p>© 2026 MemeMagic AI. Powered by Gemini 3.1 Pro.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-zinc-600">Privacy</a>
            <a href="#" className="hover:text-zinc-600">Terms</a>
            <a href="#" className="hover:text-zinc-600">API</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
