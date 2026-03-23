"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Rocket, Plus, Download, ChevronRight, Loader2, Trash2, Link as LinkIcon, Home } from 'lucide-react';
import { downloadCSV } from '@/lib/csv';

export default function SheetCreator() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [items, setItems] = useState<{ id: string; url: string; quantity: string }[]>([]);
  const [url, setUrl] = useState('');
  const [quantity, setQuantity] = useState('1');
  
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;
    
    setItems(prev => [...prev, { id: Math.random().toString(36).substring(7), url: url.trim(), quantity }]);
    setUrl('');
    setQuantity('1');
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleGenerate = async () => {
    if (items.length === 0 && url.trim()) {
      // Auto add if they forgot to click add
      setItems(prev => [...prev, { id: Math.random().toString(36).substring(7), url: url.trim(), quantity }]);
    }
    
    // We need to wait for state update if we just added it, but let's just use a local ref or combined array:
    const finalItems = items.length === 0 && url.trim() 
      ? [{ id: 'temp', url: url.trim(), quantity }]
      : items;

    if (finalItems.length === 0) return;

    setStep(3);
    setIsLoading(true);

    try {
      const resp = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: finalItems })
      });
      const data = await resp.json();
      if (data.results) {
        setResults(data.results);
      } else {
        alert('Failed to process URLs: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during generation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    downloadCSV(results, 'whatnot-sheet.csv');
  };

  const handleGoHome = () => {
    setStep(1);
    setItems([]);
    setResults([]);
    setUrl('');
    setQuantity('1');
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="w-full max-w-5xl mx-auto min-h-[600px] flex flex-col justify-center">
      <AnimatePresence mode="wait">
        
        {step === 1 && (
          <motion.div 
            key="step1"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="flex flex-col items-center text-center space-y-8"
          >
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white drop-shadow-md">
                BSW <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Whatnot</span>
              </h1>
              <p className="text-xl text-slate-300 max-w-2xl mx-auto font-light">
                Automate your product data collection. Paste your URLs, add quantities, and export beautifully formatted sheets in seconds.
              </p>
            </div>
            <Button 
              size="lg" 
              onClick={() => setStep(2)}
              className="group text-lg px-8 py-6 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-all hover:scale-105"
            >
              Start creating sheet
              <Rocket className="ml-2 h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </Button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            key="step2"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="w-full max-w-2xl mx-auto"
          >
            <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl">
              <CardHeader className="bg-slate-800/50 border-b border-slate-700/50 pb-6">
                <CardTitle className="text-2xl text-white">Add Products</CardTitle>
                <CardDescription className="text-slate-400">Enter product URLs and their exact quantities.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <form onSubmit={handleAddItem} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="url" className="text-slate-300">Product URL</Label>
                      <div className="relative">
                        <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input 
                          id="url"
                          type="text"
                          placeholder="https://example.com/product"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          className="pl-9 bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-600"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qty" className="text-slate-300">Quantity</Label>
                      <Input 
                        id="qty"
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-600"
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="secondary" className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                    <Plus className="mr-2 h-4 w-4" /> Add Item
                  </Button>
                </form>

                {items.length > 0 && (
                  <div className="mt-8 space-y-3">
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Added Items ({items.length})</h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      <AnimatePresence>
                        {items.map((item) => (
                          <motion.div 
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-slate-800/80 border border-slate-700 rounded-lg p-3 flex items-center justify-between group"
                          >
                            <div className="flex flex-col overflow-hidden mr-4">
                              <span className="text-sm text-slate-200 truncate">{item.url}</span>
                              <span className="text-xs text-blue-400 font-medium">Qty: {item.quantity}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-slate-500 hover:text-red-400 hover:bg-slate-700/50 flex-shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
                  <Button 
                    variant="outline"
                    onClick={() => document.getElementById('url')?.focus()}
                    className="flex-1 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    Add more URL & Qty
                  </Button>
                  <Button 
                    onClick={handleGenerate}
                    disabled={items.length === 0 && !url}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                  >
                    Finish & Go To Table <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="step3"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="w-full"
          >
            <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-800/50 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6">
                <div>
                  <CardTitle className="text-2xl text-white">Generated Sheet</CardTitle>
                  <CardDescription className="text-slate-400">Review your scraped product data before downloading.</CardDescription>
                </div>
                <div className="flex gap-3 text-sm">
                  <Button variant="ghost" onClick={handleGoHome} className="text-slate-400 hover:text-white hover:bg-slate-800">
                    <Home className="mr-2 h-4 w-4" /> Home
                  </Button>
                  <Button variant="outline" onClick={() => setStep(2)} className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800">
                    Back
                  </Button>
                  <Button 
                    onClick={handleDownload}
                    disabled={isLoading || results.length === 0}
                    className="bg-green-600 hover:bg-green-500 text-white"
                  >
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center p-24 space-y-4">
                    <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                    <p className="text-slate-400 font-medium animate-pulse">Scraping URLs and compiling data...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-950/50">
                        <TableRow className="border-slate-800 hover:bg-transparent">
                          <TableHead className="text-slate-300">Title</TableHead>
                          <TableHead className="text-slate-300">Description</TableHead>
                          <TableHead className="text-slate-300">Image 1</TableHead>
                          <TableHead className="text-slate-300">Image 2 (Opt)</TableHead>
                          <TableHead className="text-slate-300">Image 3 (Opt)</TableHead>
                          <TableHead className="text-slate-300">Price</TableHead>
                          <TableHead className="text-slate-300 text-right">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i} className="border-slate-800 hover:bg-slate-800/40 transition-colors">
                            <TableCell className="font-medium text-slate-200 max-w-[200px] truncate" title={r.title}>{r.title}</TableCell>
                            <TableCell className="text-slate-400 max-w-[250px] truncate" title={r.description}>{r.description}</TableCell>
                            <TableCell className="max-w-[150px] truncate text-slate-500" title={r.image1}>{r.image1}</TableCell>
                            <TableCell className="max-w-[150px] truncate text-slate-500" title={r.image2}>{r.image2}</TableCell>
                            <TableCell className="max-w-[150px] truncate text-slate-500" title={r.image3}>{r.image3}</TableCell>
                            <TableCell className="text-green-400 font-medium">{r.price}</TableCell>
                            <TableCell className="text-right text-slate-200">{r.quantity}</TableCell>
                          </TableRow>
                        ))}
                        {results.length === 0 && !isLoading && (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                              No results found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
