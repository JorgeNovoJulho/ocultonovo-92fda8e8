import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  Eye, 
  Search,
  ArrowLeft,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import {
  useMyInvoices,
  useDownloadInvoice,
  useViewInvoice,
} from '@/hooks/useInvoiceSystem';

export default function MyInvoicesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: invoices, isLoading } = useMyInvoices();
  const downloadInvoice = useDownloadInvoice();
  const viewInvoice = useViewInvoice();

  const filteredInvoices = invoices?.filter(inv => 
    inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-dvh bg-background">
      <div className="container max-w-4xl py-8">
        <div className="mb-6">
          <Link to="/settings" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Link>
          <h1 className="text-3xl font-bold">Minhas Faturas</h1>
          <p className="text-muted-foreground">Histórico de faturas e comprovantes</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Faturas
                </CardTitle>
                <CardDescription>
                  {invoices?.length || 0} faturas encontradas
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar fatura..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                Carregando faturas...
              </div>
            ) : filteredInvoices?.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhuma fatura encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Suas faturas aparecerão aqui após realizar pagamentos
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices?.map((invoice) => (
                  <div 
                    key={invoice.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{invoice.invoice_number}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(invoice.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        {invoice.status === 'generated' ? 'Disponível' : invoice.status}
                      </Badge>
                      
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => viewInvoice.mutate(invoice.id)}
                          disabled={viewInvoice.isPending}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => downloadInvoice.mutate(invoice.id)}
                          disabled={downloadInvoice.isPending}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Baixar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Sobre suas faturas</h3>
                <p className="text-sm text-muted-foreground">
                  Suas faturas são geradas automaticamente após cada transação confirmada. 
                  Você pode visualizar ou baixar a qualquer momento para fins de comprovação 
                  ou declaração fiscal.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
