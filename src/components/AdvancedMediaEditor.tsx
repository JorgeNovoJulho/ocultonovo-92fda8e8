import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Crop, 
  Type, 
  Pencil, 
  Eraser, 
  Smile, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut,
  Check,
  X,
  Move,
  Stamp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
}

interface DrawPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface Sticker {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
}

interface AdvancedMediaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageFile: File | null;
  onSave: (editedBlob: Blob) => void;
}

type Tool = 'crop' | 'text' | 'draw' | 'eraser' | 'sticker' | 'move' | null;

const EMOJI_OPTIONS = ['😀', '😍', '🔥', '💋', '❤️', '👀', '💦', '🍑', '🍆', '💯', '✨', '🌟', '💖', '😈', '🥵', '💪'];
const COLOR_OPTIONS = ['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

export function AdvancedMediaEditor({ open, onOpenChange, imageFile, onSave }: AdvancedMediaEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [zoom, setZoom] = useState(100);
  const [applyWatermark, setApplyWatermark] = useState(true);
  
  // Tool-specific state
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [brushWidth, setBrushWidth] = useState(5);
  const [fontSize, setFontSize] = useState(24);
  const [newText, setNewText] = useState('');
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  
  // Drag state
  const [dragging, setDragging] = useState<{ type: 'text' | 'sticker'; id: string } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Image state
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);

  // Load image
  useEffect(() => {
    if (imageFile && open) {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
        drawCanvas(img);
      };
      img.src = URL.createObjectURL(imageFile);
      
      return () => URL.revokeObjectURL(img.src);
    }
  }, [imageFile, open]);

  // Redraw canvas when elements change
  useEffect(() => {
    if (originalImage) {
      drawCanvas(originalImage);
    }
  }, [textElements, drawPaths, stickers, zoom, applyWatermark, originalImage]);

  const drawCanvas = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = zoom / 100;
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw paths
    drawPaths.forEach(path => {
      if (path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(path.points[0].x * scale, path.points[0].y * scale);
      path.points.forEach(point => {
        ctx.lineTo(point.x * scale, point.y * scale);
      });
      ctx.stroke();
    });

    // Draw text elements
    textElements.forEach(te => {
      ctx.font = `bold ${te.fontSize * scale}px Arial`;
      ctx.fillStyle = te.color;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2 * scale;
      ctx.strokeText(te.text, te.x * scale, te.y * scale);
      ctx.fillText(te.text, te.x * scale, te.y * scale);
    });

    // Draw stickers
    stickers.forEach(sticker => {
      ctx.font = `${sticker.size * scale}px Arial`;
      ctx.fillText(sticker.emoji, sticker.x * scale, sticker.y * scale);
    });

    // Draw watermark
    if (applyWatermark) {
      ctx.font = `${14 * scale}px Arial`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('@OcultoSwing', 10 * scale, canvas.height - 10 * scale);
    }
  }, [zoom, textElements, drawPaths, stickers, applyWatermark]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX / (zoom / 100);
    const y = (e.clientY - rect.top) * scaleY / (zoom / 100);

    if (tool === 'draw') {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
    } else if (tool === 'eraser') {
      // Remove elements near click
      const threshold = 20;
      setDrawPaths(paths => paths.filter(path => 
        !path.points.some(p => Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold)
      ));
      setTextElements(texts => texts.filter(t => 
        Math.abs(t.x - x) > threshold || Math.abs(t.y - y) > threshold
      ));
      setStickers(stks => stks.filter(s => 
        Math.abs(s.x - x) > threshold || Math.abs(s.y - y) > threshold
      ));
    } else if (tool === 'move') {
      // Check if clicking on a text element
      const clickedText = textElements.find(t => 
        Math.abs(t.x - x) < 50 && Math.abs(t.y - y) < 30
      );
      if (clickedText) {
        setDragging({ type: 'text', id: clickedText.id });
        setDragOffset({ x: x - clickedText.x, y: y - clickedText.y });
        return;
      }
      
      // Check if clicking on a sticker
      const clickedSticker = stickers.find(s => 
        Math.abs(s.x - x) < s.size / 2 && Math.abs(s.y - y) < s.size / 2
      );
      if (clickedSticker) {
        setDragging({ type: 'sticker', id: clickedSticker.id });
        setDragOffset({ x: x - clickedSticker.x, y: y - clickedSticker.y });
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX / (zoom / 100);
    const y = (e.clientY - rect.top) * scaleY / (zoom / 100);

    if (isDrawing && tool === 'draw') {
      setCurrentPath(prev => [...prev, { x, y }]);
    } else if (dragging) {
      if (dragging.type === 'text') {
        setTextElements(texts => texts.map(t => 
          t.id === dragging.id ? { ...t, x: x - dragOffset.x, y: y - dragOffset.y } : t
        ));
      } else if (dragging.type === 'sticker') {
        setStickers(stks => stks.map(s => 
          s.id === dragging.id ? { ...s, x: x - dragOffset.x, y: y - dragOffset.y } : s
        ));
      }
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDrawing && currentPath.length > 0) {
      setDrawPaths(prev => [...prev, {
        id: Date.now().toString(),
        points: currentPath,
        color: currentColor,
        width: brushWidth,
      }]);
      setCurrentPath([]);
    }
    setIsDrawing(false);
    setDragging(null);
  };

  const addText = () => {
    if (!newText.trim()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setTextElements(prev => [...prev, {
      id: Date.now().toString(),
      text: newText,
      x: canvas.width / (2 * (zoom / 100)),
      y: canvas.height / (2 * (zoom / 100)),
      color: currentColor,
      fontSize,
    }]);
    setNewText('');
  };

  const addSticker = (emoji: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setStickers(prev => [...prev, {
      id: Date.now().toString(),
      emoji,
      x: canvas.width / (2 * (zoom / 100)),
      y: canvas.height / (2 * (zoom / 100)),
      size: 48,
    }]);
  };

  const resetEdits = () => {
    setTextElements([]);
    setDrawPaths([]);
    setStickers([]);
    setZoom(100);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (blob) {
        onSave(blob);
        onOpenChange(false);
        resetEdits();
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editor de Mídia</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4">
          {/* Canvas Area */}
          <div className="flex-1 overflow-auto bg-black/50 rounded-lg flex items-center justify-center p-4">
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[500px] cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
          </div>

          {/* Tools Panel */}
          <div className="w-64 space-y-4">
            <Tabs defaultValue="tools" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="tools">Ferramentas</TabsTrigger>
                <TabsTrigger value="text">Texto</TabsTrigger>
                <TabsTrigger value="stickers">Stickers</TabsTrigger>
              </TabsList>

              <TabsContent value="tools" className="space-y-4">
                {/* Tool Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={tool === 'draw' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTool(tool === 'draw' ? null : 'draw')}
                    className="flex flex-col gap-1 h-auto py-2"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="text-xs">Desenhar</span>
                  </Button>
                  <Button
                    variant={tool === 'eraser' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTool(tool === 'eraser' ? null : 'eraser')}
                    className="flex flex-col gap-1 h-auto py-2"
                  >
                    <Eraser className="h-4 w-4" />
                    <span className="text-xs">Apagar</span>
                  </Button>
                  <Button
                    variant={tool === 'move' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTool(tool === 'move' ? null : 'move')}
                    className="flex flex-col gap-1 h-auto py-2"
                  >
                    <Move className="h-4 w-4" />
                    <span className="text-xs">Mover</span>
                  </Button>
                </div>

                {/* Color Picker */}
                <div className="space-y-2">
                  <Label className="text-xs">Cor</Label>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_OPTIONS.map(color => (
                      <button
                        key={color}
                        className={cn(
                          "w-6 h-6 rounded-full border-2",
                          currentColor === color ? "border-primary" : "border-transparent"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentColor(color)}
                      />
                    ))}
                  </div>
                </div>

                {/* Brush Width */}
                {tool === 'draw' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Espessura: {brushWidth}px</Label>
                    <Slider
                      value={[brushWidth]}
                      onValueChange={([v]) => setBrushWidth(v)}
                      min={1}
                      max={20}
                      step={1}
                    />
                  </div>
                )}

                {/* Zoom */}
                <div className="space-y-2">
                  <Label className="text-xs">Zoom: {zoom}%</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setZoom(Math.max(50, zoom - 10))}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Slider
                      value={[zoom]}
                      onValueChange={([v]) => setZoom(v)}
                      min={50}
                      max={200}
                      step={10}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setZoom(Math.min(200, zoom + 10))}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Watermark Toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Marca d'água</Label>
                  <Button
                    variant={applyWatermark ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setApplyWatermark(!applyWatermark)}
                  >
                    <Stamp className="h-4 w-4 mr-1" />
                    {applyWatermark ? 'Ativo' : 'Inativo'}
                  </Button>
                </div>

                {/* Reset */}
                <Button variant="outline" size="sm" onClick={resetEdits} className="w-full">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Resetar Edições
                </Button>
              </TabsContent>

              <TabsContent value="text" className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Adicionar Texto</Label>
                  <Input
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Digite seu texto..."
                    onKeyDown={(e) => e.key === 'Enter' && addText()}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Tamanho: {fontSize}px</Label>
                  <Slider
                    value={[fontSize]}
                    onValueChange={([v]) => setFontSize(v)}
                    min={12}
                    max={72}
                    step={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Cor</Label>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_OPTIONS.map(color => (
                      <button
                        key={color}
                        className={cn(
                          "w-6 h-6 rounded-full border-2",
                          currentColor === color ? "border-primary" : "border-transparent"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentColor(color)}
                      />
                    ))}
                  </div>
                </div>

                <Button onClick={addText} disabled={!newText.trim()} className="w-full">
                  <Type className="h-4 w-4 mr-2" />
                  Adicionar Texto
                </Button>

                <p className="text-xs text-muted-foreground">
                  Use a ferramenta "Mover" para reposicionar os textos.
                </p>
              </TabsContent>

              <TabsContent value="stickers" className="space-y-4">
                <Label className="text-xs">Clique para adicionar</Label>
                <div className="grid grid-cols-4 gap-2">
                  {EMOJI_OPTIONS.map(emoji => (
                    <Button
                      key={emoji}
                      variant="outline"
                      size="lg"
                      className="text-2xl h-12"
                      onClick={() => addSticker(emoji)}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  Use a ferramenta "Mover" para reposicionar os stickers.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            <Check className="h-4 w-4 mr-2" />
            Salvar Edições
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
