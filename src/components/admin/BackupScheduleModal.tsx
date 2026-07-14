import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Loader2, Trash2 } from 'lucide-react';
import { 
  BackupSchedule, 
  useCreateSchedule, 
  useUpdateSchedule,
  useDeleteSchedule 
} from '@/hooks/useBackupSystem';

const formSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'custom']),
  day_of_week: z.number().min(0).max(6).nullable(),
  day_of_month: z.number().min(1).max(31).nullable(),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido (HH:MM)'),
  include_media: z.boolean(),
  include_messages: z.boolean(),
  retention_days: z.number().min(7).max(365),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface BackupScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: BackupSchedule | null;
}

export function BackupScheduleModal({ open, onOpenChange, schedule }: BackupScheduleModalProps) {
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const isEditing = !!schedule;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      frequency: 'daily',
      day_of_week: 1,
      day_of_month: 1,
      time_of_day: '03:00',
      include_media: true,
      include_messages: true,
      retention_days: 30,
      is_active: true,
    },
  });

  const frequency = form.watch('frequency');

  useEffect(() => {
    if (schedule) {
      form.reset({
        name: schedule.name,
        frequency: schedule.frequency,
        day_of_week: schedule.day_of_week,
        day_of_month: schedule.day_of_month,
        time_of_day: schedule.time_of_day?.slice(0, 5) || '03:00',
        include_media: schedule.include_media,
        include_messages: schedule.include_messages,
        retention_days: schedule.retention_days,
        is_active: schedule.is_active,
      });
    } else {
      form.reset({
        name: '',
        frequency: 'daily',
        day_of_week: 1,
        day_of_month: 1,
        time_of_day: '03:00',
        include_media: true,
        include_messages: true,
        retention_days: 30,
        is_active: true,
      });
    }
  }, [schedule, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing) {
        await updateSchedule.mutateAsync({
          id: schedule.id,
          ...values,
        });
      } else {
        await createSchedule.mutateAsync({
          name: values.name,
          frequency: values.frequency,
          day_of_week: values.day_of_week,
          day_of_month: values.day_of_month,
          time_of_day: values.time_of_day,
          include_media: values.include_media,
          include_messages: values.include_messages,
          retention_days: values.retention_days,
          is_active: values.is_active,
          next_run_at: null,
          created_by: null,
        });
      }
      onOpenChange(false);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const handleDelete = async () => {
    if (schedule && confirm('Tem certeza que deseja excluir este agendamento?')) {
      await deleteSchedule.mutateAsync(schedule.id);
      onOpenChange(false);
    }
  };

  const isLoading = createSchedule.isPending || updateSchedule.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header fixo */}
        <DialogHeader className="px-5 pt-5 pb-4 shrink-0 border-b border-border">
          <DialogTitle>
            {isEditing ? 'Editar Agendamento' : 'Novo Agendamento de Backup'}
          </DialogTitle>
          <DialogDescription>
            Configure quando e como os backups automáticos devem ser executados
          </DialogDescription>
        </DialogHeader>

        {/* Conteúdo com scroll invisível */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: 'none' }}>
          <style>{`.backup-scroll::-webkit-scrollbar { display: none; }`}</style>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Agendamento</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Backup Diário" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequência</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a frequência" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">Diário</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {frequency === 'weekly' && (
                <FormField
                  control={form.control}
                  name="day_of_week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dia da Semana</FormLabel>
                      <Select 
                        onValueChange={(v) => field.onChange(parseInt(v))} 
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o dia" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">Domingo</SelectItem>
                          <SelectItem value="1">Segunda-feira</SelectItem>
                          <SelectItem value="2">Terça-feira</SelectItem>
                          <SelectItem value="3">Quarta-feira</SelectItem>
                          <SelectItem value="4">Quinta-feira</SelectItem>
                          <SelectItem value="5">Sexta-feira</SelectItem>
                          <SelectItem value="6">Sábado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {frequency === 'monthly' && (
                <FormField
                  control={form.control}
                  name="day_of_month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dia do Mês</FormLabel>
                      <Select 
                        onValueChange={(v) => field.onChange(parseInt(v))} 
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o dia" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[...Array(28)].map((_, i) => (
                            <SelectItem key={i + 1} value={(i + 1).toString()}>
                              Dia {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="time_of_day"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horário</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>
                      Recomendamos horários de baixo tráfego (ex: 03:00)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="include_media"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel className="text-sm">Incluir Mídias</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="include_messages"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel className="text-sm leading-tight">Incluir Mensagens</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="retention_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retenção: {field.value} dias</FormLabel>
                    <FormControl>
                      <Slider
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        min={7}
                        max={365}
                        step={1}
                      />
                    </FormControl>
                    <FormDescription>
                      Backups mais antigos serão automaticamente removidos
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Agendamento Ativo</FormLabel>
                      <FormDescription>
                        Ativar execução automática
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Footer dentro do form para submissão funcionar */}
              <div className="flex justify-end gap-2 pt-2 pb-1">
                {isEditing && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleDelete}
                    disabled={deleteSchedule.isPending}
                  >
                    {deleteSchedule.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isEditing ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
