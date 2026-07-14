import { useState, useEffect } from 'react';
import { 
  Mail, 
  Save, 
  Eye, 
  Code, 
  FileText, 
  RefreshCw,
  AlertCircle,
  Palette,
  Variable,
  Send,
  TestTube,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  useEmailTemplates, 
  useUpdateEmailTemplate,
  useSendTestEmail,
  EmailTemplate,
  SAMPLE_TEMPLATE_VALUES 
} from '@/hooks/useEmailTemplates';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useAuth } from '@/hooks/useAuth';

export default function AdminEmailTemplatesPage() {
  const { user } = useAuth();
  const { data: templates, isLoading } = useEmailTemplates();
  const { data: isAdmin } = useIsMasterAdmin();
  const updateTemplate = useUpdateEmailTemplate();
  const sendTestEmail = useSendTestEmail();
  
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedHtml, setEditedHtml] = useState('');
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [previewHtml, setPreviewHtml] = useState('');
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  
  // Test email state
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Check if user is admin
  // isAdmin already derived from useIsMasterAdmin()

  useEffect(() => {
    if (selectedTemplate) {
      setEditedSubject(selectedTemplate.subject);
      setEditedHtml(selectedTemplate.html_content);
      setEditedName(selectedTemplate.name);
      setEditedDescription(selectedTemplate.description || '');
      setIsActive(selectedTemplate.is_active);
      generatePreview(selectedTemplate.html_content);
    }
  }, [selectedTemplate]);

  // Pre-fill test email with user's email
  useEffect(() => {
    if (user?.email && !testEmail) {
      setTestEmail(user.email);
    }
  }, [user?.email, testEmail]);

  const generatePreview = (html: string) => {
    let preview = html;
    Object.entries(SAMPLE_TEMPLATE_VALUES).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      preview = preview.replace(regex, value);
    });
    setPreviewHtml(preview);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    
    await updateTemplate.mutateAsync({
      id: selectedTemplate.id,
      subject: editedSubject,
      html_content: editedHtml,
      name: editedName,
      description: editedDescription,
      is_active: isActive,
    });
  };

  const handleSendTestEmail = async () => {
    if (!selectedTemplate || !testEmail) return;
    
    await sendTestEmail.mutateAsync({
      template_key: selectedTemplate.template_key,
      test_email: testEmail,
    });
    
    setShowTestEmailModal(false);
  };

  const hasChanges = selectedTemplate && (
    editedSubject !== selectedTemplate.subject ||
    editedHtml !== selectedTemplate.html_content ||
    editedName !== selectedTemplate.name ||
    editedDescription !== (selectedTemplate.description || '') ||
    isActive !== selectedTemplate.is_active
  );

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'payment': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'account': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'marketing': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTemplateIcon = (key: string) => {
    if (key.includes('day1')) return '💳';
    if (key.includes('day3')) return '⏰';
    if (key.includes('day7')) return '⚠️';
    if (key.includes('suspended')) return '🚫';
    if (key.includes('confirmed')) return '✅';
    return '📧';
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Acesso restrito. Apenas admin_master pode gerenciar templates de email.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Templates de Email
          </h1>
          <p className="text-muted-foreground">
            Personalize os emails enviados automaticamente pela plataforma
          </p>
        </div>
      </div>

      {/* Info Alert */}
      <Alert>
        <Variable className="h-4 w-4" />
        <AlertDescription>
          Use variáveis como <code className="bg-muted px-1 rounded">{'{{user_name}}'}</code>, 
          <code className="bg-muted px-1 rounded ml-1">{'{{amount}}'}</code>, 
          <code className="bg-muted px-1 rounded ml-1">{'{{payment_url}}'}</code> para personalizar o conteúdo.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Template List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Templates</CardTitle>
            <CardDescription>Selecione para editar</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-350px)]">
              <div className="space-y-1 p-3">
                {templates?.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{getTemplateIcon(template.template_key)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{template.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={`text-xs ${getCategoryColor(template.category)}`}>
                            {template.category}
                          </Badge>
                          {!template.is_active && (
                            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500">
                              Inativo
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="lg:col-span-3">
          {selectedTemplate ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span className="text-xl">{getTemplateIcon(selectedTemplate.template_key)}</span>
                      {editedName || selectedTemplate.name}
                    </CardTitle>
                    <CardDescription>{selectedTemplate.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isActive}
                        onCheckedChange={setIsActive}
                        id="template-active"
                      />
                      <Label htmlFor="template-active" className="text-sm">
                        {isActive ? 'Ativo' : 'Inativo'}
                      </Label>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setShowTestEmailModal(true)}
                      className="gap-2"
                    >
                      <TestTube className="h-4 w-4" />
                      Testar
                    </Button>
                    <Button 
                      onClick={handleSave} 
                      disabled={!hasChanges || updateTemplate.isPending}
                      className="gap-2"
                    >
                      {updateTemplate.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Template</Label>
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Ex: Lembrete Dia 1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Assunto do Email</Label>
                    <Input
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      placeholder="Ex: 💳 Lembrete de Pagamento"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Descrição breve do template"
                  />
                </div>

                <Separator />

                {/* Variables Info */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Variable className="h-4 w-4" />
                    Variáveis Disponíveis
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {(selectedTemplate.variables as string[])?.map((variable) => (
                      <Badge 
                        key={variable} 
                        variant="secondary" 
                        className="font-mono text-xs cursor-pointer hover:bg-primary/20"
                        onClick={() => {
                          navigator.clipboard.writeText(`{{${variable}}}`);
                        }}
                      >
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Content Editor */}
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'code' | 'preview')}>
                  <TabsList>
                    <TabsTrigger value="code" className="gap-2">
                      <Code className="h-4 w-4" />
                      Código HTML
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="gap-2">
                      <Eye className="h-4 w-4" />
                      Preview
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="code" className="mt-4">
                    <Textarea
                      value={editedHtml}
                      onChange={(e) => {
                        setEditedHtml(e.target.value);
                        generatePreview(e.target.value);
                      }}
                      className="font-mono text-sm min-h-[400px]"
                      placeholder="Cole o HTML do email aqui..."
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="mt-4">
                    <div className="border rounded-lg bg-white overflow-hidden">
                      <div className="bg-muted px-4 py-2 border-b flex items-center gap-2">
                        <Palette className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Preview com dados de exemplo
                        </span>
                      </div>
                      <iframe
                        srcDoc={previewHtml}
                        className="w-full min-h-[400px] border-0"
                        title="Email Preview"
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                {hasChanges && (
                  <Alert className="bg-amber-500/10 border-amber-500/20">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-amber-700">
                      Você tem alterações não salvas
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-[500px]">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecione um template para editar</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Test Email Modal */}
      <Dialog open={showTestEmailModal} onOpenChange={setShowTestEmailModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5 text-primary" />
              Enviar Email de Teste
            </DialogTitle>
            <DialogDescription>
              O email será enviado com dados de exemplo para verificar o template antes de ativá-lo.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <span className="text-lg">{selectedTemplate && getTemplateIcon(selectedTemplate.template_key)}</span>
                <span className="font-medium">{selectedTemplate?.name}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="test-email">Email de destino</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="seu@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O email será enviado com o prefixo [TESTE] no assunto.
              </p>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-sm">
                Variáveis serão substituídas por valores de exemplo como "João Silva" e "R$ 29,90".
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTestEmailModal(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendTestEmail}
              disabled={!testEmail || sendTestEmail.isPending}
              className="gap-2"
            >
              {sendTestEmail.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar Teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
