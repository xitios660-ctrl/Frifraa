# 🐷 Cofrinho Party — Desafio dos 200 Depósitos

Site independente do Bomba Party para os quatro personagens Mary, Kaique, Jheniffer e Gustavo.

- Cada personagem possui **um documento separado** no MongoDB.
- Cada botão de R$ 1 até R$ 200 pode ser marcado uma única vez por pessoa.
- Meta individual: **R$ 20.100**, total coletivo se todos concluírem: **R$ 80.400**.
- O histórico é guardado no MongoDB, e nunca somente no dispositivo.
- Os pedidos de marcação são idempotentes: clicar novamente para marcar não duplica valores.
- Desmarcações exigem confirmação para evitar perda acidental.
- PWA adaptado para celular, sem conta ou senha, como solicitado.

## Banco de dados isolado

Este serviço **não reutiliza o MongoDB da Ganoh**. Configure o URI do projeto/cluster exclusivo "Bomberman" no Render, com credenciais próprias e permissões restritas ao banco `bomba_party_cofrinho`.

Variáveis necessárias no **novo serviço do Render**:

| Chave | Valor |
| --- | --- |
| `MONGODB_URI` | URI privada do cluster MongoDB **Bomberman**, incluindo usuário e senha, configurada somente nos segredos do Render. |
| `MONGODB_DB` | `bomba_party_cofrinho` |

Não coloque a URI ou credenciais no GitHub ou em mensagens públicas. Não utilize `ganoh_production`.

**Sem MongoDB configurado, a interface abre, mas as marcações ficam bloqueadas**, evitando falsas confirmações e perdas. Quando o MongoDB estiver configurado, todos os dados passam a ser persistidos automaticamente, inclusive em outro celular.

## Render

Serviço Web Node.js novo, separado do jogo. Como este projeto mora na pasta `cofrinho` de um repositório contendo também o jogo:

- Build Command: `npm ci --prefix cofrinho`
- Start Command: `npm start --prefix cofrinho`
- Health Check Path: `/api/health`
- Plano: `free` para grupo de quatro amigos

## Desenvolvimento e testes

```bash
npm install
npm test
npm start
```

Abra `http://localhost:3000`.

## Endpoints

- `GET /api/state` — lista os quatro cofrinhos.
- `POST /api/deposit` — body JSON `{"character":"mary","amount":25,"marked":true}`.
- `GET /api/health` — verificação do servidor.

Este site registra a economia planejada; **não é uma carteira digital, não realiza depósitos reais** e não tem login. Compartilhe o link apenas com o grupo: qualquer pessoa com acesso pode marcar/desmarcar valores.

## Carteira protegida e loja

O único banco permitido pelo servidor é `bomba_party_cofrinho`. A coleção
`cofrinhos` conserva os campos `_id`, `saved`, datas e outros campos anteriores.
O novo campo `wallet` guarda no máximo as oito compras do catálogo e os itens
equipados. Valores reais nunca são abatidos por compras. O servidor deriva as
moedas da soma dos depósitos válidos em `saved`; o custo é determinado pelo
catálogo, nunca pelo navegador. Uma atualização condicional atômica no mesmo
documento verifica saldo, item único e requestId e registra o débito/auditoria.
Assim, a compra serializa inclusive com marcar/desmarcar depósitos, sem janela
entre ler o saldo e gravar a compra. Não exige transação entre coleções.

Desmarcar depósitos pode deixar créditos históricos abaixo dos gastos: o saldo
disponível fica zero, a diferença aparece na carteira e compras anteriores são
preservadas. Novos depósitos cobrem a diferença antes de liberar mais moedas.
A loja não altera a soma de reais nem executa operações financeiras.

### Acesso e configuração no Render

- `WALLET_SERVICE_KEY`: segredo aleatório compartilhado somente com o serviço
  do jogo. Autoriza a troca privada de sessão; nunca é entregue ao navegador.
- `MONGOMS_DISABLE_POSTINSTALL=1`: no build de produção, dispensa baixar o
  MongoDB temporário utilizado só pelos testes de desenvolvimento.

Ninguém precisa informar senha ou PIN. A carteira usa o personagem escolhido
para abrir uma sessão de 30 dias. O progresso e os depósitos de cada um ficam
separados no MongoDB e as compras continuam respeitando o saldo disponível.
Quem tiver acesso ao link também pode acessar e alterar qualquer cofrinho,
pois não há autenticação pessoal. Os antigos hashes de PIN podem permanecer
nos registros legados, mas não são mais consultados.

As sessões permanecem em `wallet_sessions` com tokens armazenados por hash e
cookies HttpOnly, SameSite=Strict e Secure em produção. A validação de origem
continua em vigor. As rotas antigas de administração de PIN foram removidas.

### Testes

`npm ci --prefix cofrinho` e `npm test --prefix cofrinho`. Os testes usam um
MongoDB temporário real (mongodb-memory-server), incluindo compras concorrentes,
repetição idempotente, saldo insuficiente, controle de equipamento, sessão,
seleção sem senha, integridade dos depósitos e persistência após reiniciar
aplicação/conexão. A verificação isolada de carteira ainda pode ser executada
diretamente no ambiente de desenvolvimento; não existe mais rota administrativa pública.

### Compatibilidade com a integração anterior

Os campos anteriores `spentCoins`, `upgrades` e `coinPurchases` permanecem
intactos. Gastos antigos entram no saldo, os níveis já comprados aparecem como
melhorias próprias e o histórico existente continua visível. Níveis antigos
fora do novo catálogo podem ser equipados como compras anteriores. Não há
migração destrutiva, reembolso artificial nem segunda cobrança pelo mesmo
benefício. O cartão de moedas da página do cofrinho usa o mesmo saldo canônico.
A antiga API que identificava carteiras somente pela skin retorna 410 e orienta
abrir Minha Carteira pela interface atual, escolhendo o personagem.
