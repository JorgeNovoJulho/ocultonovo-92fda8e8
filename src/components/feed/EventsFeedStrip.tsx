/**
 * EventsFeedStrip — Sessão "Eventos" no feed principal.
 * Aparece após o 6º post (3 após "Explorar Novos Misteriosos").
 * Lista os eventos ativos (criados via /events). Sem eventos → aviso.
 */
import { memo, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, MapPin, Users, ArrowRight, PartyPopper, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents, type Event } from "@/hooks/useEvents";

function formatDate(date?: string, time?: string) {
  if (!date) return "";
  try {
    const d = new Date(`${date}T${time || "00:00"}`);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return date;
  }
}

export const EventsFeedStrip = memo(function EventsFeedStrip() {
  const navigate = useNavigate();
  const { data, isLoading } = useEvents();

  const events = useMemo<Event[]>(() => {
    const list = (data || []) as Event[];
    return list
      .filter((e) => e?.is_active !== false)
      .slice(0, 8);
  }, [data]);

  // Recolhe por padrão quando não há eventos; mantém estado controlado pelo usuário.
  const isEmpty = !isLoading && events.length === 0;
  const [expanded, setExpanded] = useState<boolean>(true);
  const [userToggled, setUserToggled] = useState(false);
  useEffect(() => {
    if (!isLoading && !userToggled) setExpanded(!isEmpty);
  }, [isLoading, isEmpty, userToggled]);

  return (
    <section
      aria-label="Eventos"
      className="mx-3 sm:mx-4 my-4 rounded-2xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/[0.06] to-transparent p-3"
    >
      <div className="flex items-center justify-between mb-3 px-1 gap-2">
        <button
          type="button"
          onClick={() => { setUserToggled(true); setExpanded((v) => !v); }}
          className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-fuchsia-500/5 transition-colors"
          aria-expanded={expanded}
          aria-controls="events-feed-strip-body"
        >
          <PartyPopper className="h-4 w-4 text-fuchsia-400 shrink-0" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-fuchsia-200/90 truncate">
            Eventos {isEmpty && <span className="ml-1 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">(vazio)</span>}
          </h3>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-fuchsia-300/70 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-fuchsia-300/70 shrink-0" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-fuchsia-300 hover:text-fuchsia-200 shrink-0"
          onClick={() => navigate("/events")}
        >
          Ver todos <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {expanded && (
      <div id="events-feed-strip-body">


      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-56 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card className="border-dashed border-fuchsia-500/20 bg-background/40">
          <CardContent className="p-5 text-center">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground mb-3">
              Sem eventos recentes acontecendo
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/events")}
              className="border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/10"
            >
              Explorar Eventos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => navigate(`/events?event=${event.id}`)}
              className="snap-start shrink-0 w-56 rounded-xl overflow-hidden border border-fuchsia-500/20 bg-card/60 text-left transition-transform active:scale-[0.98] hover:border-fuchsia-400/40"
            >
              <div
                className="h-24 w-full bg-gradient-to-br from-fuchsia-600/40 to-pink-600/40 bg-cover bg-center"
                style={
                  event.image_url
                    ? { backgroundImage: `url(${event.image_url})` }
                    : undefined
                }
              />
              <div className="p-2.5">
                <p className="text-sm font-semibold text-foreground truncate">
                  {event.title}
                </p>
                <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  <span>{formatDate(event.event_date, event.event_time)}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{event.location || "Local a confirmar"}</span>
                </div>
                {typeof event.rsvp_count === "number" && event.rsvp_count > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-fuchsia-300">
                    <Users className="h-3 w-3" />
                    <span>{event.rsvp_count} confirmados</span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      </div>
      )}
    </section>
  );
});
