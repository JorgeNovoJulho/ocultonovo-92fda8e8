import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Plus,
  Ticket,
  DollarSign,
  TrendingUp,
  Power,
  Trash2,
  Copy,
  CheckCircle2,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePartnerStore, Partner } from "@/store/usePartnerStore";
import { toast } from "@/hooks/use-toast";

export default function AdminPartnersPage() {
  const { partners, addPartner, togglePartnerStatus, removePartner } = usePartnerStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    pixKey: "",
    code: "",
    discount: "10",
    commission: "20",
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const totalBalance = partners.reduce((acc, p) => acc + p.balance, 0);
  const totalSales = partners.reduce((acc, p) => acc + p.totalSales, 0);
  const activePartners = partners.filter((p) => p.status === "active").length;

  const handleAddPartner = () => {
    if (!formData.name || !formData.pixKey || !formData.code) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    // Check if code already exists
    const codeExists = partners.some(
      (p) => p.code.toUpperCase() === formData.code.toUpperCase()
    );
    if (codeExists) {
      toast({
        title: "Código já existe",
        description: "Escolha outro código para o cupom",
        variant: "destructive",
      });
      return;
    }

    addPartner({
      name: formData.name,
      pixKey: formData.pixKey,
      code: formData.code.toUpperCase(),
      discount: parseInt(formData.discount) / 100,
      commission: parseInt(formData.commission) / 100,
      status: "active",
    });

    toast({
      title: "Parceiro adicionado!",
      description: `Código ${formData.code.toUpperCase()} criado com sucesso`,
    });

    setFormData({ name: "", pixKey: "", code: "", discount: "10", commission: "20" });
    setShowAddModal(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">OCULTO Partners</h1>
              <p className="text-muted-foreground">Gerencie afiliados e cupons</p>
            </div>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-primary to-secondary text-primary-foreground"
          >
            <Plus className="h-4 w-4 mr-2" />
            Registrar Parceiro
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              Parceiros Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{activePartners}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Ticket className="h-3 w-3" />
              Cupons Usados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{totalSales}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[hsl(142,76%,36%)]/10 to-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Comissões Geradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">
              {formatCurrency(totalBalance)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Conversão Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">4.2%</p>
          </CardContent>
        </Card>
      </div>

      {/* Partners Table */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Lista de Parceiros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30">
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="hidden md:table-cell">Desconto</TableHead>
                  <TableHead className="hidden md:table-cell">Comissão</TableHead>
                  <TableHead>Vendas</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id} className="border-border/20">
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{partner.name}</p>
                        <p className="text-xs text-muted-foreground hidden md:block">
                          {partner.pixKey}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => copyCode(partner.code)}
                        className="group flex items-center gap-1.5 px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <Ticket className="h-3 w-3 text-primary" />
                        <span className="font-mono font-semibold text-primary">
                          {partner.code}
                        </span>
                        {copiedCode === partner.code ? (
                          <CheckCircle2 className="h-3 w-3 text-[hsl(142,76%,36%)]" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className="font-mono">
                        {(partner.discount * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge className="bg-primary/10 text-primary font-mono">
                        {(partner.commission * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{partner.totalSales}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-[hsl(142,76%,36%)]">
                        {formatCurrency(partner.balance)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          partner.status === "active"
                            ? "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)]"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {partner.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => togglePartnerStatus(partner.id)}
                          className={cn(
                            "h-8 w-8",
                            partner.status === "active"
                              ? "text-[hsl(142,76%,36%)] hover:text-[hsl(142,76%,36%)]"
                              : "text-muted-foreground"
                          )}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePartner(partner.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Partner Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Registrar Novo Parceiro
            </DialogTitle>
            <DialogDescription>
              Crie um cupom de desconto para um influenciador ou afiliado externo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="partner-name">Nome do Parceiro *</Label>
              <Input
                id="partner-name"
                placeholder="Ex: Canal do João"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-muted/30 border-border/50"
              />
            </div>

            {/* Pix Key */}
            <div className="space-y-2">
              <Label htmlFor="pix-key">Chave Pix (para pagamentos) *</Label>
              <Input
                id="pix-key"
                placeholder="CPF, Email ou Telefone"
                value={formData.pixKey}
                onChange={(e) => setFormData({ ...formData, pixKey: e.target.value })}
                className="bg-muted/30 border-border/50"
              />
            </div>

            {/* Coupon Code */}
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Código do Cupom *</Label>
              <div className="relative">
                <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                <Input
                  id="coupon-code"
                  placeholder="Ex: JOAO20"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  className="bg-muted/30 border-border/50 pl-10 font-mono uppercase"
                />
              </div>
            </div>

            {/* Discount & Commission */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount">Desconto para Cliente (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="discount"
                    type="number"
                    min="5"
                    max="50"
                    value={formData.discount}
                    onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                    className="bg-muted/30 border-border/50 pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commission">Comissão Parceiro (%)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(142,76%,36%)]" />
                  <Input
                    id="commission"
                    type="number"
                    min="5"
                    max="50"
                    value={formData.commission}
                    onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                    className="bg-muted/30 border-border/50 pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            {formData.code && (
              <div className="p-4 rounded-lg bg-muted/20 border border-dashed border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Preview do cupom:</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
                    <Ticket className="h-4 w-4 text-primary" />
                    <span className="font-mono font-bold text-primary">{formData.code}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-[hsl(142,76%,36%)] font-medium">
                      -{formData.discount}% off
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowAddModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddPartner}
              className="flex-1 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Parceiro
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
