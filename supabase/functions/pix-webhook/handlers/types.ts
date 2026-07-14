// Tipos compartilhados entre handlers do pix-webhook canônico ASAAS.
export interface SplitResult {
  gross: number;
  tax: number;
  base: number;
  platform: number;
  affiliate: number;
  creator: number;
  flow_type: string;
  affiliate_id?: string | null;
  affiliate_applied?: boolean;
  rejection_reason?: string | null;
}

export interface PixWebhookPayload {
  // Asaas event id (top-level)
  id?: string;
  // Mercado Pago
  action?: string;
  data?: { id: string };
  // PagSeguro
  pix?: Array<{ endToEndId: string; txid: string; valor: string }>;
  // Asaas
  event?: string;
  payment?: { id: string; status: string; value: number; subscription?: string };
  subscription?: { id: string; status?: string; customer?: string };
  // EfiBank
  pixList?: Array<{ txid: string; valor: string; status: string }>;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
