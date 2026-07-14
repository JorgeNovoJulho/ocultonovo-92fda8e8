import { ArrowLeft, FileText, Shield, Scale, AlertTriangle, Phone } from "lucide-react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

interface LegalContent {
  title: string;
  icon: React.ElementType;
  lastUpdated: string;
  content: React.ReactNode;
}

const legalContent: Record<string, LegalContent> = {
  "termos-de-uso": {
    title: "Termos de Uso",
    icon: FileText,
    lastUpdated: "5 de Maio de 2026 (rev. 4)",
    content: (
      <div className="space-y-6 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Aceitação dos Termos</h2>
          <p>
            Ao acessar ou utilizar a plataforma OCULTO, o usuário declara que leu, compreendeu e concorda
            integralmente com estes Termos de Uso e com a Política de Privacidade.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Elegibilidade e Verificação de Idade (KYC)</h2>
          <p>O uso da plataforma é permitido exclusivamente a maiores de 18 (dezoito) anos.</p>
          <p className="mt-2">O usuário declara, sob responsabilidade civil e penal, que:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>possui idade mínima legal;</li>
            <li>fornece dados verídicos;</li>
            <li>concorda com a verificação de identidade (KYC), incluindo envio de documentos oficiais e biometria facial.</li>
          </ul>
          <p className="mt-2">A plataforma poderá:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>exigir verificação a qualquer momento;</li>
            <li>suspender ou bloquear contas não verificadas;</li>
            <li>condicionar o uso de funcionalidades financeiras à aprovação do KYC.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Conta do Usuário</h2>
          <p>O usuário é responsável por:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>manter a segurança de suas credenciais;</li>
            <li>todas as atividades realizadas em sua conta.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Uso da Plataforma</h2>
          <p>O uso deve ser legal e conforme estes termos. É proibido:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>fraudes;</li>
            <li>uso indevido;</li>
            <li>exploração do sistema;</li>
            <li>automação não autorizada.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Conteúdo Adulto</h2>
          <p>A plataforma permite conteúdo adulto, desde que:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>legal;</li>
            <li>consensual;</li>
            <li>envolvendo apenas maiores de idade.</li>
          </ul>
        </section>

        <section id="garantia-anonimato" className="scroll-mt-24 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h2 className="text-xl font-semibold text-primary mb-3">5.1. Garantia de Anonimato e Proteção de Dados Reais</h2>
          <p>
            A OCULTO opera sob o princípio da <strong className="text-foreground">privacidade absoluta da identidade real</strong>.
            Os dados reais fornecidos durante o cadastro — incluindo, sem limitação,{" "}
            <strong className="text-foreground">nome civil completo, fotos de documentos, selfies de verificação (KYC),
            CPF/RG, endereço residencial, e-mail e telefone</strong> — são tratados como dados sensíveis e{" "}
            <strong className="text-foreground">JAMAIS são expostos</strong> a outros usuários da plataforma, em nenhuma circunstância.
          </p>
          <p className="mt-2">Esses dados são utilizados <strong className="text-foreground">exclusivamente</strong> para:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>cumprir obrigações legais (LGPD — Lei 13.709/2018, Marco Civil da Internet, ECA, normas antifraude e antilavagem);</li>
            <li>verificar maioridade (KYC) e prevenir crimes;</li>
            <li>processar pagamentos e atender requisições judiciais formais;</li>
            <li>responder a auditorias regulatórias.</li>
          </ul>
          <p className="mt-2">
            Outros usuários enxergam apenas o <strong className="text-foreground">nome de usuário (apelido)</strong>,{" "}
            <strong className="text-foreground">avatar escolhido</strong> e o conteúdo público que o próprio usuário decidir compartilhar.
            Nenhum dado real do cadastro é exibido em perfis, mensagens, buscas ou qualquer área pública.
          </p>
          <p className="mt-2">
            Esta garantia é <strong className="text-foreground">contratual e técnica</strong>: nossos sistemas de banco de dados utilizam
            Row-Level Security (RLS), criptografia em repouso e em trânsito, e regras de acesso que impedem que outros usuários consultem
            esses campos, mesmo via API.
          </p>
        </section>

        <section id="clausula-6" className="scroll-mt-24 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="text-xl font-semibold text-destructive mb-3">6. Conteúdo Proibido (CRÍTICO)</h2>
          <p>É <strong className="text-foreground">estritamente proibido</strong>, sem exceção:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>qualquer conteúdo envolvendo menores de 18 anos (CSAM), inclusive simulações, deepfakes, desenhos ou personagens com aparência infantil;</li>
            <li>conteúdo sexual ou íntimo sem consentimento expresso e verificável de <strong className="text-foreground">todos</strong> os envolvidos (ex.: nudes vazados, gravações ocultas, “revenge porn”);</li>
            <li>violência real ou simulada sem consentimento, incluindo agressão, tortura, mutilação ou estupro encenado sem aviso de fantasia consensual;</li>
            <li>exploração, coerção, chantagem (sextorsão) ou abuso de pessoas em situação de vulnerabilidade;</li>
            <li>tráfico humano, aliciamento, prostituição forçada ou anúncio de serviços com indícios de exploração;</li>
            <li>zoofilia, necrofilia, incesto entre familiares biológicos ou qualquer prática vedada por lei;</li>
            <li>discurso de ódio, racismo, LGBTfobia, apologia ao crime, terrorismo ou incitação à violência;</li>
            <li>uso de drogas em conjunto com atos sexuais retratados como obrigatórios, “chemsex” não consensual;</li>
            <li>qualquer outro conteúdo ilegal sob a legislação brasileira ou internacional aplicável.</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">🔎 Critérios de avaliação</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>existência de <strong className="text-foreground">consentimento informado</strong> de todos os retratados;</li>
            <li>verificação de <strong className="text-foreground">maioridade</strong> (18+) de todos os participantes;</li>
            <li>ausência de coerção, dependência financeira/emocional ou hierarquia abusiva;</li>
            <li>conformidade com leis brasileiras e com a jurisdição de origem do conteúdo.</li>
          </ul>
          <p className="mt-3 text-sm">
            A violação desta cláusula resulta em{' '}
            <strong className="text-foreground">remoção imediata do conteúdo, exclusão permanente da conta,
            retenção de valores e comunicação às autoridades competentes</strong> (Polícia Federal, NCMEC, SaferNet),
            independentemente de aviso prévio. Decisões são <strong className="text-foreground">irrecorríveis</strong> quando confirmadas as evidências.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">7. Conteúdo Original e Direitos Autorais</h2>
          <p>O usuário declara que:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>é o titular dos direitos sobre o conteúdo publicado;</li>
            <li>possui autorização expressa de terceiros eventualmente retratados.</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">🚨 Proibição de Uso Indevido</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>reutilizar conteúdo de terceiros sem permissão;</li>
            <li>publicar material sem autorização do autor.</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">⚠️ Penalidades</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>remoção de conteúdo;</li>
            <li>suspensão de monetização;</li>
            <li>bloqueio ou exclusão da conta.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">8. Monetização e Saques</h2>
          <p>A plataforma permite assinaturas, venda de conteúdo e comissões por indicação.</p>
          <p className="mt-2">Saques estão sujeitos à análise, com prazo de até 3 (três) dias úteis,
          podendo ser retidos em caso de irregularidade conforme cláusula 17.</p>
          <p className="mt-3 font-semibold text-foreground">⚠️ Suspensão de Monetização</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>violação destes termos;</li>
            <li>suspeita de fraude;</li>
            <li>comportamento irregular.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">9. Programa de Indicação e Comissões</h2>
          <p>O usuário poderá participar do programa de indicação conforme regras da plataforma.</p>
          <p className="mt-3 font-semibold text-foreground">🚨 Regras de Liberação</p>
          <p>A comissão somente será gerada e liberada quando o usuário indicado:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>completar o cadastro;</li>
            <li>concluir a verificação de identidade (KYC);</li>
            <li>tiver sua identidade aprovada pela moderação.</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">❌ Casos sem pagamento</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>verificação recusada;</li>
            <li>inconsistência nos dados;</li>
            <li>suspeita de fraude;</li>
            <li>contas duplicadas, falsas ou auto-indicação.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">10. Proteção de Dados</h2>
          <p>A plataforma está em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014).</p>
          <p className="mt-2">Dados coletados:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>dados cadastrais;</li>
            <li>dados de navegação;</li>
            <li>dados de verificação.</li>
          </ul>
          <p className="mt-2">Garantias:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>dados sensíveis protegidos;</li>
            <li>não exposição pública de dados reais;</li>
            <li>acesso restrito.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">11. Cooperação com Autoridades</h2>
          <p>A OCULTO poderá compartilhar informações com autoridades competentes, mediante requisição legal,
          para investigação de fraude, falsidade ideológica, crimes digitais e demais ilícitos, em conformidade
          com o Marco Civil da Internet e a LGPD.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">12. Moderação</h2>
          <p>A plataforma poderá remover conteúdos, suspender contas e restringir funcionalidades,
          sem aviso prévio em casos graves ou de violação à cláusula 6.</p>
        </section>

        <section>
          <h2 id="clausula-13" className="scroll-mt-24 text-xl font-semibold text-foreground mb-3">13. Denúncias de Conteúdo e Atividades Suspeitas</h2>
          <p>
            Qualquer usuário pode — e deve — denunciar conteúdos ou comportamentos que violem estes Termos.
            As denúncias podem ser feitas:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>pelo botão <strong className="text-foreground">“Denunciar”</strong> disponível em posts, perfis, mensagens e stories;</li>
            <li>pela <strong className="text-foreground">Central de Ajuda</strong> abrindo um ticket da categoria “Denúncia”;</li>
            <li>por e-mail para <span className="text-primary">faleconosco@ocultoswing.com.br</span> em casos urgentes ou envolvendo a cláusula 6.</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">📋 Dados necessários para apuração</p>
          <p>Para que a denúncia possa ser investigada com agilidade, informe:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>identificação do conteúdo (link, ID do post, story ou mensagem);</li>
            <li>perfil ou usuário denunciado (@username ou link do perfil);</li>
            <li>motivo da denúncia, com a categoria mais próxima possível;</li>
            <li>data e horário aproximados em que o fato ocorreu;</li>
            <li>evidências (capturas de tela, links, descrição detalhada);</li>
            <li>caso seja a vítima, descrição do impacto e eventuais riscos.</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">⏱️ Prazos e proteção do denunciante</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>análise inicial em até <strong className="text-foreground">48 horas</strong>;</li>
            <li>casos da cláusula 6 (conteúdo proibido) recebem prioridade e podem gerar remoção imediata;</li>
            <li>a identidade do denunciante é tratada com sigilo, salvo requisição legal;</li>
            <li>denúncias de má-fé sujeitam o autor às penalidades destes Termos.</li>
          </ul>
        </section>

        <section>
          <h2 id="clausula-14" className="scroll-mt-24 text-xl font-semibold text-foreground mb-3">14. Contestação e Apelação (Suspensões e Retenções)</h2>
          <p>
            O usuário que sofrer suspensão de conta, bloqueio de funcionalidades, retenção de valores,
            cancelamento de comissões ou remoção de conteúdo poderá solicitar revisão da decisão, em
            procedimento contraditório, observados os seguintes prazos e regras:
          </p>
          <p className="mt-3 font-semibold text-foreground">📨 Passo a passo para solicitar revisão</p>
          <ol className="list-decimal pl-6 mt-2 space-y-1">
            <li>acesse a <strong className="text-foreground">Central de Ajuda</strong> e abra um ticket da categoria “Contestação / Apelação”, ou utilize o formulário em <Link to="/contestacao" className="text-primary hover:underline">/contestacao</Link>;</li>
            <li>alternativamente, envie e-mail para <span className="text-primary">faleconosco@ocultoswing.com.br</span> a partir do e-mail cadastrado na conta;</li>
            <li>informe o <strong className="text-foreground">ID da conta</strong>, o tipo de decisão (suspensão, bloqueio, retenção, remoção, cancelamento de comissão) e a <strong className="text-foreground">data</strong> da decisão;</li>
            <li>descreva, de forma objetiva, os motivos da contestação (mínimo 30 caracteres);</li>
            <li>anexe documentos, comprovantes de pagamento, autorizações de terceiros, prints e demais evidências pertinentes;</li>
            <li>aguarde o <strong className="text-foreground">protocolo</strong> gerado automaticamente — ele é a referência oficial do seu pedido.</li>
          </ol>
          <p className="mt-3 font-semibold text-foreground">⏱️ Prazos</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>prazo do usuário para apresentar contestação: <strong className="text-foreground">até 30 dias corridos</strong> contados da decisão;</li>
            <li>análise pela equipe de moderação/financeiro: <strong className="text-foreground">até 10 dias úteis</strong>;</li>
            <li>retenções de valores são liberadas em <strong className="text-foreground">até 5 dias úteis</strong> após decisão favorável, descontadas eventuais obrigações legais;</li>
            <li>casos complexos (suspeita de fraude, requisição judicial, vítimas em risco) podem ser estendidos pelo tempo necessário, com comunicação ao usuário.</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">🔁 Resultado e segunda instância</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>o usuário receberá decisão fundamentada por e-mail e na própria Central de Ajuda;</li>
            <li>em caso de indeferimento, é admitido <strong className="text-foreground">um único pedido de reconsideração</strong> em até 15 dias, com novas evidências;</li>
            <li>decisões envolvendo conteúdo da cláusula 6 são <strong className="text-foreground">irrecorríveis</strong> quando confirmadas as evidências.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">15. Identificação e Segurança</h2>
          <p>A plataforma poderá exigir documentos, validar identidade e monitorar comportamento para:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>prevenir fraudes;</li>
            <li>proteger usuários;</li>
            <li>garantir integridade do sistema.</li>
          </ul>
        </section>

        <section>
          <h2 id="clausula-16" className="scroll-mt-24 text-xl font-semibold text-foreground mb-3">16. Política Antifraude</h2>
          <p>
            Complementa as cláusulas anteriores e tem por objetivo proteger a integridade da plataforma,
            garantir segurança aos usuários, prevenir práticas ilícitas e assegurar a legitimidade das
            transações e interações.
          </p>

          <p className="mt-3 font-semibold text-foreground">16.1 Monitoramento e análise de atividades</p>
          <p>A OCULTO poderá, de forma contínua e automatizada, monitorar comportamentos, analisar padrões
          e identificar ações suspeitas — incluindo, sem limitação, criação de múltiplas contas, atividades
          repetitivas/automatizadas, uso incomum de funcionalidades e transações financeiras atípicas.</p>

          <p className="mt-3 font-semibold text-foreground">16.2 Prevenção a fraudes financeiras</p>
          <p>Mecanismos contra auto-indicação, contas falsas, manipulação de comissões e fraudes em
          pagamentos/saques. Medidas aplicáveis: bloqueio de transações, retenção de valores, cancelamento
          de comissões e revisão manual.</p>

          <p className="mt-3 font-semibold text-foreground">16.3 Responsabilidade do usuário</p>
          <p>O usuário se compromete a utilizar a plataforma de forma legítima, não burlar sistemas de
          segurança ou antifraude e fornecer informações verídicas e atualizadas.</p>
        </section>

        <section>
          <h2 id="clausula-17" className="scroll-mt-24 text-xl font-semibold text-foreground mb-3">17. Retenção de Valores</h2>
          <p>A plataforma poderá reter valores em caso de:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>suspeita de fraude;</li>
            <li>disputa financeira;</li>
            <li>investigação interna ou requisição legal;</li>
            <li>descumprimento destes termos.</li>
          </ul>
          <p className="mt-2">A revisão da retenção segue o procedimento da cláusula 14.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">18. Limitação de Responsabilidade</h2>
          <p>A plataforma não se responsabiliza por:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>conteúdo publicado por usuários;</li>
            <li>interações realizadas fora do ambiente da plataforma;</li>
            <li>perdas decorrentes de bloqueios legítimos ou retenções fundamentadas;</li>
            <li>ações tomadas para proteção do sistema e da comunidade.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">19. Alterações</h2>
          <p>Os termos podem ser atualizados a qualquer momento. Alterações relevantes serão comunicadas
          e exigirão novo aceite na próxima utilização da plataforma.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">20. Termos Específicos para Criadores de Conteúdo</h2>
          <p>20.1. Usuários que utilizam a plataforma para fins de monetização, incluindo criação e comercialização de conteúdo, são considerados <strong>“Criadores”</strong>.</p>
          <p className="mt-2">20.2. O Criador declara, sob responsabilidade civil e penal, que:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>é maior de 18 (dezoito) anos e possui plena capacidade legal;</li>
            <li>é o legítimo titular dos direitos sobre todo o conteúdo publicado;</li>
            <li>obteve consentimento expresso de todas as pessoas envolvidas no conteúdo.</li>
          </ul>
          <p className="mt-2">20.3. O Criador é integralmente responsável pelo conteúdo publicado, pela veracidade das informações fornecidas e pelo cumprimento das leis aplicáveis.</p>
          <p className="mt-2">20.4. É expressamente proibido ao Criador publicar conteúdo de terceiros sem autorização, reutilizar material protegido por direitos autorais sem permissão ou utilizar material obtido de forma ilegal ou sem consentimento (complementa cláusulas 6 e 7).</p>
          <p className="mt-2">20.5. Em caso de violação, a plataforma poderá remover o conteúdo imediatamente, suspender ou encerrar a monetização e bloquear ou excluir a conta do Criador.</p>
          <p className="mt-2">20.6. A OCULTO não atua como empregadora, representante ou intermediadora direta dos Criadores, sendo apenas plataforma tecnológica de intermediação.</p>
          <p className="mt-2">20.7. O Criador é o único responsável por suas obrigações fiscais e declarações tributárias decorrentes dos ganhos auferidos.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">21. Parceiros e Programa de Afiliados (Complemento à Cláusula 9)</h2>
          <p>21.1. Em complemento ao programa descrito na cláusula 9, ficam estabelecidas as seguintes regras adicionais para parceiros e afiliados.</p>
          <p className="mt-2">21.2. A plataforma poderá, a qualquer momento: revisar atividades de indicação, cancelar comissões, bloquear valores e suspender ou excluir contas envolvidas em irregularidades.</p>
          <p className="mt-2">21.3. O pagamento de comissões poderá ser retido para análise ou condicionado a critérios de segurança e antifraude.</p>
          <p className="mt-2">21.4. É expressamente proibido auto-indicação (self-referral), criação de múltiplas contas para benefício próprio e qualquer tentativa de manipulação do sistema de comissões.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">22. Política Interna de Moderação (Complemento à Cláusula 12)</h2>
          <p>22.1. A moderação poderá ocorrer de forma automatizada, manual ou híbrida, com o objetivo de garantir segurança dos usuários, conformidade legal e integridade da plataforma.</p>
          <p className="mt-2">22.2. A plataforma poderá, a seu exclusivo critério, remover conteúdos, limitar funcionalidades, suspender contas temporariamente ou encerrá-las definitivamente.</p>
          <p className="mt-2">22.3. As decisões de moderação poderão ser tomadas sem aviso prévio em casos que envolvam risco à segurança, suspeita de fraude ou violação grave dos Termos.</p>
          <p className="mt-2">22.4. Em caso de reincidência: a conta poderá ser permanentemente bloqueada, valores poderão ser retidos e o acesso à plataforma poderá ser definitivamente encerrado.</p>
          <p className="mt-2">22.5. A plataforma manterá registros internos das ações de moderação para fins de segurança, auditoria e cumprimento legal. O direito de contestação permanece garantido conforme cláusula 14.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">23. Política de Disputas entre Usuários</h2>
          <p>23.1. A OCULTO atua exclusivamente como intermediadora tecnológica entre usuários, não sendo parte direta em negociações, interações ou acordos realizados entre eles.</p>
          <p className="mt-2">23.2. Eventuais disputas entre usuários — incluindo entrega ou qualidade de conteúdo, interações realizadas e acordos informais — são de responsabilidade exclusiva das partes envolvidas.</p>
          <p className="mt-2">23.3. A plataforma poderá, a seu critério e sem obrigação de mediação formal, analisar denúncias (cláusula 13), revisar evidências disponíveis, suspender funcionalidades, bloquear contas envolvidas e reter valores durante a investigação.</p>
          <p className="mt-2">23.4. A OCULTO não garante reembolso automático, reversão de pagamentos ou solução favorável a qualquer das partes.</p>
          <p className="mt-2">23.5. O usuário reconhece que interações financeiras e sociais ocorrem por sua própria conta e risco e deve agir com cautela ao interagir com outros usuários.</p>
          <p className="mt-2">23.6. Identificada fraude ou má-fé em disputas, a conta poderá ser bloqueada, valores poderão ser retidos e o acesso poderá ser encerrado definitivamente.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">24. Termos Internacionais e Uso Fora do Brasil</h2>
          <p>24.1. A plataforma poderá ser acessada por usuários fora do território brasileiro.</p>
          <p className="mt-2">24.2. Ao acessar a OCULTO em jurisdições internacionais, o usuário declara que cumpre as leis locais aplicáveis e é responsável por verificar a legalidade do uso da plataforma em seu país.</p>
          <p className="mt-2">24.3. O usuário é integralmente responsável pelo cumprimento das leis locais relacionadas a conteúdo adulto, suas obrigações fiscais e tributárias internacionais e regulamentações de privacidade e dados aplicáveis.</p>
          <p className="mt-2">24.4. A OCULTO não garante que seus serviços sejam apropriados ou permitidos em todas as jurisdições e poderá restringir acesso em determinados países, limitar funcionalidades conforme exigências legais locais e bloquear usuários em caso de incompatibilidade regulatória.</p>
          <p className="mt-2">24.5. Para usuários internacionais poderão ser aplicadas regras adicionais de verificação de identidade, exigências regulatórias específicas e controles antifraude reforçados.</p>
          <p className="mt-2">24.6. Em caso de conflito entre legislações, prevalecerão as leis brasileiras, salvo disposição legal obrigatória em contrário.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">25. Foro</h2>
          <p>Aplicam-se as leis brasileiras, eleito o foro do domicílio do usuário para dirimir questões
          oriundas destes Termos, ressalvado o disposto na cláusula 24.6.</p>
        </section>
      </div>
    ),
  },
  "privacidade": {
    title: "Política de Privacidade",
    icon: Shield,
    lastUpdated: "22 de Janeiro de 2025",
    content: (
      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Coleta de Dados (LGPD)</h2>
          <p className="text-muted-foreground leading-relaxed">
            Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), coletamos apenas 
            os dados necessários para a prestação de nossos serviços, incluindo: nome, e-mail, 
            documentos de identificação para verificação, e dados de pagamento.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Dados Sensíveis</h2>
          <p className="text-muted-foreground leading-relaxed bg-destructive/10 p-4 rounded-lg border border-destructive/20">
            <strong>Importante:</strong> Seus dados sensíveis (orientação sexual, preferências, biometria facial) 
            são processados exclusivamente para fins de segurança, verificação de idade e cumprimento 
            contratual. Estes dados são criptografados e nunca são compartilhados com terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Seus Direitos</h2>
          <p className="text-muted-foreground leading-relaxed">
            Você tem direito a: acessar seus dados, corrigir informações incorretas, solicitar a exclusão 
            de seus dados, revogar o consentimento a qualquer momento, e portabilidade de dados.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Armazenamento e Segurança</h2>
          <p className="text-muted-foreground leading-relaxed">
            Utilizamos criptografia de ponta a ponta e servidores seguros localizados no Brasil. 
            Seus dados são retidos apenas pelo tempo necessário para cumprir as finalidades descritas.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Contato do Encarregado (DPO)</h2>
          <p className="text-muted-foreground leading-relaxed">
            Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de dados, 
            entre em contato: <span className="text-primary">faleconosco@ocultoswing.com.br</span>
          </p>
        </section>
      </div>
    ),
  },
  "conteudo": {
    title: "Política de Conteúdo",
    icon: AlertTriangle,
    lastUpdated: "22 de Janeiro de 2025",
    content: (
      <div className="space-y-6">
        <section className="bg-destructive/10 p-6 rounded-xl border border-destructive/30">
          <h2 className="text-xl font-bold text-destructive mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            TOLERÂNCIA ZERO
          </h2>
          <p className="text-foreground leading-relaxed font-medium">
            A OCULTO tem TOLERÂNCIA ZERO para Material de Abuso Sexual Infantil (CSAM). 
            Qualquer conteúdo envolvendo menores de 18 anos será imediatamente removido e 
            reportado ao <strong>NCMEC (National Center for Missing & Exploited Children)</strong> e 
            à <strong>SaferNet Brasil</strong>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Conteúdo Proibido</h2>
          <ul className="text-muted-foreground space-y-2 list-disc pl-6">
            <li>Qualquer conteúdo envolvendo menores de idade</li>
            <li>Conteúdo não consensual ou revenge porn</li>
            <li>Violência, tortura ou conteúdo que promova danos físicos</li>
            <li>Conteúdo envolvendo animais</li>
            <li>Prostituição ou oferta de serviços sexuais</li>
            <li>Tráfico de pessoas</li>
            <li>Drogas ilegais</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Verificação de Consentimento</h2>
          <p className="text-muted-foreground leading-relaxed">
            Todo criador deve manter documentação de consentimento de todas as pessoas que aparecem 
            em seu conteúdo. A OCULTO pode solicitar esta documentação a qualquer momento.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Denúncias</h2>
          <p className="text-muted-foreground leading-relaxed">
            Use o botão "Denunciar" em qualquer conteúdo suspeito. Denúncias são analisadas em até 24 horas. 
            Para emergências, contate: <span className="text-primary">faleconosco@ocultoswing.com.br</span>
          </p>
        </section>
      </div>
    ),
  },
  "2257-compliance": {
    title: "18 U.S.C. § 2257 Compliance",
    icon: Scale,
    lastUpdated: "22 de Janeiro de 2025",
    content: (
      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Isenção de Responsabilidade</h2>
          <p className="text-muted-foreground leading-relaxed">
            A OCULTO não é produtora primária ou secundária de qualquer conteúdo visual publicado 
            em nossa plataforma, conforme definido pelo Título 18 do Código dos Estados Unidos, Seção 2257.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Responsabilidade dos Criadores</h2>
          <p className="text-muted-foreground leading-relaxed">
            Todo o conteúdo é produzido e carregado por criadores independentes que são os únicos 
            responsáveis pela manutenção dos registros de conformidade 2257, incluindo verificação 
            de idade e registros de consentimento.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Verificação de Identidade</h2>
          <p className="text-muted-foreground leading-relaxed">
            Exigimos que todos os criadores de conteúdo passem por um processo rigoroso de verificação 
            de identidade antes de poderem publicar qualquer conteúdo na plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Custodian of Records</h2>
          <p className="text-muted-foreground leading-relaxed">
            Todas as solicitações relacionadas a registros 2257 devem ser enviadas para: 
            <span className="text-primary"> faleconosco@ocultoswing.com.br</span>
          </p>
        </section>
      </div>
    ),
  },
  "autoridades": {
    title: "Canal para Autoridades",
    icon: Phone,
    lastUpdated: "22 de Janeiro de 2025",
    content: (
      <div className="space-y-6">
        <section className="bg-primary/10 p-6 rounded-xl border border-primary/30">
          <h2 className="text-xl font-bold text-primary mb-3">Canal Exclusivo para Law Enforcement</h2>
          <p className="text-foreground leading-relaxed">
            Este canal é destinado exclusivamente a autoridades policiais e órgãos governamentais 
            para solicitações de remoção de conteúdo, investigações e cooperação legal.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Contatos para Autoridades</h2>
          <div className="space-y-4 text-muted-foreground">
            <div className="p-4 bg-card rounded-lg border border-border">
              <p className="font-medium text-foreground">Email para Solicitações Oficiais:</p>
              <p className="text-primary">faleconosco@ocultoswing.com.br</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-border">
              <p className="font-medium text-foreground">Telefone de Emergência (24h):</p>
              <p className="text-primary">+55 (11) 4000-0000</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Requisitos para Solicitações</h2>
          <ul className="text-muted-foreground space-y-2 list-disc pl-6">
            <li>Número do inquérito policial ou processo judicial</li>
            <li>Identificação oficial do agente solicitante</li>
            <li>Descrição clara do conteúdo ou usuário em questão</li>
            <li>Fundamento legal da solicitação</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Tempo de Resposta</h2>
          <p className="text-muted-foreground leading-relaxed">
            Solicitações de emergência são processadas em até 2 horas. Solicitações regulares 
            são respondidas em até 72 horas úteis.
          </p>
        </section>
      </div>
    ),
  },
  "cookies": {
    title: "Política de Cookies",
    icon: Shield,
    lastUpdated: "22 de Janeiro de 2025",
    content: (
      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. O que são Cookies?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cookies são pequenos arquivos de texto armazenados em seu dispositivo quando você visita 
            nosso site. Eles nos ajudam a fornecer uma experiência personalizada e melhorar nossos serviços.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Tipos de Cookies que Utilizamos</h2>
          <div className="space-y-4">
            <div className="p-4 bg-card rounded-lg border border-border">
              <h3 className="font-medium text-foreground flex items-center gap-2 mb-2">
                🔒 Cookies Essenciais
                <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded-full">Obrigatórios</span>
              </h3>
              <p className="text-sm text-muted-foreground">
                Necessários para o funcionamento básico do site, como autenticação, segurança e preferências 
                de sessão. Não podem ser desativados.
              </p>
            </div>
            
            <div className="p-4 bg-card rounded-lg border border-border">
              <h3 className="font-medium text-foreground flex items-center gap-2 mb-2">
                📊 Cookies de Analytics
              </h3>
              <p className="text-sm text-muted-foreground">
                Nos ajudam a entender como você navega pelo site, quais páginas visita e por quanto tempo. 
                Usamos essas informações para melhorar a experiência do usuário.
              </p>
            </div>
            
            <div className="p-4 bg-card rounded-lg border border-border">
              <h3 className="font-medium text-foreground flex items-center gap-2 mb-2">
                ✨ Cookies de Personalização
              </h3>
              <p className="text-sm text-muted-foreground">
                Permitem que o site lembre suas preferências (idioma, tema, layout) para personalizar 
                sua experiência em visitas futuras.
              </p>
            </div>
            
            <div className="p-4 bg-card rounded-lg border border-border">
              <h3 className="font-medium text-foreground flex items-center gap-2 mb-2">
                🎯 Cookies de Marketing
              </h3>
              <p className="text-sm text-muted-foreground">
                Utilizados para exibir anúncios relevantes e medir a eficácia de campanhas publicitárias. 
                Podem ser compartilhados com parceiros de publicidade.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Como Gerenciar seus Cookies</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Você pode gerenciar suas preferências de cookies a qualquer momento:
          </p>
          <ul className="text-muted-foreground space-y-2 list-disc pl-6">
            <li>Através do banner de consentimento exibido no primeiro acesso</li>
            <li>Nas configurações de privacidade da sua conta</li>
            <li>Nas configurações do seu navegador</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Cookies de Terceiros</h2>
          <p className="text-muted-foreground leading-relaxed">
            Alguns cookies são definidos por serviços de terceiros que aparecem em nossas páginas, 
            como ferramentas de análise e widgets de redes sociais. Não temos controle sobre esses 
            cookies e recomendamos que você consulte as políticas de privacidade desses terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Atualizações desta Política</h2>
          <p className="text-muted-foreground leading-relaxed">
            Esta política pode ser atualizada periodicamente. Notificaremos sobre mudanças significativas 
            através do site ou por email. A data da última atualização está indicada no topo desta página.
          </p>
        </section>

        <section className="bg-primary/10 p-6 rounded-xl border border-primary/30">
          <h2 className="text-xl font-bold text-primary mb-3">Base Legal (LGPD)</h2>
          <p className="text-foreground leading-relaxed">
            O uso de cookies essenciais é baseado em nosso legítimo interesse em fornecer um site funcional. 
            Para cookies não essenciais, solicitamos seu consentimento explícito, que você pode revogar a 
            qualquer momento através das configurações de privacidade.
          </p>
        </section>
      </div>
    ),
  },
};

