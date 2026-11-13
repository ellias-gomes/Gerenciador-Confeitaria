# Doce Gestão — Sistema de Gerenciamento para Confeitaria Artesanal

Sistema completo (**Web + PWA + Aplicativo Android**) desenvolvido para organizar e profissionalizar o dia a dia de uma confeitaria artesanal de bolos e doces. Todas as informações ficam centralizadas em um único banco de dados e são sincronizadas em tempo real entre computador e celular.

---

## Principais Funcionalidades

- **Painel Gerencial (Dashboard):** Faturamento previsto do mês, lucro estimado, valores a receber, próximas entregas e alertas automáticos de estoque baixo, insumos em alta e receitas com margem abaixo da meta.
- **Análise de Preços & Tendências de Insumos:**
  - Cadastro de ingredientes e embalagens com controle de estoque e estoque mínimo.
  - Histórico cronológico de preços e compras por fornecedor/marca.
  - Gráfico de evolução, cálculo de variação percentual, indicador de tendência (*Subindo*, *Estável*, *Caindo*) e relatório de impacto direto no custo das receitas.
- **Receitas & Fichas Técnicas Intuitivas:**
  - Conversão automática entre unidades compatíveis (`g ↔ kg`, `ml ↔ L`, `un ↔ dz`).
  - Cálculo em tempo real de CMV (ingredientes + embalagens), custos indiretos (gás, energia, perdas), mão de obra por tempo de preparo, margem de lucro/markup e preço de venda sugerido.
  - Duplicação rápida de receitas para criar variações de sabores.
- **Pedidos & Clientes Detalhados:**
  - Agenda de encomendas com data/hora, modalidade (retirada ou entrega), tema/decoração, sabores, alergias/restrições, sinal pago e saldo restante.
  - Contatos completos dos clientes com botão direto para WhatsApp e resumo copiável do pedido.
  - Baixa opcional automática de estoque ao enviar pedido para produção.
- **Calculadora de Gastos, Novos Serviços & Lista de Compras:**
  - Simula quanto será necessário gastar para produzir novas receitas e/ou atender pedidos selecionados da agenda, somando serviços extras (topo de bolo, entrega, embalagem especial, ajudante).
  - Desconta automaticamente o estoque disponível, calcula pacotes a comprar e gera lista de compras copiável para WhatsApp.
- **Cadastro, Login e Níveis de Acesso (RBAC):**
  - `admin` (**Proprietária / Gerente**): acesso total, gestão de equipe/papéis e parâmetros financeiros.
  - `confeiteira` (**Produção**): insumos, preços, receitas, pedidos, clientes e calculadora.
  - `atendente` (**Vendas**): pedidos, clientes, consulta de catálogo e calculadora.
  - `visualizador` (**Consulta**): acesso somente leitura (nível inicial seguro para novos cadastros).

---

## Estrutura do Projeto

```text
gerenciador_confeitaria/
├── .env                  # Configurações sensíveis (protegido pelo .gitignore)
├── .env.example          # Modelo seguro de variáveis de ambiente
├── .gitignore            # Protege .env, bancos SQLite, node_modules e builds
├── PLANEJAMENTO.md       # Pesquisa de mercado (Sebrae) e arquitetura do sistema
├── README.md             # Documentação completa
├── iniciar.sh            # Script de inicialização com porta configurável
├── backend/              # API REST + SSE (Node.js, Express, SQLite)
├── frontend/             # Interface Web responsiva + PWA (React, Vite, Tailwind)
└── frontend/android/     # Projeto nativo Android gerado com Capacitor
```

---

## Configuração Segura (`.env`)

Os segredos e parâmetros sensíveis ficam armazenados no arquivo `.env` (ignorado pelo Git via `.gitignore`). Use `.env.example` como referência:

| Variável | Descrição |
| :--- | :--- |
| `PORT` | Porta padrão caso não seja passada no `./iniciar.sh` |
| `HOST` | Interface de rede (`0.0.0.0` permite acesso pelo celular na mesma rede Wi-Fi) |
| `JWT_SECRET` | Chave secreta usada para assinar tokens de login |
| `DB_PATH` | Caminho do banco de dados SQLite (`./backend/data/confeitaria.db`) |
| `DEFAULT_REGISTER_ROLE` | Nível inicial de novos cadastros públicos (`visualizador` ou `atendente`) |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciais iniciais da conta administradora (criada no primeiro boot; altere após entrar) |

---

## Como Rodar Localmente (Sistema Web)

Dê permissão de execução (caso ainda não tenha) e informe a porta desejada:

```bash
chmod +x iniciar.sh
./iniciar.sh 8080
```

Você pode escolher qualquer porta disponível (ex.: `./iniciar.sh 3000`, `./iniciar.sh 8080`, `./iniciar.sh 9090`).
Para forçar a recompilação do frontend antes de subir:

```bash
./iniciar.sh 8080 --build
```

Ao iniciar, o terminal exibirá os endereços:
- **Web Local:** `http://localhost:8080`
- **Rede/Android:** `http://<IP-DA-SUA-MAQUINA>:8080`

> **Primeiro acesso:** Entre com o e-mail e senha definidos em `ADMIN_EMAIL` e `ADMIN_PASSWORD` no arquivo `.env`, e cadastre as contas individuais da sua mãe e irmã na aba **Equipe & Config.**.

---

## Como Usar no Celular Android (App Sincronizado)

Existem **duas formas** integradas de rodar no Android, ambas usando **exatamente o mesmo banco de dados e sincronização ao vivo**:

### Opção 1: Aplicativo Nativo Android (Capacitor — `frontend/android/`)
1. Sempre que alterar a interface web, sincronize os arquivos com o projeto Android:
   ```bash
   npm run android:sync
   ```
2. Abra a pasta `frontend/android/` no **Android Studio** (ou compile com Gradle tendo o Android SDK configurado):
   ```bash
   cd frontend/android && ./gradlew assembleDebug
   ```
   O APK gerado ficará em `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
3. Instale o APK no celular Android.
4. Na tela de login do aplicativo, toque em **"Alterar IP"** e informe o endereço **Rede/Android** exibido pelo `./iniciar.sh 8080` (ex.: `http://192.168.1.15:8080`), clique em **Testar** e salve.

### Opção 2: Instalação Instantânea via PWA (Chrome no Android)
1. Com o celular na mesma rede Wi-Fi do computador rodando `./iniciar.sh 8080`, abra `http://<IP-DA-MAQUINA>:8080` no Google Chrome.
2. Toque no menu do navegador (`⋮`) e escolha **"Adicionar à tela inicial" / "Instalar aplicativo"**.

---

## Testes Automatizados

Execute a suíte de testes de integração da API (autenticação, RBAC, insumos e tendências, conversão de unidades em receitas, pedidos e calculadora de compras):

```bash
npm test
```
