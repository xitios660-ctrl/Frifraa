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
- `WALLET_ADMIN_KEY`: segredo exclusivo do proprietário para criar/trocar PINs
  em Minha Carteira → Administrar acesso. Consulte em Environment no Render.
- `WALLET_PIN_MARY`, `WALLET_PIN_KAIQUE`, `WALLET_PIN_JHENIFFER`,
  `WALLET_PIN_GUSTAVO`: PINs iniciais diferentes, aleatórios, provisionados no
  Render. O bootstrap cria apenas contas inexistentes; novos deploys jamais
  substituem o PIN já salvo. Se trocar o PIN pela interface, o valor inicial
  no Render não muda e não volta a ter validade.
- `MONGOMS_DISABLE_POSTINSTALL=1`: no build de produção, dispensa baixar o
  MongoDB temporário utilizado só pelos testes de desenvolvimento.

Todas as alterações de depósitos agora exigem a sessão do próprio personagem.
A consulta de progresso continua disponível. Isto impede aumentar moedas de
outra pessoa alterando o nome ou marcando depósitos por uma API desprotegida.
Jogar continua livre de login: somente carteira, compras e depósitos exigem PIN.

Novas coleções: `wallet_accounts` (scrypt com salt, nunca PIN em texto puro),
`wallet_sessions` (tokens aleatórios armazenados só por hash, TTL de 30 dias)
e `wallet_login_limits` (até cinco tentativas por pessoa/endereço a cada
15 minutos, persistidas no banco e com TTL). Cookies HttpOnly, SameSite=Strict,
Secure em produção; validação de origem para mutações. Trocar o PIN revoga
as sessões anteriores. A autorização deriva do token, não do personagem da
requisição. Dados de autenticação não aparecem na API pública de progresso.

### Testes

`npm ci --prefix cofrinho` e `npm test --prefix cofrinho`. Os testes usam um
MongoDB temporário real (mongodb-memory-server), incluindo compras concorrentes,
repetição idempotente, saldo insuficiente, controle de equipamento, sessão,
PIN, integridade dos depósitos e persistência após reiniciar aplicação/conexão.

O proprietário também pode executar `POST /api/wallet/admin/verify`, com
`X-Wallet-Admin` igual a `WALLET_ADMIN_KEY`, para verificar a implantação no Atlas.
Este diagnóstico escreve exclusivamente em quatro coleções temporárias com
prefixo aleatório `qa_<16 hex>_`, remove-as ao terminar e compara hashes dos
campos `saved` dos quatro cofrinhos reais, sem gravar neles. A resposta lista
as verificações. Somente uma execução pode ocorrer por vez. Nunca exponha a
chave do administrador ou inclua valores de PIN em scripts versionados.
