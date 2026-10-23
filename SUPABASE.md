# Ligando o PNST Administrativo ao Supabase

Passo a passo para ligar o sistema ao banco e trabalhar com dados reais. Leva
cerca de 30 minutos. Nada aqui exige programar: é copiar, colar e clicar.

> **Antes de tudo:** a chave **service_role / secret** do Supabase nunca vai
> para o sistema, para o `.env.local` nem para e-mail ou chat. Ela ignora todas
> as permissões. O sistema usa só a chave **pública** (anon / publishable).

---

## 1. Criar o projeto (5 min)

1. Entre em <https://supabase.com> e crie a conta (pode usar o e-mail do escritório).
2. **New project**:
   - **Name:** `PNST Administrativo`
   - **Database password:** gere uma senha forte e guarde no cofre de senhas do escritório.
   - **Region:** **South America (São Paulo)** — os dados ficam no Brasil.
3. Espere o projeto ficar pronto (1–2 minutos).

> **Plano:** o gratuito serve para testar, mas pausa o projeto após uma semana
> sem uso e não tem backup diário. Para dados reais do escritório, use o
> **Pro** (backups diários, sem pausa).

## 2. Criar as tabelas e as permissões (2 min)

1. No menu lateral: **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/migrations/20261008000000_pnst_inicial.sql` deste
   repositório, copie **todo** o conteúdo e cole no editor.
3. Clique em **Run**. Deve terminar com "Success. No rows returned".
4. Repita com `supabase/migrations/20261008000001_endurecer_funcoes.sql` (fecha
   as funções internas para quem não está logado).
5. Em **Advisors → Security Advisor**, só devem sobrar avisos "Signed-In Users
   Can Execute SECURITY DEFINER Function" das funções `eh_*`, `ve_modulo`,
   `pode_editar`, `meu_*`, `aprovador_*` e `registrar_acesso`: são de propósito
   (as regras de acesso precisam delas e cada uma só responde sobre quem está logado).

Isso cria as tabelas, as regras de acesso (RLS), a numeração de pagamentos,
a auditoria, a pasta privada de anexos e o tempo real.

## 3. Configurar o login (5 min)

Em **Authentication**:

1. **Sign In / Providers**
   - Desligue **Allow new users to sign up** (ninguém se cadastra sozinho; gente nova entra por convite).
   - Deixe o provedor **Email** ligado.
2. **URL Configuration**
   - **Site URL:** o endereço onde o sistema vai ficar (passo 7), por exemplo `https://pnst-administrativo.vercel.app`.
     Enquanto testa só no seu computador, use `http://localhost:3000`.
   - **Redirect URLs:** adicione o mesmo endereço e também `http://localhost:3000`.
3. Ainda em **Sign In / Providers**, abra o provedor **Email** e ponha
   **Minimum password length** em **10**.
4. **Emails → SMTP Settings** (recomendado): o e-mail embutido do Supabase só
   envia poucas mensagens por hora e serve para teste. Para convites e "esqueci
   minha senha" no dia a dia, use uma caixa do Microsoft 365 do escritório:
   - Host `smtp.office365.com`, porta `587`, usuário e senha da caixa (por
     exemplo `sistema@…`), remetente com o mesmo endereço. A TI pode precisar
     liberar "SMTP AUTH" para essa caixa.
5. **Emails → Templates** (opcional): traduza o assunto e o texto de
   **Invite user** e **Reset password**. Sugestão para o convite:
   > **Assunto:** Seu acesso ao PNST Administrativo
   > **Texto:** Você foi convidado para o PNST Administrativo. Clique em
   > `{{ .ConfirmationURL }}` para criar sua senha.

## 4. Criar o primeiro administrador (1 min)

1. **Authentication → Users → Add user → Create new user**.
2. Seu e-mail, uma senha forte, marque **Auto Confirm User**.
3. Pronto: **o primeiro usuário criado vira administrador** com todos os
   módulos. Confira em **Table Editor → perfis**.

Todos os outros entram pelo sistema, em **Usuários e acessos → Convidar usuário**.

