# Bomberman Arena Online

Jogo **original inspirado no estilo de batalhas com bombas**, feito para jogar em navegador com até 4 pessoas por sala. Não distribui ROMs ou assets do jogo comercial.

## Como jogar

1. Abra o site, escolha seu apelido e crie uma sala.
2. Compartilhe o link ou o código de cinco letras com até três amigos.
3. O anfitrião inicia quando todos entrarem (ou sozinho para treinar).
4. Use as setas/WASD e espaço no computador, ou os botões na tela do celular.

## Instalar e executar

```bash
npm install
npm start
```

Abra `http://localhost:3000`. O servidor usa `PORT` quando definido pelo Render.

## Publicar no Render

- Tipo: Web Service, runtime Node.js
- Build: `npm install`
- Start: `npm start`
- Plano: Free (o serviço pode adormecer por inatividade)
- Banco de dados: nenhum
- WebSockets no mesmo domínio HTTPS

Salas, mapas e resultados ficam apenas na memória do servidor. Ao reiniciar o processo, são reiniciados. Um serviço único é suficiente; não habilite múltiplas instâncias sem adicionar armazenamento/sincronização compartilhada.

## Recursos

- Salas privadas por código e convite por URL.
- Limite rigoroso de quatro jogadores por sala.
- Tabuleiro diferente a cada rodada, poderes de alcance, bombas extras e velocidade.
- Bombas com efeito em cruz, caixas destrutíveis e explosões em cadeia.
- Botões touch e teclado, reconexão básica, revanche e treino solo.

Projeto independente sem associação com os titulares da marca Bomberman.
