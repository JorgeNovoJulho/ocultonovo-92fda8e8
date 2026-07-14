/**
 * Card de Safety Check-in
 * Exibe check-ins pendentes e permite confirmar segurança
 */
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Shield, Clock, MapPin, AlertTriangle, Check, X, Loader2, Trash2, Navigation, Mic, Square, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  SafetyCheckin, 
  useConfirmCheckin, 
  useCancelCheckin,
  useDeleteCheckin,
  usePanicButton,
  useSaveCheckinLocation,
  useStopProtectedSafetyFeature,
  checkinTypeLabels,
  checkinStatusLabels
} from "@/hooks/useSafetyCheckin";

interface SafetyCheckinCardProps {
  checkin: SafetyCheckin;
  showActions?: boolean;
}

export function SafetyCheckinCard({ checkin, showActions = true }: SafetyCheckinCardProps) {
  const [showPanicConfirm, setShowPanicConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sosLocked, setSosLocked] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  
  const confirmCheckin = useConfirmCheckin();
  const cancelCheckin = useCancelCheckin();
  const deleteCheckin = useDeleteCheckin();
  const panicButton = usePanicButton();
  const saveLocation = useSaveCheckinLocation();
  const stopProtected = useStopProtectedSafetyFeature();

  const isOverdue = new Date(checkin.scheduled_at) < new Date() && checkin.status === 'scheduled';
  const isPending = checkin.status === 'scheduled';
  const notifiedCount = checkin.alert_sent_at && checkin.emergency_contacts
    ? checkin.emergency_contacts.filter(c => c.phone).length
    : 0;

  const handlePanic = () => {
    if (sosLocked) return;
    setSosLocked(true);
    panicButton.mutate({ checkinId: checkin.id });
    setShowPanicConfirm(false);
    setTimeout(() => setSosLocked(false), 10000);
  };

  const mapsUrl = checkin.location_lat && checkin.location_lng ? `https://www.google.com/maps?q=${checkin.location_lat},${checkin.location_lng}` : null;
  const wazeUrl = checkin.location_lat && checkin.location_lng ? `https://waze.com/ul?ll=${checkin.location_lat},${checkin.location_lng}&navigate=yes` : null;

  useEffect(() => {
    if (!showActions || !isPending || !checkin.tracking_active || !navigator.geolocation || watchIdRef.current !== null) return;
    toast({ title: "GPS ativado", description: "Sua localização está sendo atualizada para este encontro." });
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => saveLocation.mutate({ checkinId: checkin.id, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => toast({ title: "Falha no GPS", description: err.message, variant: "destructive" }),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [checkin.id, checkin.tracking_active, isPending, saveLocation, showActions]);

  const startRecording = async () => {
    if (recorderRef.current?.state === "recording") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const path = `${checkin.user_id}/${checkin.id}/recordings/${Date.now()}.webm`;
        const { data, error } = await supabase.storage.from("safety-evidence").upload(path, blob, { contentType: "audio/webm" });
        if (!error && data) {
          const { data: signed } = await supabase.storage.from("safety-evidence").createSignedUrl(data.path, 60 * 60 * 24 * 7);
          await (supabase as any).from("safety_checkin_recordings").insert({ checkin_id: checkin.id, user_id: checkin.user_id, audio_url: signed?.signedUrl || data.path, duration_seconds: recordingSeconds });
        }
      };
      recorderRef.current = recorder;
      recorder.start(30000);
      timerRef.current = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
      toast({ title: "Gravação ativada", description: "O áudio do encontro está sendo protegido." });
    } catch (err: any) {
      toast({ title: "Microfone indisponível", description: err?.message || "Permissão negada", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (showActions && isPending && checkin.recording_enabled && checkin.recording_active !== false) void startRecording();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
  }, [checkin.id, checkin.recording_active, checkin.recording_enabled, isPending, showActions]);

  const handleStopAll = async () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    await stopProtected.mutateAsync({ checkin, pin, feature: "all" });
    setShowPinDialog(false);
    setPin("");
  };

  const getStatusColor = () => {
    switch (checkin.status) {
      case 'checked_in': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'missed': return 'bg-destructive/20 text-destructive border-destructive/50';
      case 'alert_sent': return 'bg-destructive/20 text-destructive border-destructive/50';
      case 'cancelled': return 'bg-muted text-muted-foreground border-muted';
      default: return isOverdue 
        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
        : 'bg-primary/20 text-primary border-primary/50';
    }
  };

  return (
    <>
      <Card className={`${isOverdue ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Shield className={`h-5 w-5 ${isOverdue ? 'text-amber-400' : 'text-primary'}`} />
              <CardTitle className="text-base">
                {checkinTypeLabels[checkin.checkin_type]}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getStatusColor()}>
                {isOverdue && isPending ? '⏰ Atrasado' : checkinStatusLabels[checkin.status]}
              </Badge>
              {showActions && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <CardDescription className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3" />
            {format(new Date(checkin.scheduled_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {checkin.location_description && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{checkin.location_description}</span>
            </div>
          )}

          {checkin.notes && (
            <p className="text-sm text-muted-foreground">{checkin.notes}</p>
          )}

          {checkin.emergency_contacts && checkin.emergency_contacts.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Contatos:</span>{' '}
              {checkin.emergency_contacts.map(c => c.name).join(', ')}
            </div>
          )}

          {(checkin.tracking_active || checkin.recording_enabled || mapsUrl || checkin.meeting_profile_url) && (
            <div className="space-y-2 rounded-lg border border-border/40 bg-muted/25 p-3">
              <div className="flex flex-wrap gap-2">
                {checkin.tracking_active && <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><Navigation className="h-3 w-3" />GPS ativo</Badge>}
                {checkin.recording_enabled && <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><Mic className="h-3 w-3" />Gravação {recordingSeconds > 0 ? `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}` : 'ativa'}</Badge>}
              </div>
              {checkin.last_location_at && <p className="text-xs text-muted-foreground">Última localização: {format(new Date(checkin.last_location_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>}
              <div className="flex flex-wrap gap-2">
                {mapsUrl && <Button asChild type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs"><a href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Maps</a></Button>}
                {wazeUrl && <Button asChild type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs"><a href={wazeUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Waze</a></Button>}
                {checkin.meeting_profile_url && <Button asChild type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs"><a href={checkin.meeting_profile_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Perfil</a></Button>}
              </div>
              {(checkin.tracking_active || checkin.recording_enabled) && showActions && isPending && (
                <Button type="button" variant="secondary" size="sm" className="w-full gap-2" onClick={() => setShowPinDialog(true)}>
                  <Square className="h-3.5 w-3.5" />Encerrar proteção com PIN
                </Button>
              )}
            </div>
          )}

          {checkin.alert_sent_at && notifiedCount > 0 && (
            <div className="text-xs text-primary bg-primary/10 border border-primary/30 rounded px-2 py-1.5">
              ✅ Alerta enviado · {notifiedCount} contato{notifiedCount > 1 ? 's' : ''} notificado{notifiedCount > 1 ? 's' : ''} via WhatsApp
            </div>
          )}

          {showActions && isPending && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => confirmCheckin.mutate(checkin.id)}
                disabled={confirmCheckin.isPending}
                className="flex-1 gap-2"
                variant={isOverdue ? "default" : "outline"}
              >
                {confirmCheckin.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Estou Seguro(a)
              </Button>
              
              <Button
                onClick={() => cancelCheckin.mutate(checkin.id)}
                disabled={cancelCheckin.isPending}
                variant="ghost"
                size="icon"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {showActions && isPending && (
            <Button
              onClick={() => setShowPanicConfirm(true)}
              variant="destructive"
              className="w-full gap-2"
              size="sm"
            >
              <AlertTriangle className="h-4 w-4" />
              Preciso de Ajuda (SOS)
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Confirmação de Pânico */}
      <AlertDialog open={showPanicConfirm} onOpenChange={setShowPanicConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Enviar Alerta de Emergência?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Isso notificará seus contatos de emergência imediatamente. 
              Use apenas em situações reais de perigo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePanic}
              disabled={sosLocked || panicButton.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {panicButton.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {sosLocked ? 'Aguarde...' : 'Enviar Alerta SOS'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir este encontro?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro do encontro será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteCheckin.mutate(checkin.id);
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteCheckin.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar rastreamento/gravação?</AlertDialogTitle>
            <AlertDialogDescription>Informe o PIN configurado para encerrar a proteção deste encontro.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleStopAll} disabled={stopProtected.isPending || (!!checkin.deactivation_pin_hash && pin.length < 4)}>
              {stopProtected.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