## 5. Publicar a função de convite (3 min)

O convite por e-mail roda numa Edge Function (no servidor do Supabase, com a
chave de serviço que nunca sai de lá).

1. **Edge Functions → Deploy a new function → Via Editor**.
2. **Function name:** `convidar` (exatamente assim).
3. Apague o exemplo, cole todo o conteúdo de `supabase/functions/convidar/index.ts` e clique em **Deploy**.
4. Deixe **Verify JWT** ligado (só quem está logado chama a função).

## 6. Ligar o sistema ao projeto (2 min)

1. **Project Settings → API** (ou **Data API**): copie a **Project URL** e a
   chave **anon / publishable**.
2. Na pasta do projeto, copie `.env.example` para `.env.local` e preencha:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Teste no seu computador: `pnpm install` e `pnpm web`, e abra <http://localhost:3000>.
   Sem esse arquivo o sistema mostra "Sistema ainda não ligado ao banco".
   Com ele, a tela de login pede e-mail e senha; entre com o administrador do
   passo 4. O sistema começa vazio: nada fictício, só o que a equipe cadastrar.

## 7. Colocar no ar para a equipe (10 min)

O sistema é um site estático: qualquer hospedagem de sites serve. Com a Vercel
(o repositório já tem o `vercel.json`):

1. <https://vercel.com> → **Add New → Project** → importe o repositório do GitHub.
2. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (os mesmos do passo 6).
3. **Deploy**. Anote o endereço (ex.: `https://pnst-administrativo.vercel.app`).
4. Volte ao passo 3.2 e coloque esse endereço em **Site URL** e **Redirect URLs**.

## 8. Primeiros ajustes dentro do sistema

1. **Usuários e acessos → Convidar usuário:** cada pessoa recebe o e-mail,
   cria a própria senha e entra com o papel e os módulos que você definiu.
2. **Account Management → Pagamentos → Regras de aprovação:** escolha o chefe da administração e o substituto.
3. **Conciliação → Contas bancárias:** cadastre as contas com o saldo de abertura.
4. **Ordens de pagamento → ⚙:** e-mails do Banco Industrial, dos superiores e a assinatura.
5. **Account Management → Pagamentos → Fornecedores** e **Prestadores → Cadastro e acesso**: para dar
   acesso ao portal, salve o prestador com o e-mail e use **Convidar para o portal**.

---

## O que o banco garante (mesmo se alguém mexer no navegador)

- **Quem não entrou não vê nada.** Toda tabela tem RLS; o acesso anônimo foi revogado.
- **Papel e módulos valem no banco:** quem não tem o módulo não lê a tabela; leitor não grava.
- **Ninguém se promove:** só o administrador altera perfis, e o último administrador ativo não pode ser rebaixado.
- **Pagamentos:** número sequencial gerado pelo banco; quem pede não confere,
  quem pede ou confere não aprova, quem aprova não paga; pago não volta atrás
  e pagamento não se apaga.
- **Fornecedor:** trocar banco, agência, conta ou Pix derruba a validação, venha a mudança de onde vier.
- **Portal:** o prestador vê só o próprio cadastro, recibos e fechamentos; não aprova recibo; com o portal desativado, perde o acesso na hora.
- **Auditoria:** toda inclusão, alteração e exclusão das tabelas financeiras fica na tabela `auditoria` (quem, quando, antes e depois), visível só para o administrador.
- **Anexos:** PDFs numa pasta privada; só a equipe logada baixa.

## Para quem desenvolve: Supabase local

```bash
npx supabase start          # sobe banco, login, API, e-mail de teste e funções (Docker)
npx supabase db reset       # aplica a migração do zero
```

Com o banco recém-zerado, os testes de permissão rodam assim:

```bash
SUPABASE_TESTE_URL=http://127.0.0.1:54321 \
SUPABASE_TESTE_ANON=<ANON_KEY do supabase start> \
SUPABASE_TESTE_SERVICE=<SERVICE_ROLE_KEY do supabase start> \
pnpm test
```

Sem essas variáveis, `pnpm test` pula os testes de banco.
