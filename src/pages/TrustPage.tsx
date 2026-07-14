import { ArrowLeft, Shield, Lock, Eye, FileCheck, Server, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

/**
 * /trust — App-owned trust & privacy overview page.
 * Conteúdo mantido por OCULTO; não constitui certificação independente.
 */
export default function TrustPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-4xl py-3 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <Logo className="h-7 w-auto" />
          <h1 className="ml-2 text-lg font-semibold">Central de Confiança</h1>
        </div>
      </header>

      <main className="container max-w-4xl py-10 space-y-10">
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" />
            <h2 className="text-2xl font-semibold">Segurança & Privacidade na OCULTO</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Esta página é mantida pela equipe OCULTO para responder dúvidas comuns sobre segurança, privacidade
            e tratamento de dados na plataforma. As informações descrevem controles atualmente habilitados no
            produto e práticas operacionais da empresa. <strong>Não constitui auditoria independente nem
            certificação emitida pela infraestrutura de hospedagem.</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Última revisão: 18 de Junho de 2026.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card icon={Lock} title="Acesso & Autenticação">
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Login por e-mail/senha e Google OAuth.</li>
              <li>Senhas armazenadas com hash seguro pela camada de autenticação.</li>
              <li>Sessão única por usuário com auto-logout por inatividade (5 min).</li>
              <li>Verificação de idade (+18) e KYC obrigatório para criadores.</li>
            </ul>
          </Card>

          <Card icon={Eye} title="Dados Pessoais (LGPD)">
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Coleta limitada ao necessário para operar o serviço.</li>
              <li>Dados sensíveis (CPF, PIX, documentos KYC) ficam restritos ao próprio titular e à equipe administrativa autorizada.</li>
              <li>Direitos do titular (acesso, correção, exclusão) atendidos via suporte interno.</li>
              <li>PII em logs de pagamento é mascarada automaticamente.</li>
            </ul>
          </Card>

          <Card icon={Server} title="Infraestrutura">
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Banco de dados PostgreSQL gerenciado, com Row Level Security (RLS) ativo em todas as tabelas públicas.</li>
              <li>Tráfego cliente↔servidor sempre via HTTPS/TLS.</li>
              <li>Armazenamento de mídia em buckets segmentados por sensibilidade (privado / público / KYC).</li>
              <li>Backups automatizados e auditoria de acessos administrativos.</li>
            </ul>
          </Card>

          <Card icon={FileCheck} title="Conteúdo & Moderação">
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Plataforma adulta restrita a maiores de 18 anos.</li>
              <li>Equipe de moderação 24/7 com filas de denúncia priorizadas.</li>
              <li>Bloqueio, shadowban e remoção de conteúdo sob política pública.</li>
              <li>Mensagens diretas com criptografia ponta-a-ponta (AES-GCM 256-bit) em chats privados.</li>
            </ul>
          </Card>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Subprocessadores</h3>
          <p className="text-sm text-muted-foreground">
            OCULTO utiliza fornecedores terceirizados para infraestrutura, pagamentos e comunicação. A lista
            completa e atualizada pode ser solicitada via canal de suporte abaixo.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Compliance & Limitações</h3>
          <p className="text-sm text-muted-foreground">
            OCULTO opera em conformidade com a LGPD (Lei nº 13.709/2018). Não declaramos certificações como SOC 2,
            ISO 27001 ou PCI-DSS — pagamentos são processados por parceiros licenciados que mantêm suas próprias
            certificações. Para detalhes contratuais ou DPA, entre em contato.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Contato de Segurança
          </h3>
          <p className="text-sm text-muted-foreground">
            Reporte vulnerabilidades, incidentes ou solicitações de privacidade através da Central de Ajuda
            interna (menu &gt; Suporte) ou pelos canais oficiais publicados em nossas{" "}
            <Link to="/legal/politica-de-privacidade" className="text-primary underline">
              Políticas
            </Link>.
          </p>
        </section>

        <footer className="pt-6 border-t border-border/40 text-xs text-muted-foreground">
          Conteúdo editorial mantido pela equipe OCULTO. Para correções, abra um ticket de suporte.
        </footer>
      </main>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
