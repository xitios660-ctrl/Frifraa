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