export default function LegalPage() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug || !legalContent[slug]) {
    return <Navigate to="/" replace />;
  }

  const content = legalContent[slug];
  const Icon = content.icon;

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" aria-label="Voltar">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Logo />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{content.title}</h1>
            <p className="text-sm text-muted-foreground">Última atualização: {content.lastUpdated}</p>
          </div>
        </div>

        {slug === 'termos-de-uso' && (
          <nav
            aria-label="Índice rápido de seções"
            className="mt-6 rounded-xl border border-border/50 bg-muted/30 p-4"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Ver seções
            </p>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              <li>
                <a href="#clausula-13" className="text-primary hover:underline">
                  13. Denúncias de conteúdo
                </a>
              </li>
              <li>
                <a href="#clausula-14" className="text-primary hover:underline">
                  14. Contestação e apelação
                </a>
              </li>
              <li>
                <a href="#clausula-16" className="text-primary hover:underline">
                  16. Política antifraude
                </a>
              </li>
              <li>
                <a href="#clausula-17" className="text-primary hover:underline">
                  17. Retenção de valores
                </a>
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/denunciar"
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                Fazer denúncia
              </Link>
              <Link
                to="/contestacao"
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
              >
                Solicitar contestação / apelação
              </Link>
            </div>
          </nav>
        )}

        {/* Body */}
        <div className="mt-8 prose prose-invert max-w-none">
          {content.content}
        </div>

        {/* Back link */}
        <div className="mt-12 pt-8 border-t border-border/30">
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Início
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
