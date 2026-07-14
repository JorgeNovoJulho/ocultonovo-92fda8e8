import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  GripVertical,
  Plus,
  ExternalLink,
  Loader2,
  Save,
  X,
  Sparkles,
  LayoutGrid,
  Type,
  Image as ImageIcon,
  Users,
  Crown,
  Ghost,
  Gift,
  Heart,
  Zap,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useSiteSections,
  useUpdateSection,
  useToggleSectionVisibility,
  useReorderSections,
  useCreateSection,
  useDeleteSection,
  SiteSection,
} from '@/hooks/useSiteEditor';
import { cn } from '@/lib/utils';
import { PreviewRenderer } from '@/components/landing/PreviewRenderer';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

// Icons map for section types
const sectionIcons: Record<string, React.ReactNode> = {
  hero: <Zap className="h-4 w-4" />,
  features: <LayoutGrid className="h-4 w-4" />,
  plans: <Crown className="h-4 w-4" />,
  banner: <Gift className="h-4 w-4" />,
  content: <Type className="h-4 w-4" />,
  cta: <Sparkles className="h-4 w-4" />,
  footer: <Type className="h-4 w-4" />,
  early_bird: <Gift className="h-4 w-4" />,
};

// Sortable Section Item
function SortableSectionItem({
  section,
  onEdit,
  onToggleVisibility,
  onDelete,
}: {
  section: SiteSection;
  onEdit: (section: SiteSection) => void;
  onToggleVisibility: (id: string, isVisible: boolean) => void;
  onDelete: (section: SiteSection) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-card border border-border/50 transition-all",
        isDragging && "opacity-50 shadow-lg shadow-[#FF007F]/10 border-[#FF007F]/30",
        !section.is_visible && "opacity-60"
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1.5 rounded-lg hover:bg-muted cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Order Badge */}
      <div className="w-7 h-7 rounded-lg bg-[#FF007F]/10 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-[#FF007F]">
          {section.display_order}
        </span>
      </div>

      {/* Section Icon */}
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        {sectionIcons[section.section_type] || <Type className="h-4 w-4" />}
      </div>

      {/* Section Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm sm:text-base truncate">
          {section.section_name}
        </h4>
        <p className="text-xs text-muted-foreground truncate">
          {section.section_type} • {section.section_key}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Switch
          checked={section.is_visible}
          onCheckedChange={(checked) => onToggleVisibility(section.id, checked)}
          className="data-[state=checked]:bg-[#FF007F]"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(section)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(section)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Section Editor Modal with Preview
function SectionEditorModal({
  section,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: {
  section: SiteSection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, content: Record<string, any>, name: string) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(section?.section_name || '');
  const [content, setContent] = useState<Record<string, any>>(section?.content || {});
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Update state when section changes
  useMemo(() => {
    if (section) {
      setName(section.section_name);
      setContent(section.content);
      setActiveTab('edit');
    }
  }, [section]);

  const handleSave = () => {
    if (section) {
      onSave(section.id, content, name);
    }
  };

  const updateField = (key: string, value: any) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const updateArrayItem = (arrayKey: string, index: number, field: string, value: any) => {
    setContent((prev) => {
      const newArray = [...(prev[arrayKey] || [])];
      newArray[index] = { ...newArray[index], [field]: value };
      return { ...prev, [arrayKey]: newArray };
    });
  };

  const addArrayItem = (arrayKey: string, template: Record<string, any>) => {
    setContent((prev) => ({
      ...prev,
      [arrayKey]: [...(prev[arrayKey] || []), template],
    }));
  };

  const removeArrayItem = (arrayKey: string, index: number) => {
    setContent((prev) => ({
      ...prev,
      [arrayKey]: (prev[arrayKey] || []).filter((_: any, i: number) => i !== index),
    }));
  };

  if (!section) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-[#FF007F]" />
            Editar: {section.section_name}
          </DialogTitle>
          <DialogDescription>
            Edite o conteúdo desta seção. As alterações serão refletidas na landing page em tempo real.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Section Name */}
          <div className="space-y-2">
            <Label>Nome da Seção</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da seção"
            />
          </div>

          {/* Dynamic Content Fields based on section type */}
          {section.section_type === 'hero' && (
            <>
              <div className="space-y-2">
                <Label>Badge</Label>
                <Input
                  value={content.badge || ''}
                  onChange={(e) => updateField('badge', e.target.value)}
                  placeholder="Ex: Conteúdo + Conexões Reais"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Título Linha 1</Label>
                  <Input
                    value={content.title_line1 || ''}
                    onChange={(e) => updateField('title_line1', e.target.value)}
                    placeholder="OCULTO."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Título Linha 2</Label>
                  <Input
                    value={content.title_line2 || ''}
                    onChange={(e) => updateField('title_line2', e.target.value)}
                    placeholder="Onde o desejo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Título Linha 3</Label>
                  <Input
                    value={content.title_line3 || ''}
                    onChange={(e) => updateField('title_line3', e.target.value)}
                    placeholder="encontra a conexão."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subtítulo</Label>
                <Textarea
                  value={content.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  placeholder="Descrição do hero"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Botão Primário</Label>
                  <Input
                    value={content.cta_primary || ''}
                    onChange={(e) => updateField('cta_primary', e.target.value)}
                    placeholder="Explorar o Radar"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link Primário</Label>
                  <Input
                    value={content.cta_primary_link || ''}
                    onChange={(e) => updateField('cta_primary_link', e.target.value)}
                    placeholder="/radar"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Botão Secundário</Label>
                  <Input
                    value={content.cta_secondary || ''}
                    onChange={(e) => updateField('cta_secondary', e.target.value)}
                    placeholder="Espiar"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link Secundário</Label>
                  <Input
                    value={content.cta_secondary_link || ''}
                    onChange={(e) => updateField('cta_secondary_link', e.target.value)}
                    placeholder="/spy"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Trust: Online</Label>
                  <Input
                    value={content.trust_online || ''}
                    onChange={(e) => updateField('trust_online', e.target.value)}
                    placeholder="1.2K+ online agora"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trust: Anônimo</Label>
                  <Input
                    value={content.trust_anonymous || ''}
                    onChange={(e) => updateField('trust_anonymous', e.target.value)}
                    placeholder="100% anônimo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trust: Idade</Label>
                  <Input
                    value={content.trust_age || ''}
                    onChange={(e) => updateField('trust_age', e.target.value)}
                    placeholder="+18 anos"
                  />
                </div>
              </div>
              
              {/* Hero Image Upload */}
              <ImageUploadField
                value={content.background_image || ''}
                onChange={(url) => updateField('background_image', url)}
                label="Imagem de Fundo (opcional)"
                sectionId={section.id}
                imageKey="hero-background"
              />
            </>
          )}

          {section.section_type === 'features' && (
            <>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={content.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Subtítulo</Label>
                <Textarea
                  value={content.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Itens</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addArrayItem('items', { icon: 'Sparkles', title: '', description: '' })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {(content.items || []).map((item: any, index: number) => (
                  <div key={index} className="p-4 rounded-lg border border-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Item {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeArrayItem('items', index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Ícone</Label>
                        <Select
                          value={item.icon}
                          onValueChange={(v) => updateArrayItem('items', index, 'icon', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Users">Users</SelectItem>
                            <SelectItem value="DollarSign">DollarSign</SelectItem>
                            <SelectItem value="Radar">Radar</SelectItem>
                            <SelectItem value="Lock">Lock</SelectItem>
                            <SelectItem value="Shield">Shield</SelectItem>
                            <SelectItem value="Sparkles">Sparkles</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Título</Label>
                        <Input
                          value={item.title || ''}
                          onChange={(e) => updateArrayItem('items', index, 'title', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Descrição</Label>
                      <Textarea
                        value={item.description || ''}
                        onChange={(e) => updateArrayItem('items', index, 'description', e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {section.section_type === 'banner' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Emoji</Label>
                  <Input
                    value={content.emoji || ''}
                    onChange={(e) => updateField('emoji', e.target.value)}
                    placeholder="🕵️"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={content.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={content.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={2}
                />
              </div>
              {section.section_key === 'ghost_banner' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Preço</Label>
                    <Input
                      value={content.price || ''}
                      onChange={(e) => updateField('price', e.target.value)}
                      placeholder="+R$ 9,99"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Período</Label>
                    <Input
                      value={content.period || ''}
                      onChange={(e) => updateField('period', e.target.value)}
                      placeholder="/mês (add-on)"
                    />
                  </div>
                </div>
              )}
              {section.section_key === 'coupon_banner' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código do Cupom</Label>
                    <Input
                      value={content.coupon_code || ''}
                      onChange={(e) => updateField('coupon_code', e.target.value)}
                      placeholder="BEMVINDO10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Desconto</Label>
                    <Input
                      value={content.discount || ''}
                      onChange={(e) => updateField('discount', e.target.value)}
                      placeholder="10% OFF"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {section.section_type === 'cta' && (
            <>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={content.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Texto do Botão</Label>
                  <Input
                    value={content.cta || ''}
                    onChange={(e) => updateField('cta', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link</Label>
                  <Input
                    value={content.cta_link || ''}
                    onChange={(e) => updateField('cta_link', e.target.value)}
                    placeholder="/signup"
                  />
                </div>
              </div>
            </>
          )}

          {section.section_type === 'content' && section.section_key === 'creators' && (
            <>
              <div className="space-y-2">
                <Label>Badge</Label>
                <Input
                  value={content.badge || ''}
                  onChange={(e) => updateField('badge', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={content.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Subtítulo</Label>
                <Textarea
                  value={content.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Texto do Botão</Label>
                  <Input
                    value={content.cta || ''}
                    onChange={(e) => updateField('cta', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link</Label>
                  <Input
                    value={content.cta_link || ''}
                    onChange={(e) => updateField('cta_link', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Estatísticas</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addArrayItem('stats', { value: '', label: '' })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {(content.stats || []).map((stat: any, index: number) => (
                  <div key={index} className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Valor</Label>
                      <Input
                        value={stat.value || ''}
                        onChange={(e) => updateArrayItem('stats', index, 'value', e.target.value)}
                        placeholder="10K+"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={stat.label || ''}
                        onChange={(e) => updateArrayItem('stats', index, 'label', e.target.value)}
                        placeholder="Criadores ativos"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive flex-shrink-0"
                      onClick={() => removeArrayItem('stats', index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {section.section_type === 'content' && section.section_key === 'couples' && (
            <>
              <div className="space-y-2">
                <Label>Badge</Label>
                <Input
                  value={content.badge || ''}
                  onChange={(e) => updateField('badge', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={content.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Subtítulo</Label>
                <Textarea
                  value={content.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (separadas por vírgula)</Label>
                <Input
                  value={(content.tags || []).join(', ')}
                  onChange={(e) => updateField('tags', e.target.value.split(',').map((t: string) => t.trim()))}
                  placeholder="Ménage, Voyeur, Soft Swing"
                />
              </div>
            </>
          )}

          {section.section_type === 'footer' && (
            <>
              <div className="space-y-2">
                <Label>Copyright</Label>
                <Input
                  value={content.copyright || ''}
                  onChange={(e) => updateField('copyright', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Restrição de Idade</Label>
                <Input
                  value={content.age_restriction || ''}
                  onChange={(e) => updateField('age_restriction', e.target.value)}
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Links</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addArrayItem('links', { label: '', href: '' })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {(content.links || []).map((link: any, index: number) => (
                  <div key={index} className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Texto</Label>
                      <Input
                        value={link.label || ''}
                        onChange={(e) => updateArrayItem('links', index, 'label', e.target.value)}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Link</Label>
                      <Input
                        value={link.href || ''}
                        onChange={(e) => updateArrayItem('links', index, 'href', e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive flex-shrink-0"
                      onClick={() => removeArrayItem('links', index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Plans section editor */}
          {section.section_type === 'plans' && (
            <>
              <div className="space-y-2">
                <Label>Badge</Label>
                <Input
                  value={content.badge || ''}
                  onChange={(e) => updateField('badge', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={content.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Subtítulo</Label>
                <Textarea
                  value={content.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Planos</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addArrayItem('plans', {
                      name: 'Novo Plano',
                      icon: 'Sparkles',
                      price: 'R$ 0',
                      period: '/mês',
                      description: '',
                      features: [],
                      cta: 'Escolher',
                      highlighted: false,
                    })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Plano
                  </Button>
                </div>
                {(content.plans || []).map((plan: any, index: number) => (
                  <div key={index} className="p-4 rounded-lg border border-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{plan.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeArrayItem('plans', index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          value={plan.name || ''}
                          onChange={(e) => updateArrayItem('plans', index, 'name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ícone</Label>
                        <Select
                          value={plan.icon}
                          onValueChange={(v) => updateArrayItem('plans', index, 'icon', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Users">Users</SelectItem>
                            <SelectItem value="Sparkles">Sparkles</SelectItem>
                            <SelectItem value="Crown">Crown</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Preço</Label>
                        <Input
                          value={plan.price || ''}
                          onChange={(e) => updateArrayItem('plans', index, 'price', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Período</Label>
                        <Input
                          value={plan.period || ''}
                          onChange={(e) => updateArrayItem('plans', index, 'period', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Descrição</Label>
                      <Input
                        value={plan.description || ''}
                        onChange={(e) => updateArrayItem('plans', index, 'description', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Features (separadas por vírgula)</Label>
                      <Textarea
                        value={(plan.features || []).join(', ')}
                        onChange={(e) => updateArrayItem('plans', index, 'features', e.target.value.split(',').map((f: string) => f.trim()))}
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Texto do Botão</Label>
                        <Input
                          value={plan.cta || ''}
                          onChange={(e) => updateArrayItem('plans', index, 'cta', e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Switch
                          checked={plan.highlighted}
                          onCheckedChange={(checked) => updateArrayItem('plans', index, 'highlighted', checked)}
                        />
                        <Label className="text-xs">Destacado</Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Early Bird Section Editor */}
          {section.section_type === 'early_bird' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Emoji</Label>
                  <Input
                    value={content.emoji || ''}
                    onChange={(e) => updateField('emoji', e.target.value)}
                    placeholder="🎭"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={content.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Promoção de Carnaval 2026"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={content.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={2}
                  placeholder="Seja um dos 1000 primeiros e ganhe meses extras!"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Texto do Botão CTA</Label>
                  <Input
                    value={content.cta_text || ''}
                    onChange={(e) => updateField('cta_text', e.target.value)}
                    placeholder="Garantir Minha Vaga"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={content.show_cta ?? true}
                    onCheckedChange={(checked) => updateField('show_cta', checked)}
                  />
                  <Label>Mostrar Botão CTA</Label>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#FF007F] hover:bg-[#FF007F]/90"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main Page Component
export default function AdminSiteEditorPage() {
  const { data: sections, isLoading } = useSiteSections();
  const updateSection = useUpdateSection();
  const toggleVisibility = useToggleSectionVisibility();
  const reorderSections = useReorderSections();
  const deleteSection = useDeleteSection();

  const [editingSection, setEditingSection] = useState<SiteSection | null>(null);
  const [deletingSection, setDeletingSection] = useState<SiteSection | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && sections) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);

      const newOrder = arrayMove(sections, oldIndex, newIndex);
      const updates = newOrder.map((section, index) => ({
        id: section.id,
        display_order: index + 1,
      }));

      reorderSections.mutate(updates);
    }
  };

  const handleSave = (id: string, content: Record<string, any>, name: string) => {
    updateSection.mutate(
      { id, updates: { content, section_name: name } },
      { onSuccess: () => setEditingSection(null) }
    );
  };

  const handleDelete = () => {
    if (deletingSection) {
      deleteSection.mutate(deletingSection.id, {
        onSuccess: () => setDeletingSection(null),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 sm:h-7 sm:w-7 text-[#FF007F]" />
            Editor do Site
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edite o conteúdo da landing page sem alterar código
          </p>
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Visualizar Site
          </Button>
        </a>
      </div>

      {/* Sections List */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Seções da Landing Page
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Arraste para reordenar. Clique no lápis para editar.
          </p>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections?.map((s) => s.id) || []}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {sections?.map((section) => (
                  <SortableSectionItem
                    key={section.id}
                    section={section}
                    onEdit={setEditingSection}
                    onToggleVisibility={(id, isVisible) =>
                      toggleVisibility.mutate({ id, isVisible })
                    }
                    onDelete={setDeletingSection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <SectionEditorModal
        section={editingSection}
        open={!!editingSection}
        onOpenChange={(open) => !open && setEditingSection(null)}
        onSave={handleSave}
        isSaving={updateSection.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingSection} onOpenChange={(open) => !open && setDeletingSection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover seção?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a seção "{deletingSection?.section_name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteSection.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
