# Nexus — Sistema administrativo + Portal do Prestador (protótipo)

Protótipo navegável do Nexus em duas zonas que compartilham os mesmos dados:

- **Admin (escritório)**: visão geral, calendário, tarefas, documentos,
  notificações, usuários e os módulos Prestadores e Account Management. É a
  reconstrução do app legado
  (`operational-intelligence-platform/index.html`) no modelo "Design e
  Arquitetura".
- **Portal do Prestador**: o prestador lança recibos e envia o fechamento
  mensal. O escritório confere e paga no admin.

O que o prestador envia aparece na conferência do admin. O que o escritório
decide volta para o portal na hora.

## Dados reais (Supabase)

O sistema tem dois modos, e nunca mistura os dois:

- **Real**: com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env.local`, o
  login é o do Supabase (convite por e-mail, senha criada pela própria pessoa,
  "esqueci minha senha"), os dados ficam no banco em São Paulo, os anexos numa
  pasta privada, e o que uma pessoa grava aparece na tela das outras em tempo
  real. As permissões (papel, módulos, segregação de funções dos pagamentos,
  portal do prestador) são checadas pelo próprio banco, com RLS e gatilhos.
  O banco começa vazio (nenhum dado fictício) e a data de "hoje" é a data real
  de Brasília.
- **Demonstração**: só quando pedida de propósito, com `VITE_DEMO=1`
  (`VITE_DEMO=1 pnpm dev`). Dados fictícios no navegador e contas de teste na
  tela de login. Os testes automáticos usam esse modo.

Sem as chaves do Supabase e sem `VITE_DEMO=1`, o sistema mostra a tela
"Sistema ainda não ligado ao banco" em vez de abrir com dados inventados.

O passo a passo para criar o projeto e ligar o sistema está em **[SUPABASE.md](SUPABASE.md)**.

- `supabase/migrations/` tabelas, RLS, regras de pagamento, auditoria, storage, tempo real
- `supabase/functions/convidar/` convite de equipe e de prestador (Edge Function)
- `client/src/_core/supabase/` modo, cliente, login e sincronização das coleções com as tabelas

## Rodando

```bash
pnpm install
pnpm web                # http://localhost:3000 (dados reais, com o .env.local; funciona no Windows)
pnpm dev                # o mesmo pelo servidor Express do template (Linux/macOS)
VITE_DEMO=1 pnpm dev    # demonstração com dados fictícios
```

```bash
pnpm check   # typecheck
pnpm test    # regras de domínio (vitest)
pnpm build   # build de produção
```

## Contas de demonstração

Só existem no modo demonstração (`VITE_DEMO=1`).


**Admin** (`/login`). Todos usam a senha **nexus2026**.

| E-mail                | Papel         | Módulos                            |
| --------------------- | ------------- | ---------------------------------- |
| `fernanda@nexus.demo` | Administrador | todos                              |
| `felipe@nexus.demo`   | Administrador | todos (Felipe Zanetti)             |
| `ricardo@nexus.demo`  | Gestor        | escritório, Prestadores e Contas   |
| `marcos@nexus.demo`   | Gestor        | chefe da administração: aprova os pagamentos |
| `helena@nexus.demo`   | Operador      | calendário, tarefas e Prestadores  |
| `caio@nexus.demo`     | Visualizador  | visão geral, Prestadores e Contas  |
| `bianca@nexus.demo`   | —             | conta inativa (o login é recusado) |

**Portal** (`/portal/login`):

| Código      | Senha        | Prestador                                    |
| ----------- | ------------ | -------------------------------------------- |
| `PNST-2481` | `nexus2026`  | Marina Corrêa Diligências                    |
| `PNST-3107` | `rotaleve26` | Rota Leve Entregas                           |
| `PNST-1180` | `apoio2026`  | Apoio Forense Paulista                       |
| `PNST-2204` | `oficio2026` | Ofício Central de Notas                      |
| `PNST-0942` | `postal2026` | Agência Postal Vila Nova (acesso desativado) |

Senhas e acesso ao portal são editados em **Prestadores → Cadastro e acesso**.

## Zonas e rotas

| Zona   | Rotas                                                                   |
| ------ | ----------------------------------------------------------------------- |
| Portal | `/portal/login`, `/portal`, `/portal/recibos`, `/portal/fechamento`     |
| Admin  | `/login` e tudo o mais (exige sessão; cada rota confere papel e módulo) |

Rotas do admin:

- **Escritório**:
  - `/` visão geral
  - `/notificacoes`
  - `/calendario`
  - `/documentos`
  - `/usuarios` (só com permissão `usuarios.gerenciar`)
- **Pagamentos** (qualquer pessoa logada pede; cada um vê o que lhe cabe):
  - `/pagamentos` pedidos, conferência e pagamento
  - `/pagamentos/aprovacoes` fila do aprovador
  - `/pagamentos/fornecedores` cadastro e validação de dados bancários
  - `/pagamentos/regras` aprovador e substituto
- **Prestadores**:
  - `/prestadores` painel
  - `/prestadores/conferencia`: lotes por prestador × competência. Aprovar ou
    devolver cada recibo, depois finalizar e marcar como pago.
  - `/prestadores/historico`
  - `/prestadores/cadastro`
  - `/prestadores/arquivos`
- **Account Management**:
  - `/contas` tarefas
  - `/contas/banco` painel de câmbio
  - `/contas/taxas` (com exportação CSV)
  - `/contas/ordens` ordens de pagamento do Banco Industrial (fluxo completo)
  - `/contas/economia`
  - **Conciliação bancária**:
    - `/contas/conciliacao` painel das contas no mês
    - `/contas/conciliacao/conciliar` extrato × razão
    - `/contas/conciliacao/demonstrativo` relatório e fechamento
    - `/contas/conciliacao/contas` contas bancárias e importações

Ao entrar num módulo (Prestadores, Contas), a barra lateral troca para o menu
dele e ganha o link "Voltar ao escritório".

## Aprovação de pagamentos

Pedido → conferência do financeiro → aprovação do chefe da administração →
pagamento com comprovante → conciliação. Sem faixas de valor nem dias fixos:
cada pedido segue o próprio vencimento.

- **Pedido.** Qualquer pessoa logada (financeiro ou outras áreas) pede:
  favorecido (fornecedor cadastrado ou avulso), valor, vencimento, forma
  (boleto, Pix, TED, débito), centro de custo (empresa, categoria, cliente,
  caso, reembolsável) e documento anexado — sem documento não sai. Urgência e
  vencimento passado exigem justificativa.
- **Segregação de funções** (`modulos/pagamentos/regras.ts`): quem pede não
  confere; quem pede ou confere não aprova (vai para o substituto); quem
  aprova não registra o pagamento. Outras áreas veem só os próprios pedidos.
- **Aprovação.** Fila com urgentes primeiro e aprovação em lote. Devolver e
  reprovar pedem motivo; devolvido volta para quem pediu corrigir e reenviar.
  O substituto aprova só no período configurado em Regras de aprovação.
- **Fornecedores.** Mudar banco, agência, conta ou Pix marca o fornecedor como
  "a validar": o pagamento só é aprovado com a confirmação, por telefone, de
  que a conta nova é dele (o golpe mais comum contra financeiro).
- **Pagamento.** O financeiro escolhe a conta de saída e anexa o comprovante;
  o lançamento entra no razão da conciliação e casa com o débito do extrato.
- **Prestadores.** O lote conferido vira pedido (já conferido) com "Solicitar
  pagamento"; quando o pedido é pago, o lote fica Pago e o portal vê na hora.
- **Alertas e contadores**: vencido sem pagamento, vence em até 2 dias,
  fornecedor a validar; o menu mostra a cada um o que é seu (aprovar,
  conferir/pagar, corrigir).

## Ordens de pagamento do Banco Industrial

O fluxo que a área financeira faz a cada ordem recebida do exterior. Cada
ordem mostra a etapa em que está e o próximo passo; a etapa sai das datas
preenchidas (`etapaDaOrdem`), sem estado guardado à parte.

1. **Recebida.** "Nova ordem do e-mail": cola-se o e-mail "Ordem de Pagamento"
   do BIB e o sistema lê ordenante, beneficiário, moeda, valor e nº da ordem.
2. **Invoice enviada.** Cadastra-se a invoice gerada no Sisjuri (número,
   valor, honorários ou despesas, PDF). O e-mail ao banco sai pronto, com a
   natureza da ordem e as invoices anexadas.
3. **Liberada pelo banco.** Registra-se o OK do banco.
4. **E-mail aos superiores.** Junta as ordens liberadas, a cotação do dia (dá
   para registrar ali mesmo o que os bancos passaram por telefone), o
   comentário de mercado e a tabela "Horário Cotação × BIB × ITAU × ITAÚ x BIB"
   das últimas quatro cotações, com as cores do e-mail de hoje.
5. **Decisão.** Gestor ou administrador decide no sistema: aguardar o câmbio
   (com taxa-alvo opcional) ou fechar em D+0, D+1 ou D+2 (dias úteis). Quem
   recebeu a decisão por e-mail a registra dizendo quem decidiu.
6. **Fechamento.** Cotação, data e "quem fechou"; o valor em reais sai na hora.
7. **Resposta ao banco** com a cotação e as invoices anexadas.
8. **Baixa.** Checklist: baixa no Sisjuri, extrato lançado (atalho para a
   conciliação do BIB) e contrato de câmbio assinado. Com os três, a ordem
   fica concluída.

Alertas no topo (e o contador no menu): fechamento D+n do dia ou atrasado,
taxa-alvo atingida e OK do banco pendente há 2 dias ou mais.

**E-mails.** Cada e-mail pronto tem "Abrir no Outlook" (baixa um rascunho
`.eml` com `X-Unsent: 1`: o Outlook abre como mensagem nova, editável, com
destinatários, corpo formatado e os PDFs anexados) e "Copiar formatado" (HTML
na área de transferência). Destinatários e assinatura ficam em ⚙ na página.
Os PDFs das invoices ficam no IndexedDB do navegador (`_core/armazenamento/anexos.ts`).

**Planilha.** "Exportar planilha" gera o *Controle de Fechamento de Ordens*
no layout do escritório: uma aba por mês, colunas A–L, ordem mista em duas
linhas mescladas e, no pé, as ordens não fechadas por moeda com AMOUNT
USD/EUR. "PENDENTE?" só vira NÃO quando a baixa termina.

**Fase 2 (Microsoft 365).** Ler os e-mails do BIB sozinho, perceber o OK do
banco e enviar direto da caixa do usuário exige backend e um aplicativo
autorizado pela TI no Microsoft 365 (Graph API).

## Conciliação bancária

Segue o processo que a área financeira faz todo mês, conta por conta:

1. **Extrato.** Importa o OFX do internet banking ou um CSV (data, histórico,
   documento, valor — ou crédito e débito separados). Linha já importada fica
   de fora (FITID do OFX ou assinatura da linha). O saldo final do arquivo vira
   o "saldo informado pelo banco".
2. **Razão.** Os lançamentos da conta contábil que espelha o banco. "Trazer do
   sistema" puxa sozinho os lotes de prestadores pagos (saída no Itaú PNST) e
   as ordens de câmbio fechadas (entrada no Banco Industrial); o resto entra
   por "Novo lançamento".
3. **Casamento.** "Conciliar automaticamente" casa o que é seguro: mesmo
   valor com até 3 dias de diferença (mesmo documento primeiro) e o débito
   único do banco que soma 2 a 4 lançamentos do razão (lote de pagamentos). O
   resto se casa à mão, N para M, desde que as somas batam.
4. **Ajustes.** Tarifa, IOF e rendimento só existem no banco: "Lançar no
   razão" cria o lançamento com a contrapartida escolhida e já concilia.
5. **Demonstrativo.** Saldo do extrato + depósitos em trânsito − pagamentos
   não compensados = saldo bancário ajustado; saldo do razão + créditos não
   contabilizados − débitos não contabilizados = saldo contábil ajustado. A
   diferença tem de ser zero. Exporta CSV e imprime.
6. **Fechamento com dupla checagem.** O checklist exige mês anterior fechado,
   saldo do banco conferido, nada do banco fora do razão e diferença zero.
   Quem prepara envia para revisão; um gestor ou administrador *diferente*
   aprova. Em revisão ou fechado, o mês trava; o revisor devolve, o
   administrador reabre.

Na semente, maio está fechado nas três contas (Itaú PNST, Banco Industrial
PNST e Itaú PNSTART) e junho está em andamento, com cheque não compensado,
depósito em trânsito, tarifas, IOF, rendimento e um lote SISPAG.

## Arquitetura

```
client/src/
  _core/
    armazenamento/deposito.ts  interface Motor (localStorage com prefixo nexus:v1:, ou memória)
    armazenamento/colecao.ts   criarColecao / useColecao: coleção reativa e persistida
    armazenamento/semente.ts   VERSAO_DA_SEMENTE, restaurarDemonstracao(), comecarDoZero()
    identidade/                papéis, permissões, módulos, sessão do admin
    armazenamento/anexos.ts    PDFs anexados (IndexedDB)
    tempo.ts                   "hoje" da demonstração e utilitários de data
  modulos/pagamentos/          pedidos, fornecedores, regras de aprovação e segregação de funções
  modulos/conciliacao/         contas bancárias, extrato, razão, casamentos, fechamentos; regras puras e leitura de OFX/CSV
  modulos/<módulo>/            tipos, dados de demonstração, coleções, regras puras, ações
  admin/                       casca, menus, rotas, componentes e páginas do admin
  pages/, components/          Portal do Prestador
  contexts/PortalContext.tsx   portal sobre as coleções compartilhadas de Prestadores
  index.css                    folha única do design system
