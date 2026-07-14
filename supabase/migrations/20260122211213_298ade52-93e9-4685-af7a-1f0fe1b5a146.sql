-- Adicionar campo para marcar documentos que precisam de revisão manual
ALTER TABLE public.couple_verification_docs 
ADD COLUMN IF NOT EXISTS needs_admin_review BOOLEAN DEFAULT true;

-- Criar índice para buscar documentos pendentes de revisão rapidamente
CREATE INDEX IF NOT EXISTS idx_couple_verification_needs_review 
ON public.couple_verification_docs (needs_admin_review, status);

-- Função para notificar usuário quando documento é rejeitado
CREATE OR REPLACE FUNCTION public.notify_verification_rejection()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status mudou para 'rejected'
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    -- Buscar o user_id através do profile_id
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT 
      p.user_id,
      'verification_rejected',
      '⚠️ Documento Rejeitado',
      COALESCE('Seu documento foi rejeitado: ' || NEW.rejection_reason || '. Por favor, envie novamente.', 'Seu documento foi rejeitado. Por favor, envie novamente.'),
      jsonb_build_object('doc_id', NEW.id, 'reason', NEW.rejection_reason, 'document_type', NEW.document_type, 'partner_number', NEW.partner_number)
    FROM public.profiles p
    WHERE p.id = NEW.profile_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para notificação automática
DROP TRIGGER IF EXISTS trigger_notify_verification_rejection ON public.couple_verification_docs;
CREATE TRIGGER trigger_notify_verification_rejection
  AFTER UPDATE ON public.couple_verification_docs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_verification_rejection();