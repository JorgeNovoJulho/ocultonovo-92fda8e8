/**
 * Dialog para criar/editar Safety Check-in
 * - Captura GPS real do dispositivo
 * - Salva rascunho no localStorage
 * - Envia alerta WhatsApp de teste para contatos de emergência
 */
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Shield, Plus, MapPin, Clock, Users, Loader2, Phone, AlertCircle, Navigation, Mail, Link as LinkIcon, Paperclip, Mic, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  useCreateCheckin,
  CheckinType,
  EmergencyContact,
  checkinTypeLabels,
  SafetyCheckin,
} from "@/hooks/useSafetyCheckin";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "@/hooks/use-toast";

// Validação telefone BR: 10 ou 11 dígitos (com ou sem +55)
function isValidBrPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits.length === 12 || digits.length === 13;
  return digits.length === 10 || digits.length === 11;
}

interface CreateCheckinDialogProps {
  trigger?: React.ReactNode;
  editCheckin?: SafetyCheckin;
}

const DRAFT_KEY = "safety_checkin_draft";

function saveDraft(data: Record<string, unknown>) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
}

function loadDraft(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export function CreateCheckinDialog({ trigger, editCheckin }: CreateCheckinDialogProps) {
  const [open, setOpen] = useState(false);

  // Campos do formulário
  const [checkinType, setCheckinType] = useState<CheckinType>("meetup");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [gracePeriod, setGracePeriod] = useState(30);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [shareLocation, setShareLocation] = useState(false);
  const [meetingProfileUrl, setMeetingProfileUrl] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [deactivationPin, setDeactivationPin] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  // Contatos de emergência
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  // Alerta de teste
  const [sendingAlert, setSendingAlert] = useState(false);
  const [lastAlertStatus, setLastAlertStatus] = useState<string | null>(null);

  // GPS real-time
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const createCheckin = useCreateCheckin();

  // ── Capturar GPS real do dispositivo ──────────────────────────────────────
  const captureGPS = () => {
    if (!navigator.geolocation) {
      setGpsError("GPS não disponível neste dispositivo");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    setGpsLat(null);
    setGpsLng(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
        setGpsLoading(false);
        toast({ title: "📍 Localização capturada", description: "Coordenadas GPS salvas com sucesso." });
      },
      (err) => {
        setGpsError(`Não foi possível obter GPS: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  // ── Ao abrir: preencher com dados ────────────────────────────────────────
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) return;

    if (editCheckin) {
      setCheckinType(editCheckin.checkin_type);
      const dt = new Date(editCheckin.scheduled_at);
      setScheduledDate(format(dt, "yyyy-MM-dd"));
      setScheduledTime(format(dt, "HH:mm"));
      setGracePeriod(editCheckin.grace_period_minutes);
      setLocation(editCheckin.location_description || "");
      setNotes(editCheckin.notes || "");
      setShareLocation(editCheckin.share_location_with_contacts);
      setContacts(editCheckin.emergency_contacts || []);
      if (editCheckin.location_lat) setGpsLat(editCheckin.location_lat);
      if (editCheckin.location_lng) setGpsLng(editCheckin.location_lng);
      if (editCheckin.alert_sent_at) {
        setLastAlertStatus(`Último alerta: ${format(new Date(editCheckin.alert_sent_at), "dd/MM/yyyy HH:mm")}`);
      } else {
        setLastAlertStatus(null);
      }
    } else {
      const draft = loadDraft();
      if (draft) {
        setCheckinType((draft.checkinType as CheckinType) || "meetup");
        setScheduledDate((draft.scheduledDate as string) || "");
        setScheduledTime((draft.scheduledTime as string) || "");
        setGracePeriod((draft.gracePeriod as number) || 30);
        setLocation((draft.location as string) || "");
        setNotes((draft.notes as string) || "");
        setShareLocation((draft.shareLocation as boolean) || false);
        setContacts((draft.contacts as EmergencyContact[]) || []);
      } else {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        setScheduledDate(format(now, "yyyy-MM-dd"));
        setScheduledTime(format(now, "HH:mm"));
      }
      setLastAlertStatus(null);
      setGpsLat(null);
      setGpsLng(null);
      setGpsError(null);
    }
  };

  // ── Auto-salvar rascunho ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open || editCheckin) return;
    saveDraft({ checkinType, scheduledDate, scheduledTime, gracePeriod, location, notes, shareLocation, contacts });
  }, [open, editCheckin, checkinType, scheduledDate, scheduledTime, gracePeriod, location, notes, shareLocation, contacts]);

  // ── Adicionar contato ────────────────────────────────────────────────────
  const addContact = () => {
    const name = contactName.trim();
    const phone = contactPhone.trim();
    if (!name) {
      toast({ title: "Nome obrigatório", description: "Informe o nome do contato.", variant: "destructive" });
      return;
    }
    if (!phone) {
      toast({ title: "Telefone obrigatório", description: "Sem telefone, o alerta WhatsApp não será enviado.", variant: "destructive" });
      return;
    }
    if (!isValidBrPhone(phone)) {
      toast({ title: "Telefone inválido", description: "Use formato BR: 11999999999 (com DDD).", variant: "destructive" });
      return;
    }
      setContacts(prev => [...prev, { name, phone, email: contactEmail.trim() || undefined, relationship: "outro" }]);
    setContactName("");
    setContactPhone("");
    setContactEmail("");
  };

  const removeContact = (index: number) => {
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  // ── Enviar alerta de teste via WhatsApp ──────────────────────────────────
  const handleSendTestAlert = async (contact: EmergencyContact) => {
    if (!contact.phone) {
      toast({ title: "Sem telefone", description: "Este contato não tem telefone.", variant: "destructive" });
      return;
    }
    if (editCheckin?.alert_sent_at) {
      const diffMinutes = (Date.now() - new Date(editCheckin.alert_sent_at).getTime()) / 60000;
      if (diffMinutes < 5) {
        toast({
          title: "Alerta recente",
          description: `Alerta enviado há ${Math.round(diffMinutes)} min. Aguarde 5 min.`,
          variant: "destructive",
        });
        return;
      }
    }

    setSendingAlert(true);
    try {
      const typeLabel = checkinTypeLabels[checkinType];
      let locationInfo = location ? `\n📍 Local: ${location}` : "";
      if (gpsLat && gpsLng) {
        locationInfo += `\n🗺️ GPS: https://maps.google.com/?q=${gpsLat},${gpsLng}`;
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-gateway", {
        body: {
          action: "send",
          phone: contact.phone,
          message: `🛡️ *Alerta de Segurança - OcultaSwing*\n\nOlá ${contact.name}! Alerta de segurança para *${typeLabel}* agendado para *${scheduledDate} às ${scheduledTime}*.${locationInfo}\n⏰ Tempo extra: ${gracePeriod} minutos\n\nSe não receber confirmação, entre em contato imediatamente.`,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "✅ Alerta Enviado!", description: `WhatsApp para ${contact.phone}` });
        setLastAlertStatus(`Alerta enviado para ${contact.name} (${contact.phone})`);
      } else {
        throw new Error(data?.error || "Falha ao enviar");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao enviar alerta", description: msg, variant: "destructive" });
    } finally {
      setSendingAlert(false);
    }
  };

  // ── Submeter formulário ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!scheduledDate || !scheduledTime) return;

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);

    const created = await createCheckin.mutateAsync({
      checkinType,
      scheduledAt,
      gracePeriodMinutes: gracePeriod,
      locationDescription: location.trim() || undefined,
      locationLat: gpsLat ?? undefined,
      locationLng: gpsLng ?? undefined,
      emergencyContacts: contacts.length > 0 ? contacts : undefined,
      shareLocationWithContacts: shareLocation,
      meetingProfileUrl: meetingProfileUrl.trim() || undefined,
      trackingEnabled,
      recordingEnabled,
      deactivationPin: deactivationPin.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    if (attachments.length > 0 && created?.id) {
      for (const file of attachments) {
        const path = `${created.user_id}/${created.id}/attachments/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { data: uploaded, error: uploadError } = await supabase.storage.from("safety-evidence").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: signed } = await supabase.storage.from("safety-evidence").createSignedUrl(uploaded.path, 60 * 60 * 24 * 7);
        await (supabase as any).from("safety_checkin_attachments").insert({
          checkin_id: created.id,
          user_id: created.user_id,
          file_url: signed?.signedUrl || uploaded.path,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
        });
      }
    }

    clearDraft();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Check-in
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {editCheckin ? "Editar Check-in" : "Agendar Check-in de Segurança"}
          </DialogTitle>
          <DialogDescription>
            Configure um check-in de segurança. Seus contatos serão alertados se você não confirmar no prazo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tipo de check-in */}
          <div className="space-y-2">
            <Label>Tipo de encontro</Label>
            <Select value={checkinType} onValueChange={(v) => setCheckinType(v as CheckinType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(checkinTypeLabels) as [CheckinType, string][]).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data e Hora */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Data *
              </Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
              />
            </div>
            <div className="space-y-2">
              <Label>Horário *</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          {/* Período de graça */}
          <div className="space-y-2">
            <Label>Tempo extra antes do alerta</Label>
            <Select value={gracePeriod.toString()} onValueChange={(v) => setGracePeriod(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="45">45 minutos</SelectItem>
                <SelectItem value="60">1 hora</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se não confirmar dentro deste tempo após o horário, seus contatos serão alertados automaticamente.
            </p>
          </div>

          {/* Localização */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Local (opcional)
            </Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Shopping Center Norte, São Paulo"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Perfil da pessoa que vou encontrar
            </Label>
            <Input
              value={meetingProfileUrl}
              onChange={(e) => setMeetingProfileUrl(e.target.value)}
              placeholder="Cole o link do perfil para seus contatos identificarem a pessoa"
            />
          </div>

          {/* GPS em tempo real */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              Localização GPS em tempo real
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={captureGPS}
                disabled={gpsLoading}
                className="gap-2"
              >
                {gpsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Navigation className="h-3.5 w-3.5" />
                )}
                {gpsLoading ? "Capturando..." : "Capturar GPS"}
              </Button>
              {gpsLat && gpsLng && (
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 gap-1">
                  <Navigation className="h-3 w-3" />
                  {gpsLat.toFixed(4)}, {gpsLng.toFixed(4)}
                </Badge>
              )}
            </div>
            {gpsError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {gpsError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              As coordenadas serão incluídas no alerta para seus contatos de emergência.
            </p>
          </div>

          {/* Compartilhar localização */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label>Compartilhar localização com contatos</Label>
              <p className="text-xs text-muted-foreground">
                O link do Google Maps será enviado junto com o alerta de emergência
              </p>
            </div>
            <Switch checked={shareLocation} onCheckedChange={setShareLocation} />
          </div>

          <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="flex items-center gap-2"><Navigation className="h-4 w-4" />Rastreamento GPS contínuo</Label>
                <p className="text-xs text-muted-foreground">Atualiza sua posição durante o encontro até você desativar com PIN.</p>
              </div>
              <Switch checked={trackingEnabled} onCheckedChange={setTrackingEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
              <div>
                <Label className="flex items-center gap-2"><Mic className="h-4 w-4" />Gravação de voz protegida</Label>
                <p className="text-xs text-muted-foreground">Você será avisado ao ativar/desativar. O navegador pedirá permissão do microfone.</p>
              </div>
              <Switch checked={recordingEnabled} onCheckedChange={setRecordingEnabled} />
            </div>
            {(trackingEnabled || recordingEnabled) && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <Label className="flex items-center gap-2"><KeyRound className="h-4 w-4" />PIN para desativar</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  value={deactivationPin}
                  onChange={(e) => setDeactivationPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="4 a 6 números"
                />
              </div>
            )}
          </div>

          {/* Contatos de emergência */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contatos de Emergência
            </Label>

            <div className="flex gap-2">
              <Input
                placeholder="Nome"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && addContact()}
              />
              <Input
                placeholder="Telefone (ex: 11999999999)"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && addContact()}
              />
              <Input
                placeholder="E-mail"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && addContact()}
              />
              <Button type="button" variant="outline" onClick={addContact}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {contacts.length > 0 && (
              <div className="space-y-2">
                {contacts.map((contact, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{contact.name}</span>
                      {contact.phone && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          <Phone className="h-3 w-3 mr-1" />
                          {contact.phone}
                        </Badge>
                      )}
                      {contact.email && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          <Mail className="h-3 w-3 mr-1" />
                          {contact.email}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {contact.phone && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-primary hover:text-primary/80 h-7 px-2"
                          onClick={() => handleSendTestAlert(contact)}
                          disabled={sendingAlert}
                          title="Enviar alerta de teste via WhatsApp"
                        >
                          {sendingAlert ? <Loader2 className="h-3 w-3 animate-spin" /> : "Testar"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => removeContact(index)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {contacts.length === 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 border border-dashed border-border rounded p-2">
                <AlertCircle className="h-3 w-3" />
                Adicione pelo menos um contato com telefone para receber alertas automáticos.
              </p>
            )}

            {/* Status do último alerta */}
            {lastAlertStatus && (
              <div className="flex items-start gap-2 text-xs p-2 rounded-md bg-primary/10 text-primary border border-primary/20">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{lastAlertStatus}</span>
              </div>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Anexos para emergência</Label>
            <Input
              type="file"
              multiple
              accept="image/*,application/pdf,video/*"
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
            />
            {attachments.length > 0 && <p className="text-xs text-muted-foreground">{attachments.length} anexo(s) serão enviados aos contatos em caso de alerta.</p>}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais sobre o encontro..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!scheduledDate || !scheduledTime || createCheckin.isPending}
            className="flex-1 gap-2"
          >
            {createCheckin.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            {editCheckin ? "Salvar Alterações" : "Agendar Check-in"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
