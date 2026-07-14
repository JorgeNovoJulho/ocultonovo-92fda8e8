import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceRequest {
  transaction_id: string;
}

interface TransactionData {
  id: string;
  amount: number;
  type: string;
  status: string;
  description: string;
  created_at: string;
  external_id?: string;
  provider?: string;
  profiles: {
    id: string;
    name: string;
    username?: string;
  };
}

// Gerar HTML da fatura
function generateInvoiceHtml(
  transaction: TransactionData,
  invoiceNumber: string,
  platformName: string = 'OCULTO'
): string {
  const date = new Date(transaction.created_at);
  const formattedDate = date.toLocaleDateString('pt-BR');
  const amount = transaction.amount.toFixed(2).replace('.', ',');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fatura #${invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Arial, sans-serif; 
      background: #f5f5f5;
      padding: 40px;
      color: #333;
    }
    .invoice {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
      color: white;
      padding: 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .logo { font-size: 32px; font-weight: bold; }
    .invoice-info { text-align: right; }
    .invoice-number { font-size: 14px; opacity: 0.9; }
    .invoice-date { font-size: 20px; margin-top: 4px; }
    .content { padding: 40px; }
    .section { margin-bottom: 30px; }
    .section-title { 
      font-size: 12px; 
      text-transform: uppercase; 
      color: #888;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    .section-value { font-size: 16px; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    .items-table th, .items-table td {
      padding: 16px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    .items-table th {
      background: #f9f9f9;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
    }
    .items-table td { font-size: 15px; }
    .text-right { text-align: right; }
    .total-row {
      background: #f9f9f9;
      font-weight: bold;
    }
    .total-row td { 
      font-size: 18px; 
      color: #7c3aed;
    }
    .footer {
      background: #f9f9f9;
      padding: 30px 40px;
      text-align: center;
      font-size: 13px;
      color: #888;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-completed { background: #d1fae5; color: #059669; }
    .status-pending { background: #fef3c7; color: #d97706; }
    .status-failed { background: #fee2e2; color: #dc2626; }
    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, #ddd, transparent);
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <div class="logo">${platformName}</div>
        <div style="font-size: 14px; opacity: 0.9; margin-top: 4px;">Plataforma de Conteúdo Premium</div>
      </div>
      <div class="invoice-info">
        <div class="invoice-number">Fatura #${invoiceNumber}</div>
        <div class="invoice-date">${formattedDate}</div>
      </div>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="section-title">Cliente</div>
        <div class="section-value">${transaction.profiles.name}</div>
        ${transaction.profiles.username ? `<div style="color: #888; font-size: 14px;">@${transaction.profiles.username}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="section">
        <div class="section-title">Detalhes do Pagamento</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Método</th>
              <th>Status</th>
              <th class="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${transaction.description}</td>
              <td>${getProviderLabel(transaction.provider)}</td>
              <td><span class="status-badge status-${transaction.status}">${getStatusLabel(transaction.status)}</span></td>
              <td class="text-right">R$ ${amount}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3">Total</td>
              <td class="text-right">R$ ${amount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="divider"></div>

      <div class="section" style="display: flex; gap: 40px;">
        <div>
          <div class="section-title">ID da Transação</div>
          <div class="section-value" style="font-family: monospace; font-size: 13px;">${transaction.id}</div>
        </div>
        ${transaction.external_id ? `
        <div>
          <div class="section-title">ID Externo</div>
          <div class="section-value" style="font-family: monospace; font-size: 13px;">${transaction.external_id}</div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="footer">
      <p>Esta é uma fatura gerada automaticamente. Para suporte, entre em contato através do app.</p>
      <p style="margin-top: 8px;">${platformName} © ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>
`;
}

function getProviderLabel(provider?: string): string {
  const labels: Record<string, string> = {
    asaas: 'ASAAS',
    asaas_card: 'Cartão de Crédito (ASAAS)',
    asaas_pix: 'PIX (ASAAS)',
    pix: 'PIX',
    card: 'Cartão de Crédito',
    platform: 'Plataforma',
  };
  return labels[provider || ''] || 'Pagamento';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'Pago',
    pending: 'Pendente',
    failed: 'Falhou',
    refunded: 'Reembolsado',
  };
  return labels[status] || status;
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const body: InvoiceRequest = await req.json();
    const { transaction_id } = body;

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: 'transaction_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Buscar transação
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select(`
        id,
        amount,
        type,
        status,
        description,
        created_at,
        external_id,
        provider,
        profiles!transactions_user_id_fkey (
          id,
          name,
          username
        )
      `)
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      return new Response(
        JSON.stringify({ error: 'Transaction not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Verificar se usuário tem acesso à transação
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Handle profiles array from join
    const txProfiles = Array.isArray(transaction.profiles) 
      ? transaction.profiles[0] 
      : transaction.profiles;

    const isOwner = txProfiles?.id === profile?.id;
    
    // Verificar se é admin
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'admin_master'])
      .single();

    if (!isOwner && !adminRole) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Gerar número da fatura
    const invoiceNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${transaction_id.slice(-6).toUpperCase()}`;

    // Buscar nome da plataforma
    const { data: platformSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'platform_name')
      .single();

    const platformName = platformSetting?.value || 'OCULTO';

    // Preparar dados da transação
    const transactionData: TransactionData = {
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      status: transaction.status,
      description: transaction.description,
      created_at: transaction.created_at,
      external_id: transaction.external_id,
      provider: transaction.provider,
      profiles: txProfiles || { id: '', name: 'Usuário' },
    };

    // Gerar HTML da fatura
    const invoiceHtml = generateInvoiceHtml(
      transactionData,
      invoiceNumber,
      platformName
    );

    // Registrar fatura gerada
    await supabase.from('generated_invoices').insert({
      transaction_id,
      invoice_number: invoiceNumber,
      generated_by: user.id,
      html_content: invoiceHtml,
    });

    return new Response(invoiceHtml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Invoice PDF] Error:', error);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
