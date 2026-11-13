# Planejamento do Sistema de Gestão para Confeitaria Artesanal

> **Contexto:** Sistema desenvolvido para apoiar o início das operações de uma confeitaria artesanal familiar (bolos, doces e encomendas), integrando acesso **Web local** e **Aplicativo Android** sobre a mesma base de dados em tempo real.

---

## 1. Pesquisa de Mercado e Boas Práticas de Gestão em Confeitaria

Com base em metodologias recomendadas pelo **Sebrae** e práticas consolidadas de confeitarias artesanais brasileiras, identificou-se que os principais motivos de prejuízo em negócios iniciantes são: precificação por "chute" (ou apenas dobrar o valor do ingrediente), ausência de ficha técnica padronizada, falta de conversão correta entre unidade de compra e unidade de uso, esquecimento de custos invisíveis (embalagens, gás, energia, mão de obra) e descontrole na agenda de encomendas.

### Pilares identificados na pesquisa

1. **Ficha Técnica Padronizada (Receitas)**
   - Toda receita deve registrar: nome, categoria, rendimento (unidades ou peso), tempo de preparo, modo de preparo, ingredientes com quantidade exata em unidades padronizadas (`g`, `kg`, `ml`, `L`, `un`), e embalagens associadas.
   - **Cálculo proporcional:**
     $$\text{Custo do Ingrediente na Receita} = \left(\frac{\text{Preço Pago na Embalagem}}{\text{Tamanho da Embalagem}}\right) \times \text{Quantidade Usada}$$
2. **Precificação Completa (Custos Diretos + Indiretos + Mão de Obra + Margem)**
   - **CMV (Custo da Mercadoria Vendida):** Soma proporcional de ingredientes + embalagens. Na confeitaria artesanal, recomenda-se manter o CMV entre 25% e 35% do preço de venda.
   - **Custos Indiretos / Invisíveis:** Gás, energia elétrica, água e taxa de perda/desperdício (tipicamente 8% a 12% sobre insumos, configurável).
   - **Mão de Obra (Pró-labore):** Tempo de preparo × valor/hora definido pela confeiteira.
   - **Formação do Preço de Venda:** Aplicação de margem de lucro desejada ou multiplicador (Markup), considerando também taxas de cartão/maquininha ou entrega.
3. **Análise de Preços e Tendências de Insumos**
   - Ingredientes essenciais (leite condensado, chocolate nobre, manteiga, creme de leite, ovos, farinha) sofrem forte variação sazonal e inflacionária.
   - Registrar o histórico de preços pagos por compra/fornecedor permite visualizar a **tendência de alta/queda/estabilidade**, comparar fornecedores e alertar automaticamente **quais receitas ficaram mais caras** e precisam de reajuste.
4. **Gestão de Pedidos e Contatos (Encomendas)**
   - Encomendas exigem detalhamento minucioso: dados de contato do cliente (nome, telefone/WhatsApp, endereço), data/hora de entrega ou retirada, descrição criativa (tema, cores, massa, recheio, cobertura, dizeres, alergias/restrições), status produtivo e controle de sinal/entrada + saldo restante.
5. **Planejamento de Compras e Orçamento de Novos Serviços**
   - Antes de aceitar grandes encomendas ou testar novas receitas, a confeiteira precisa saber **exatamente quanto vai gastar** considerando: insumos necessários × estoque atual, embalagens extras, frete/entrega, topo de bolo, ajudante ou aluguel de utensílios.

---

## 2. Arquitetura do Sistema (Web + Android Sincronizados)

Para garantir a regra essencial **"o que aparece em um, deve aparecer no outro"** com responsividade de design e de dados:

```
┌───────────────────────────┐       ┌───────────────────────────────┐
│   Navegador Web / PWA     │       │   Aplicativo Android (APK)    │
│  Desktop / Tablet / Cel   │       │  Capacitor + WebView Nativa   │
└─────────────┬─────────────┘       └──────────────┬────────────────┘
              │  HTTP REST + SSE (Tempo Real)      │
              └─────────────────┬──────────────────┘
                                ▼
              ┌────────────────────────────────────┐
              │   Servidor Unificado (Node/Express)│
              │   - API REST (/api/*)              │
              │   - SSE /api/events (Sync Live)    │
              │   - Frontend SPA Estático          │
              └─────────────────┬──────────────────┘
                                ▼
              ┌────────────────────────────────────┐
              │   Banco de Dados SQLite (WAL)      │
              │   backend/data/confeitaria.db      │
              └────────────────────────────────────┘
```

### Estratégia de Integração Web ↔ Android
- **Backend Único Centralizado:** O comando `./iniciar.sh 8080` inicia o servidor Node.js/Express ligado em `0.0.0.0:8080` (acessível via `localhost` no computador e via IP da rede local Wi-Fi no celular Android).
- **Aplicativo Android via Capacitor + PWA:**
  - O diretório `android/` contém o projeto nativo Android configurado via **Capacitor**, empacotando a mesma interface responsiva mobile-first e conectando-se à API do servidor (com tela dedicada para configurar/testar o IP e porta do servidor local ou remoto).
  - Adicionalmente, o sistema funciona como **PWA instalável** diretamente pelo Chrome no Android.
