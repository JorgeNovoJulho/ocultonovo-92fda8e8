/**
 * Utilitários para exportação de dados em CSV/Excel
 */

export interface ExportColumn {
  key: string;
  label: string;
  formatter?: (value: any) => string;
}

/**
 * Exporta dados para formato CSV
 */
export function exportToCSV(
  data: any[], 
  filename: string, 
  columns: ExportColumn[]
): void {
  if (!data || data.length === 0) {
    console.warn('Nenhum dado para exportar');
    return;
  }

  const headers = columns.map(c => `"${c.label}"`).join(',');
  
  const rows = data.map(row => 
    columns.map(c => {
      const value = row[c.key];
      const formatted = c.formatter ? c.formatter(value) : formatValue(value);
      // Escape double quotes and wrap in quotes
      return `"${String(formatted).replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  const csv = [headers, ...rows].join('\n');
  
  // BOM for UTF-8 compatibility with Excel
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${getDateSuffix()}.csv`);
}

/**
 * Exporta dados para formato Excel (usando TSV com extensão .xls)
 */
export function exportToExcel(
  data: any[], 
  filename: string, 
  columns: ExportColumn[]
): void {
  if (!data || data.length === 0) {
    console.warn('Nenhum dado para exportar');
    return;
  }

  const headers = columns.map(c => c.label).join('\t');
  
  const rows = data.map(row => 
    columns.map(c => {
      const value = row[c.key];
      const formatted = c.formatter ? c.formatter(value) : formatValue(value);
      // Remove tabs and newlines for Excel compatibility
      return String(formatted).replace(/[\t\n\r]/g, ' ');
    }).join('\t')
  );
  
  const excel = [headers, ...rows].join('\n');
  
  const blob = new Blob(['\ufeff' + excel], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${getDateSuffix()}.xls`);
}

/**
 * Formata valores para exportação
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }
  
  if (value instanceof Date) {
    return value.toLocaleDateString('pt-BR');
  }
  
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  
  return String(value);
}

/**
 * Gera sufixo de data para nome do arquivo
 */
function getDateSuffix(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Faz download de um blob como arquivo
 */
function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Colunas padrão para exportação de usuários
 */
export const userBillingExportColumns: ExportColumn[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'Email' },
  { key: 'username', label: 'Username', formatter: (v) => v ? `@${v}` : '' },
  { 
    key: 'plan_type', 
    label: 'Plano',
    formatter: (v) => {
      const plans: Record<string, string> = { free: 'Free', premium: 'Premium', vip: 'VIP' };
      return plans[v] || v || 'Free';
    }
  },
  { 
    key: 'payment_status', 
    label: 'Status Pagamento',
    formatter: (v) => {
      const statuses: Record<string, string> = { active: 'Ativo', overdue: 'Em Atraso', suspended: 'Suspenso' };
      return statuses[v] || v || 'Ativo';
    }
  },
  { 
    key: 'payment_due_date', 
    label: 'Vencimento',
    formatter: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '-'
  },
  { 
    key: 'balance', 
    label: 'Saldo (R$)',
    formatter: (v) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  },
  { key: 'is_creator', label: 'Criador' },
  { key: 'is_verified', label: 'Verificado' },
  { 
    key: 'created_at', 
    label: 'Data Cadastro',
    formatter: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '-'
  },
];

/**
 * Colunas para exportação de métricas de receita
 */
export const revenueMetricsExportColumns: ExportColumn[] = [
  { key: 'metric', label: 'Métrica' },
  { key: 'value', label: 'Valor' },
  { key: 'description', label: 'Descrição' },
];
