import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Moon, MapPin, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroPreviewToolbarProps {
  timeOverride: 'day' | 'night' | null;
  cityOverride: string | null;
  onTimeChange: (time: 'day' | 'night' | null) => void;
  onCityChange: (city: string | null) => void;
}

export function HeroPreviewToolbar({
  timeOverride,
  cityOverride,
  onTimeChange,
  onCityChange
}: HeroPreviewToolbarProps) {
  const [cityInput, setCityInput] = useState(cityOverride || "");

  const handleCityApply = () => {
    onCityChange(cityInput.trim() || null);
  };

  const handleReset = () => {
    onTimeChange(null);
    onCityChange(null);
    setCityInput("");
  };

  return (
    <div className="flex items-center flex-wrap gap-4 p-4 bg-muted/50 rounded-lg border border-border/50">
      {/* Time Toggle */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium text-muted-foreground">Período:</Label>
        <div className="flex rounded-lg border border-border/50 overflow-hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-none border-r border-border/50 gap-2",
              timeOverride === 'day' && "bg-amber-500/20 text-amber-500"
            )}
            onClick={() => onTimeChange(timeOverride === 'day' ? null : 'day')}
          >
            <Sun className="h-4 w-4" />
            Dia
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-none gap-2",
              timeOverride === 'night' && "bg-indigo-500/20 text-indigo-400"
            )}
            onClick={() => onTimeChange(timeOverride === 'night' ? null : 'night')}
          >
            <Moon className="h-4 w-4" />
            Noite
          </Button>
        </div>
      </div>

      {/* City Override */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          Cidade:
        </Label>
        <Input
          placeholder="São Paulo"
          value={cityInput}
          onChange={(e) => setCityInput(e.target.value)}
          onBlur={handleCityApply}
          onKeyDown={(e) => e.key === 'Enter' && handleCityApply()}
          className="w-40 h-8 text-sm"
        />
      </div>

      {/* Reset Button */}
      {(timeOverride || cityOverride) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-2"
        >
          <RotateCcw className="h-3 w-3" />
          Resetar
        </Button>
      )}

      {/* Current Status */}
      <div className="ml-auto text-xs text-muted-foreground">
        Visualizando como: {' '}
        <span className="font-medium text-foreground">
          {timeOverride ? (timeOverride === 'day' ? '☀️ Dia' : '🌙 Noite') : '⏰ Automático'}
        </span>
        {cityOverride && (
          <span className="ml-2">
            em <span className="font-medium text-foreground">{cityOverride}</span>
          </span>
        )}
      </div>
    </div>
  );
}
