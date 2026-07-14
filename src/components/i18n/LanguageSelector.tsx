import { Globe, Check, Download, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface LanguageSelectorProps {
  /** Renderização compacta (apenas ícone) */
  compact?: boolean;
  className?: string;
}

const FLAGS: Record<Lang, string> = { pt: "🇧🇷", en: "🇺🇸", es: "🇪🇸" };
const ORDER: Lang[] = ["pt", "en", "es"];

export function LanguageSelector({ compact = false, className }: LanguageSelectorProps) {
  const { lang, t, setLang, getPackStatus } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Lang | null>(null);
  // Re-renderiza no evento de pacote (downloading → installed/error).
  const [, force] = useState(0);
  useEffect(() => {
    const onPack = () => force((n) => n + 1);
    window.addEventListener("app:lang-pack-loaded", onPack);
    return () => window.removeEventListener("app:lang-pack-loaded", onPack);
  }, []);

  const handlePick = async (code: Lang) => {
    if (code === lang || busy) return;
    const status = getPackStatus(code);
    const needsDownload = code !== "pt" && status !== "installed";
    setBusy(code);
    const label = t(`language.${code}`);
    const toastId = needsDownload
      ? toast.loading(t("language.downloading", { lang: label }))
      : undefined;
    try {
      await setLang(code);
      // Invalida queries para que componentes cacheados re-renderizem com novo idioma.
      queryClient.invalidateQueries();
      if (toastId !== undefined) {
        toast.success(t("language.downloaded", { lang: label }), { id: toastId });
      } else {
        toast.success(t("language.changedTo", { lang: label }));
      }
    } catch {
      if (toastId !== undefined) {
        toast.error(t("language.downloadFailed"), { id: toastId });
      } else {
        toast.error(t("language.downloadFailed"));
      }
    } finally {
      setBusy(null);
    }
  };

  const renderStatusIcon = (code: Lang) => {
    const isBusy = busy === code;
    const isActive = lang === code;
    const status = getPackStatus(code);

    if (isBusy || status === "downloading") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="left">{t("language.downloading", { lang: t(`language.${code}`) })}</TooltipContent>
        </Tooltip>
      );
    }
    if (status === "error") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </TooltipTrigger>
          <TooltipContent side="left">{t("language.error")}</TooltipContent>
        </Tooltip>
      );
    }
    if (isActive) {
      return <Check className="h-4 w-4 text-primary" />;
    }
    if (status === "installed") {
      return (
        <span className="text-[10px] uppercase font-semibold text-emerald-500/90 tracking-wide">
          {t("language.installed")}
        </span>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="left">{t("language.available")}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            className={cn("gap-2", className)}
            aria-label={t("language.label")}
          >
            <Globe className="h-4 w-4" />
            {!compact && (
              <span className="text-sm font-medium">
                {FLAGS[lang]} {lang.toUpperCase()}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ORDER.map((code) => {
            const isBusy = busy === code;
            return (
              <DropdownMenuItem
                key={code}
                onClick={(e) => {
                  e.preventDefault();
                  void handlePick(code);
                }}
                disabled={isBusy}
                className="cursor-pointer flex items-center justify-between gap-2 py-2"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className="text-base leading-none">{FLAGS[code]}</span>
                  <span>{t(`language.${code}`)}</span>
                </span>
                <span className="flex items-center gap-1">{renderStatusIcon(code)}</span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground leading-snug">
            {t("language.download", { lang: "EN / ES" })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
