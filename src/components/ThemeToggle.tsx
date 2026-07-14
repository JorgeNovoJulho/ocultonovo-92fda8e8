/**
 * ThemeToggle — Toggle tri-estado discreto: Auto / Dark / Light.
 * Usa tokens semânticos, zero cores hardcoded.
 */
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';

const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Modo Claro', icon: Sun },
  { value: 'dark', label: 'Modo Escuro', icon: Moon },
  { value: 'auto', label: 'Automático', icon: Monitor },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  const currentIcon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;
  const CurrentIcon = currentIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <CurrentIcon className="h-5 w-5" />
          <span className="sr-only">Alterar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setMode(value)}
            className={mode === value ? 'bg-accent text-accent-foreground' : ''}
          >
            <Icon className="h-4 w-4 mr-2" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