```

- **Coleções.** Cada conjunto de dados é uma coleção, como `recibos`,
  `fechamentos`, `taxas` ou `usuarios`:
  - É lida do depósito uma vez.
  - Fica num envelope `{versao, dados}`. Mudar a versão da semente reidrata a
    demonstração.
  - As gravações são agrupadas por microtarefa.
  - As telas assinam com `useColecao` (`useSyncExternalStore`).

  Portal e admin usam as mesmas coleções, e é isso que os integra. Ligar um
  backend é trocar o `Motor`.

- **Regras puras.** Agenda, vencimentos, lotes de conferência, spreads e
  rankings ficam em `modulos/*/regras.ts`, sem React. Os testes ficam em
  `server/admin.regras.test.ts`, `server/ordens.test.ts`,
  `server/pagamentos.test.ts`,
  `server/conciliacao.test.ts`,
  `server/colecao.test.ts` e `server/portal*.test.ts`.
- **Acesso efetivo = papel ∩ módulos.** O papel (admin, gestor, operador,
  visualizador) dá as permissões (`registros.editar`, `registros.excluir`,
  `usuarios.gerenciar`). Os módulos do usuário dizem o que ele vê. Visualizador
  não edita nada.
- **Data da demonstração.** No modo real "hoje" é a data de Brasília. Na
  demonstração, "hoje" é fixo em **30/06/2026** (`_core/tempo.ts`),
  para que prazos, vencimentos e alertas da semente façam sentido em qualquer
  data real.
- **Semente.** Em Usuários e acessos o administrador tem "Restaurar
  demonstração" (volta tudo à semente) e "Começar do zero" (esvazia os dados de
  trabalho; usuários e sessões ficam). Os dois pedem um segundo clique.
  Trocar `VERSAO_DA_SEMENTE` renova a demonstração na próxima leitura, e o
  sistema avisa uma vez no topo da página.

## Design

Estrutura e design da **Central de Operações PNST** (o app de referência):

- **Casca.** Barra lateral de 258px em grafite `#282828` com a logo, rótulos de
  grupo em mono, item ativo em `#3e3e3e` com barra laranja à esquerda e, no pé,
  a pessoa logada com o botão de sair. Topo de 70px com trilha (módulo /
  página), busca global (páginas, prestadores, recibos, tarefas, documentos,
  contas), alternância de tema, sino com avisos e menu da conta. Abaixo de
  760px a barra vira gaveta e a busca vira ícone.
- **Título no miolo.** Cada página abre com um sobretítulo laranja em mono, o
  `h1` de 26px, a descrição e as ações à direita
  (`<Cabecalho>`/`<CabecalhoPagina>`).
- **Cores.** Laranja PNST `#F16122` direto no botão principal (texto branco em
  negrito), filtro ativo e gráficos; fundo `#f9f9f9`, bordas `#e7e7e7`. O modo
  escuro redefine só os tokens.
- **Componentes.** Raios de 6–9px; KPIs com rótulo mono de 9px, número em 32px
  e faixa colorida de 3px no pé (laranja, verde, âmbar, vermelho ou neutro);
  selos de status com ponto colorido; filtros em chip cinza (o ativo com tinta
  laranja); tabelas com cabeçalho mono em fundo neutro.
- **Tipografia.** DM Sans nos títulos, Source Sans 3 no texto e IBM Plex Mono
  nos rótulos; números com algarismos tabulares.
- **Login.** Cartão centralizado com o selo escuro da logo e brilho laranja ao
  fundo, igual para admin e portal.
- **Convenções.** Uma folha de estilo só; `style={{}}` apenas para valor
  calculado em tempo de execução. Nenhuma tela rola para o lado em 390px.

## Build estático para preview

```bash
VITE_DEMO=1 VITE_HASH_ROUTER=1 pnpm exec vite build --base=./
```

Sem `VITE_DEMO=1` (e sem as chaves do Supabase) o build mostra a tela de
configuração.

Com esse build, as rotas vivem no hash (`#/login`, `#/portal/login`), então
qualquer hosting estático funciona.

## Fora do escopo / limites conhecidos

- **Na demonstração não há backend.** Os dados ficam no `localStorage` do
  navegador, com o prefixo `nexus:v1:`, e o login compara as credenciais de
  demonstração no cliente. No modo real tudo fica no Supabase. O scaffold tRPC/Drizzle do template continua no repositório, ainda
  não ligado às telas.
- **Módulos que não fazem parte do sistema:** Legal Workflow, Consultoria e
  Particular foram retirados. O Financeiro do escritório também não existe — o
  próprio app legado o marca como removido.
- **Em construção:** o armazenamento do conteúdo dos arquivos (Documentos e
  Arquivos de prestadores guardam só os metadados).
- **Os dados de demonstração são fictícios** e só aparecem com `VITE_DEMO=1`: clientes, prestadores, taxas e
  pessoas.