- **Sincronização em Tempo Real (SSE):**
  - Sempre que um usuário cria, edita ou exclui um insumo, preço, receita, cliente ou pedido em qualquer dispositivo (Web ou Android), o servidor emite um evento via **Server-Sent Events (`/api/events`)**, atualizando automaticamente a tela dos outros dispositivos conectados.

---

## 3. Modelagem de Dados (SQLite)

| Tabela | Responsabilidade |
| :--- | :--- |
| `users` | Cadastro, senha com hash `bcrypt`, papel (`admin`, `confeiteira`, `atendente`, `visualizador`), status ativo/inativo |
| `settings` | Parâmetros globais (nome da confeitaria, valor/hora mão de obra, % custos indiretos, margem padrão, taxa cartão) |
| `ingredients` | Insumos e embalagens (nome, categoria, tipo, unidade de compra, qtd embalagem, preço atual, estoque atual, estoque mínimo, fornecedor) |
| `ingredient_price_history` | Histórico cronológico de preços pagos por insumo/fornecedor (base para tendências e gráficos) |
| `recipes` | Receitas/Fichas técnicas (nome, categoria, rendimento, unidade de rendimento, tempo de preparo, modo de preparo, custos extras, margem alvo) |
| `recipe_items` | Relação N:N entre receitas e insumos com quantidade e unidade usada na receita |
| `customers` | Clientes (nome, telefone/WhatsApp, e-mail, endereço completo, referência, observações) |
| `orders` | Pedidos (cliente, data/hora entrega, entrega/retirada, taxa entrega, desconto, sinal pago, forma pagamento, status, descrição detalhada, restrições) |
| `order_items` | Itens do pedido (receita vinculada ou item avulso, nome, quantidade, preço unitário, custo unitário estimado, observações do item) |
| `simulations` | Simulações salvas na calculadora de gastos (receitas planejadas + serviços extras + custo total estimado) |

---

## 4. Sistema de Cadastro, Login e Níveis de Acesso (RBAC)

- Autenticação via **JWT** com assinatura armazenada em `.env` (`JWT_SECRET`) e senhas protegidas com **bcryptjs**.
- **Níveis de acesso:**
  1. **`admin` (Proprietária / Gerente):** Controle total — usuários, níveis de acesso, parâmetros financeiros, exclusões, relatórios, receitas, insumos e pedidos.
  2. **`confeiteira` (Produção):** Gerencia insumos, registra preços/compras, cria/edita receitas, gerencia produção de pedidos, usa calculadora e lista de compras.
  3. **`atendente` (Atendimento / Vendas):** Cadastra clientes, anota e acompanha pedidos, consulta catálogo de produtos e gera orçamentos (sem acesso à gestão de equipe/configurações financeiras sensíveis).
  4. **`visualizador` (Consulta):** Acesso somente leitura a agenda de pedidos e catálogo de receitas/preços (nível padrão seguro para novos cadastros públicos até aprovação da administradora).

---

## 5. Módulos Funcionais Planejados

1. **Painel Inicial (Dashboard):** Indicadores de faturamento previsto, pedidos do dia/semana, alertas de estoque baixo e alertas de ingredientes com alta de preço afetando receitas.
2. **Insumos & Tendência de Preços:** Cadastro de ingredientes e embalagens, registro de novas compras/preços, gráfico de evolução temporal, variação percentual, tendência (`Subindo`, `Estável`, `Caindo`) e impacto direto no custo das receitas.
3. **Receitas & Fichas Técnicas:** Editor intuitivo com conversão automática (`kg ↔ g`, `L ↔ ml`, `un/cx/pct`), cálculo em tempo real de CMV, custos indiretos, mão de obra, preço sugerido e lucro, além de duplicação rápida de receitas.
4. **Pedidos & Clientes:** Ficha completa de contato (com atalho direto para WhatsApp), agenda de entregas, fluxo de status (`Orçamento` → `Confirmado` → `Em Produção` → `Pronto` → `Entregue`), controle de sinal/saldo e resumo copiável para enviar ao cliente.
5. **Calculadora de Gastos & Serviços:** Simulação combinando múltiplas receitas (ou pedidos pendentes) + serviços adicionais (entrega, topo de bolo, embalagem especial, ajudante, gás extra), gerando lista de compras descontando o estoque e estimativa exata de desembolso.
6. **Equipe & Configurações (`admin`):** Gestão de usuários, papéis de acesso e parâmetros de precificação da confeitaria.

---

## 6. Segurança e Execução

- Dados sensíveis (`JWT_SECRET`, `ADMIN_PASSWORD`, `DB_PATH`, configurações) isolados em `.env` e protegidos por `.gitignore`.
- Inicialização simplificada via `./iniciar.sh <PORTA>` (ex.: `./iniciar.sh 8080`), validando porta, preparando dependências/build quando necessário e exibindo os endereços local e da rede Wi-Fi para conexão imediata do Android.
