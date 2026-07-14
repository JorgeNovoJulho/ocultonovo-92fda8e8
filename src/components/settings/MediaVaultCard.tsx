import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVaultItems, useAddVaultItem, useDeleteVaultItem, VaultItem } from "@/hooks/useMediaVault";
import { Lock, Unlock, Upload, Trash2, Eye, EyeOff, Image, Video, File, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function MediaVaultCard() {
  const { data: vaultItems, isLoading } = useVaultItems();
  const addVaultItem = useAddVaultItem();
  const deleteVaultItem = useDeleteVaultItem();
  
  const [deleteItem, setDeleteItem] = useState<VaultItem | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addVaultItem.mutate({ file });
      e.target.value = '';
    }
  };

  const handleDelete = () => {
    if (deleteItem) {
      deleteVaultItem.mutate(deleteItem);
      setDeleteItem(null);
    }
  };

  const getFileIcon = (type: string) => {
    if (type === 'image') return <Image className="h-4 w-4" />;
    if (type === 'video') return <Video className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Media Vault
            <Badge variant="secondary" className="text-xs">
              {vaultItems?.length || 0} arquivos
            </Badge>
          </CardTitle>
          <CardDescription>
            Armazenamento seguro e criptografado para suas mídias sensíveis
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Upload Area */}
          <div className="relative">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={addVaultItem.isPending}
            />
            <div className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
              addVaultItem.isPending 
                ? "border-primary/50 bg-primary/5" 
                : "border-border/50 hover:border-primary/30 hover:bg-primary/5"
            )}>
              {addVaultItem.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Enviando para o vault...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Arraste ou clique para adicionar</p>
                  <p className="text-xs text-muted-foreground">Imagens e vídeos até 100MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Vault Items */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : vaultItems && vaultItems.length > 0 ? (
            <ScrollArea className="h-[250px]">
              <div className="space-y-2">
                {vaultItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        {getFileIcon(item.file_type)}
                      </div>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[150px]">
                          {item.file_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(item.file_size_bytes)} • {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs gap-1">
                        {item.is_locked ? (
                          <>
                            <Lock className="h-3 w-3" />
                            Bloqueado
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3 w-3" />
                            Seguro
                          </>
                        )}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteItem(item)}
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8">
              <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">
                Seu vault está vazio. Adicione arquivos para mantê-los seguros.
              </p>
            </div>
          )}

          {/* Storage Info */}
          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/30">
            🔒 Todos os arquivos são criptografados e acessíveis apenas por você
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover do Vault?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo será permanentemente removido do seu vault seguro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteVaultItem.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
