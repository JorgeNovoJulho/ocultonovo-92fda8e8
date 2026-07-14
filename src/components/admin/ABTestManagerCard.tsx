/**
 * Gerenciador de Testes A/B
 * Interface completa para criar, visualizar e gerenciar testes A/B
 */
import { useState } from "react";
import { 
  FlaskConical, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  BarChart3,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useABTests, useCreateABTest, useUpdateABTest, useABTestStats } from "@/hooks/useABTest";
import { toast } from "@/hooks/use-toast";

interface NewTestForm {
  name: string;
  description: string;
  test_type: string;
  variant_a: string;
  variant_b: string;
  traffic_split: number;
}

const defaultForm: NewTestForm = {
  name: '',
  description: '',
  test_type: 'pricing',
  variant_a: '',
  variant_b: '',
  traffic_split: 50,
};

export function ABTestManagerCard() {
  const [showNewTestDialog, setShowNewTestDialog] = useState(false);
  const [newTestForm, setNewTestForm] = useState<NewTestForm>(defaultForm);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);

  const { data: tests, isLoading } = useABTests();
  const createTest = useCreateABTest();
  const updateTest = useUpdateABTest();
  const { data: stats } = useABTestStats();

  const handleCreateTest = async () => {
    if (!newTestForm.name || !newTestForm.variant_a || !newTestForm.variant_b) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome e variantes do teste.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createTest.mutateAsync({
        name: newTestForm.name,
        description: newTestForm.description,
        test_type: newTestForm.test_type,
        variant_a_value: newTestForm.variant_a,
        variant_b_value: newTestForm.variant_b,
        traffic_split: newTestForm.traffic_split,
      });

      setShowNewTestDialog(false);
      setNewTestForm(defaultForm);
      toast({
        title: "Teste criado",
        description: "O teste A/B foi criado com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao criar teste",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    }
  };

  const handleToggleTest = async (testId: string, isActive: boolean) => {
    try {
      await updateTest.mutateAsync({ 
        id: testId, 
        is_active: !isActive 
      });
      toast({
        title: isActive ? "Teste pausado" : "Teste ativado",
        description: isActive 
          ? "O teste foi pausado com sucesso."
          : "O teste está agora ativo.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar teste",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    }
  };

  const getTestTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      pricing: 'Preço',
      copy: 'Texto/Copy',
      layout: 'Layout',
      feature: 'Funcionalidade',
    };
    return labels[type] || type;
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-purple-500" />
              Testes A/B
            </CardTitle>
            <CardDescription>
              Experimentos para otimização de conversão
            </CardDescription>
          </div>
          <Button onClick={() => setShowNewTestDialog(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Teste
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : tests && tests.length > 0 ? (
          <div className="space-y-3">
            {/* Estatísticas resumidas */}
            {stats && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-500">{stats.activeTests}</p>
                  <p className="text-xs text-muted-foreground">Testes Ativos</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-2xl font-bold">{stats.totalAssignments}</p>
                  <p className="text-xs text-muted-foreground">Usuários Testados</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-500">{tests.length}</p>
                  <p className="text-xs text-muted-foreground">Total de Testes</p>
                </div>
              </div>
            )}

            {/* Lista de testes */}
            {tests.map((test: any) => {
              // Adaptar campos do banco para o formato esperado
              const testName = test.test_name || test.name;
              const variantAValue = typeof test.variant_a === 'object' ? test.variant_a?.value : test.variant_a;
              const variantBValue = typeof test.variant_b === 'object' ? test.variant_b?.value : test.variant_b;
              const testType = typeof test.variant_a === 'object' ? test.variant_a?.type : 'pricing';
              const trafficSplit = 100 - (test.split_percentage || 50);

              return (
              <Collapsible
                key={test.id}
                open={expandedTest === test.id}
                onOpenChange={(open) => setExpandedTest(open ? test.id : null)}
              >
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${test.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                        <div>
                          <p className="font-medium">{testName}</p>
                          <p className="text-xs text-muted-foreground">
                            {getTestTypeLabel(testType)} • {trafficSplit}% / {100 - trafficSplit}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={test.is_active ? 'default' : 'secondary'}>
                          {test.is_active ? 'Ativo' : 'Pausado'}
                        </Badge>
                        {expandedTest === test.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="p-4 pt-0 space-y-4 border-t border-border/30">
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                          <p className="text-xs text-blue-400 font-medium mb-1">Variante A ({trafficSplit}%)</p>
                          <p className="font-mono text-sm">{variantAValue}</p>
                        </div>
                        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                          <p className="text-xs text-purple-400 font-medium mb-1">Variante B ({100 - trafficSplit}%)</p>
                          <p className="font-mono text-sm">{variantBValue}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <BarChart3 className="h-3 w-3" />
                          Criado em: {new Date(test.created_at).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleTest(test.id, test.is_active)}
                            disabled={updateTest.isPending}
                          >
                            {test.is_active ? (
                              <>
                                <Pause className="h-3 w-3 mr-1" />
                                Pausar
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" />
                                Ativar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              Nenhum teste A/B configurado
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Crie um teste para experimentar variações
            </p>
            <Button 
              onClick={() => setShowNewTestDialog(true)} 
              variant="outline" 
              size="sm" 
              className="mt-4 gap-2"
            >
              <Plus className="h-4 w-4" />
              Criar Primeiro Teste
            </Button>
          </div>
        )}
      </CardContent>

      {/* Dialog para novo teste */}
      <Dialog open={showNewTestDialog} onOpenChange={setShowNewTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Teste A/B</DialogTitle>
            <DialogDescription>
              Configure um novo experimento para otimização
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Teste</Label>
              <Input
                placeholder="Ex: Teste de preço do plano Premium"
                value={newTestForm.name}
                onChange={(e) => setNewTestForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Descrição do objetivo do teste"
                value={newTestForm.description}
                onChange={(e) => setNewTestForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Teste</Label>
              <Select
                value={newTestForm.test_type}
                onValueChange={(value) => setNewTestForm(prev => ({ ...prev, test_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pricing">Preço</SelectItem>
                  <SelectItem value="copy">Texto/Copy</SelectItem>
                  <SelectItem value="layout">Layout</SelectItem>
                  <SelectItem value="feature">Funcionalidade</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Variante A (Controle)</Label>
                <Input
                  placeholder="Ex: R$ 29,90"
                  value={newTestForm.variant_a}
                  onChange={(e) => setNewTestForm(prev => ({ ...prev, variant_a: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Variante B (Teste)</Label>
                <Input
                  placeholder="Ex: R$ 24,90"
                  value={newTestForm.variant_b}
                  onChange={(e) => setNewTestForm(prev => ({ ...prev, variant_b: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Divisão de Tráfego (% para Variante A)</Label>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  min="10"
                  max="90"
                  value={newTestForm.traffic_split}
                  onChange={(e) => setNewTestForm(prev => ({ ...prev, traffic_split: parseInt(e.target.value) || 50 }))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  A: {newTestForm.traffic_split}% | B: {100 - newTestForm.traffic_split}%
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTestDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTest} disabled={createTest.isPending}>
              {createTest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
