import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useInterestTags } from "@/hooks/useInterestTags";
import { ChevronDown, ChevronUp, Eye, EyeOff, Sparkles, Flame, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseExternal";

interface TagSelectorProps {
  socialTags: string[];
  adultTags: string[];
  connectionMode: boolean;
  onSocialTagsChange: (tags: string[]) => void;
  onAdultTagsChange: (tags: string[]) => void;
  onConnectionModeChange: (mode: boolean) => void;
  readOnly?: boolean;
}

export function TagSelector({
  socialTags,
  adultTags,
  connectionMode,
  onSocialTagsChange,
  onAdultTagsChange,
  onConnectionModeChange,
  readOnly = false,
}: TagSelectorProps) {
  const [socialExpanded, setSocialExpanded] = useState(true);
  const [adultExpanded, setAdultExpanded] = useState(false);
  const [customSocialInput, setCustomSocialInput] = useState("");
  const [customAdultInput, setCustomAdultInput] = useState("");
  const [customSocialTags, setCustomSocialTags] = useState<string[]>([]);
  const [customAdultTags, setCustomAdultTags] = useState<string[]>([]);
  const {
    socialTags: SOCIAL_TAGS,
    adultTags: ADULT_TAGS,
    socialIcons: SOCIAL_TAG_ICONS,
    adultIcons: ADULT_TAG_ICONS,
  } = useInterestTags();

  // Load custom tags from DB
  useEffect(() => {
    const fetchCustomTags = async () => {
      const { data } = await supabase
        .from('custom_tags')
        .select('tag_name, tag_type');
      if (data) {
        setCustomSocialTags(data.filter(t => t.tag_type === 'social').map(t => t.tag_name));
        setCustomAdultTags(data.filter(t => t.tag_type === 'adult').map(t => t.tag_name));
      }
    };
    fetchCustomTags();
  }, []);

  const toggleTag = (tag: string, current: string[], onChange: (t: string[]) => void) => {
    if (readOnly) return;
    if (current.includes(tag)) {
      onChange(current.filter(t => t !== tag));
    } else {
      onChange([...current, tag]);
    }
  };

  const addCustomTag = async (type: 'social' | 'adult') => {
    const input = type === 'social' ? customSocialInput.trim() : customAdultInput.trim();
    if (!input) return;

    const allTags = type === 'social'
      ? [...SOCIAL_TAGS as unknown as string[], ...customSocialTags]
      : [...ADULT_TAGS as unknown as string[], ...customAdultTags];

    if (allTags.some(t => t.toLowerCase() === input.toLowerCase())) {
      // Tag already exists, just select it
      const existing = allTags.find(t => t.toLowerCase() === input.toLowerCase())!;
      const current = type === 'social' ? socialTags : adultTags;
      const onChange = type === 'social' ? onSocialTagsChange : onAdultTagsChange;
      if (!current.includes(existing)) {
        onChange([...current, existing]);
      }
    } else {
      // Save to DB
      await supabase.from('custom_tags').insert({ tag_name: input, tag_type: type } as any);
      if (type === 'social') {
        setCustomSocialTags(prev => [...prev, input]);
        onSocialTagsChange([...socialTags, input]);
      } else {
        setCustomAdultTags(prev => [...prev, input]);
        onAdultTagsChange([...adultTags, input]);
      }
    }

    if (type === 'social') setCustomSocialInput("");
    else setCustomAdultInput("");
  };

  const allSocialTags = [...SOCIAL_TAGS as unknown as string[], ...customSocialTags.filter(t => !(SOCIAL_TAGS as unknown as string[]).includes(t))];
  const allAdultTags = [...ADULT_TAGS as unknown as string[], ...customAdultTags.filter(t => !(ADULT_TAGS as unknown as string[]).includes(t))];

  return (
    <div className="space-y-4">
      {/* Social Tags Section */}
      <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
        <button
          onClick={() => setSocialExpanded(!socialExpanded)}
          className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 shrink-0" />
            <span className="font-semibold text-foreground text-sm sm:text-base truncate">Interesses Gerais</span>
            <Badge variant="secondary" className="text-[10px] sm:text-xs shrink-0">
              {socialTags.length}
            </Badge>
          </div>
          {socialExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {socialExpanded && (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3">
            <div className="flex flex-wrap gap-1.5 sm:gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide overscroll-contain">
              {allSocialTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag, socialTags, onSocialTagsChange)}
                  disabled={readOnly}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all border active:scale-95",
                    socialTags.includes(tag)
                      ? "bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.2)]"
                      : "bg-muted/30 border-border/30 text-muted-foreground hover:border-blue-500/30 hover:text-blue-400"
                  )}
                >
                  <span>{SOCIAL_TAG_ICONS[tag] || '✨'}</span>
                  {tag}
                </button>
              ))}
            </div>

            {/* Custom tag input */}
            {!readOnly && (
              <div className="flex gap-2">
                <Input
                  value={customSocialInput}
                  onChange={(e) => setCustomSocialInput(e.target.value)}
                  placeholder="Outro interesse..."
                  className="h-8 text-xs bg-muted/30 border-border/50"
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTag('social')}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 shrink-0"
                  onClick={() => addCustomTag('social')}
                  disabled={!customSocialInput.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Adult Tags Section */}
      <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
        <button
          onClick={() => setAdultExpanded(!adultExpanded)}
          className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-red-400 shrink-0" />
            <span className="font-semibold text-foreground text-sm sm:text-base truncate">Interesses Ocultos +18</span>
            <Badge variant="secondary" className="text-[10px] sm:text-xs shrink-0">
              {adultTags.length}
            </Badge>
          </div>
          {adultExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {adultExpanded && (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3">
            {/* Connection Mode Toggle */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/20 border border-primary/20">
              <div className="flex items-center gap-2 min-w-0">
                {connectionMode ? <Eye className="h-4 w-4 text-primary shrink-0" /> : <EyeOff className="h-4 w-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Modo Conexão</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {connectionMode ? "Tags ocultas visíveis" : "Ative para mostrar"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !readOnly && onConnectionModeChange(!connectionMode)}
                className={cn(
                  "w-10 h-5 rounded-full transition-colors relative shrink-0",
                  connectionMode ? "bg-primary" : "bg-muted"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
                  connectionMode ? "translate-x-5" : "translate-x-0.5"
                )} />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide overscroll-contain">
              {allAdultTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag, adultTags, onAdultTagsChange)}
                  disabled={readOnly}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all border active:scale-95",
                    adultTags.includes(tag)
                      ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.2)]"
                      : "bg-muted/30 border-border/30 text-muted-foreground hover:border-red-500/30 hover:text-red-400"
                  )}
                >
                  <span>{ADULT_TAG_ICONS[tag] || '🔥'}</span>
                  {tag}
                </button>
              ))}
            </div>

            {/* Custom tag input */}
            {!readOnly && (
              <div className="flex gap-2">
                <Input
                  value={customAdultInput}
                  onChange={(e) => setCustomAdultInput(e.target.value)}
                  placeholder="Outro interesse +18..."
                  className="h-8 text-xs bg-muted/30 border-border/50"
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTag('adult')}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 shrink-0"
                  onClick={() => addCustomTag('adult')}
                  disabled={!customAdultInput.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
