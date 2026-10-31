# Bomba Party — Arena dos 4 Amigos

Jogo **original inspirado no estilo de batalhas com bombas**, feito para jogar em navegador com **exatamente uma sala de até 4 amigos**. Não distribui ROMs ou assets do jogo comercial.

## Como jogar

1. Abra o site, escolha seu apelido e entre na sala — sem código e sem senha. Se você digitar **Mary**, **Kaique** ou **Jheniffer**, o jogo já sugere a sua skin.
2. Todos abrem o mesmo endereço e tocam em Entrar na sala; não é preciso código.
3. Na sala, cada pessoa pode escolher uma das quatro skins (nenhuma pode ser repetida). O anfitrião inicia quando todos entrarem (ou sozinho para enfrentar três bots).
4. Vire o celular na horizontal para ver apenas a arena. Use o joystick à esquerda e o botão de bomba à direita. No computador, use setas/WASD e espaço.
5. Assim que seu personagem morrer, aparece a mensagem de beber, em qualquer colocação. Toque em Telar jogadores para acompanhar os sobreviventes; o botão com o nome permite alternar entre eles.

## Instalar como aplicativo (PWA)

- **Android/Chrome:** toque em **Instalar** quando o convite aparecer.
- **iPhone/Safari:** abra o menu **Compartilhar** e escolha **Adicionar à Tela de Início**.
- O atalho abre o site em modo aplicativo, sem a barra normal do navegador. As partidas ainda exigem internet.
- O site solicita tela cheia automaticamente **quando você toca em Entrar na sala** e novamente ao iniciar a partida. O jogo ocupa o viewport horizontal sem exigir o botão de tela cheia.
- **Limitação do iPhone:** o Safari não oferece a API de tela cheia para páginas normais; para abrir sem barras, instale o app pela Tela de Início. A rotação da tela pode exigir que a pessoa vire o aparelho e desative o bloqueio de rotação.
- Se a página recarregar, tentará voltar à sala anterior automaticamente; o servidor reserva a sala vazia por até 90 segundos para permitir a reconexão.

## Skins

Há quatro skins personalizadas baseadas nas fotos: **Mary, Kaique, Jheniffer e Gustavo**. Gustavo substitui a vaga temporária de Solar. A seleção é independente da ordem em que os amigos entram na sala.

A skin Gustavo usa o quadro frontal neutro da sua folha como retrato na sala. Ao entrar com o nome Gustavo, a seleção sugere essa skin quando estiver livre.

Os originais gerados foram exportados em PNG RGBA, e a cópia para o site foi otimizada em WebP transparente (320 × 320 px). O script `python scripts/prepare_skins.py nome=imagem.png` permite otimizar novas imagens.

## Instalar e executar

```bash
npm install
npm start
```

Abra `http://localhost:3000`. O servidor usa `PORT` quando definido pelo Render.

## Publicar no Render

- Tipo: Web Service, runtime Node.js
- Build: `npm ci`
- Start: `npm start`
- Plano: Free (o serviço pode adormecer por inatividade)
- Banco de dados: nenhum
- WebSockets no mesmo domínio HTTPS

Salas, mapas e resultados ficam apenas na memória do servidor. Ao reiniciar o processo, são reiniciados. Um serviço único é suficiente; não habilite múltiplas instâncias sem adicionar armazenamento/sincronização compartilhada.

## Recursos

- Uma única sala compartilhada, com entrada pelo apelido e sem código ou senha. Máximo de quatro pessoas; quem chegar durante a rodada aguarda a revanche.
- Limite rigoroso de quatro jogadores na arena inteira.
- Tabuleiro diferente a cada rodada, poderes de alcance, bombas extras e velocidade.
- Bombas com efeito em cruz, caixas destrutíveis e explosões em cadeia.
- Joystick touch e teclado, orientação horizontal, revanche e partidas com bots.

Projeto independente sem associação com os titulares da marca Bomberman.

## Atualização de jogabilidade

O motor existente agora usa posições contínuas e simulação no servidor a 60 Hz,
com estados a aproximadamente 30 Hz. `public/physics.js` compartilha a colisão
entre servidor e navegador; o jogador local recebe resposta imediata e correção
pelos estados autoritativos. Os adversários usam suavização visual. As entradas
são renovadas a cada 250 ms e expiram para evitar movimento preso após perda de
conexão. Bombas continuam na grade e permitem sair, mas bloqueiam o retorno.

As imagens originais das três skins permanecem intactas e continuam na sala e
como fallback durante o carregamento. Na partida, cada personagem personalizado
usa uma nova folha transparente de 16 quadros (frente, dois perfis e costas).
`public/animation.js` mede os limites de cada quadro uma vez para alinhar os pés;
a cadência acompanha a distância percorrida, independentemente da taxa de quadros,
e para ao encostar na parede. Gustavo também tem sua própria folha nas quatro direções, baseada no homem à direita da foto de referência, com camiseta preta e cabelo curto escuro. A renderização respeita a ordem de
profundidade dos jogadores. As folhas `*-walk-v1.png` foram criadas com base nas
imagens originais; os WebPs originais não foram substituídos. O áudio é uma composição sintetizada
original com melodia de partida e vinhetas de vitória/derrota. Requer um toque
para liberar o AudioContext conforme as regras do navegador. O botão SOM permite
silenciar. Não foi incorporada ROM nem áudio comercial.

Validação: `npm test` cobre quatro clientes WebSocket, movimento fracionário,
colisão, bombas, classificação, vencedor, revanche e skins. Para o smoke visual,
com o servidor local ativo e Playwright/Chromium instalados, execute
`node scripts/browser-smoke.cjs`; `BOMBA_CHROME` permite indicar o navegador.
O smoke abre quatro contextos móveis, verifica joystick/bomba, rotação, carregamento das quatro folhas, quatro direções de caminhada, parada dos passos e erros JS.
Testes em aparelhos físicos e a audição humana da trilha continuam necessários.


### Colisões e música

As quinas usam assistência gradual para alinhar o personagem ao corredor aberto,
sem teletransporte para o centro. Ao colocar uma bomba, jogadores que já a
sobrepõem recebem passagem apenas até sair completamente dela. Essa permissão
é sincronizada pelo servidor, e estados atrasados não puxam o jogador de volta
para dentro de uma bomba. As mesmas regras são usadas na previsão local.

A partida tem uma composição original de quatro compassos, com melodia, baixo,
acordes e pulsação, agendada pelo relógio do Web Audio. O primeiro toque/tecla
libera o áudio, inclusive para convidados. SOM silencia e retoma a música; ao
ocultar a página ou terminar a rodada, a trilha para. O navegador pode exigir um
novo toque ao retornar de uma interrupção de áudio no iPhone.


### Sincronização sem saltos

O protocolo atual envia comandos numerados em passos fixos de 1/60 s. O servidor
confirma o último comando aplicado (`ack`); o cliente reconstrói sua previsão a
partir dessa confirmação e reaplica só os comandos pendentes. Estados antigos
não são misturados à posição atual. As bombas respeitam a ordem dos comandos de
movimento. O servidor limita a simulação ao tempo transcorrido; a previsão local
para de avançar após dois segundos sem confirmação. Jogadores remotos usam um
buffer de interpolação de 80 ms, e correções visuais têm velocidade limitada.

`npm test` inclui simulações com RTT de 200, 400 e 800 ms e variação no atraso.
O smoke com quatro navegadores aceita `BOMBA_LATENCY=150` (atraso em cada sentido,
mais até 40 ms de variação) e verifica se o personagem recua ou salta entre quadros
enquanto mantém a direção. Música, skins, bombas e rotação também são verificados.
O comando `move` antigo é aceito pelo servidor para compatibilidade, mas o cliente
atual usa exclusivamente o protocolo `input` com confirmações.

O ZIP fornecido para referência contém uma ROM SNES HiROM de 512 KiB, título
`SUPER BOMBERMAN`, com checksum e complemento válidos. A ROM não foi incluída no
repositório nem distribuída no site. A versão web continua usando o motor original
do Bomba Party para preservar as skins e o multiplayer online.


### Sala única e animação dos objetos

O fluxo público usa `enter`: o servidor cria a sala se ela não existir ou junta o
jogador à mesma sala existente. A interface não solicita nem exibe códigos. O link
compartilhado é o endereço principal. Clientes antigos ainda podem usar o protocolo
de convite, mas não conseguem criar uma segunda sala, nem como anfitrião.

Bombas usam horário de colocação/explosão do servidor para o pulso, pavio que
encurta e faíscas. Explosões se conectam em cruz e apagam ao fim do alcance real.
A destruição emite fragmentos de caixas; impactos nas paredes emitem brilho sem
alterar as colisões. Itens têm aro giratório e partículas ao serem coletados.
Os eventos de efeito são compartilhados e expiram no servidor; a renderização
respeita a validade mesmo quando a rodada já terminou.


### Bots automáticos

Ao iniciar, as vagas livres são preenchidas até quatro participantes: um humano
recebe três bots, dois recebem dois, três recebem um e quatro jogam sem bots.
Os bots usam as skins livres, aparecem com nome “Bot …” e ícone de robô, e são
simulados somente no servidor. Todos veem seus movimentos, bombas e eliminações.

A IA busca caixas, poderes e adversários por caminhos livres. Antes de colocar
uma bomba, calcula uma rota de fuga; evita chamas e antecipa explosões em cadeia.
Usa a mesma velocidade e as mesmas colisões dos humanos. A classificação e a
revanche incluem bots. Entre rodadas, bots cedem suas vagas aos humanos; saindo o
último humano, todos os bots são removidos e a sala fica disponível novamente.

`node scripts/bots-smoke.cjs` verifica um humano + três bots, movimento, bombas,
explosões e limpeza da sala. Usa `BOMBA_BASE` e `BOMBA_CHROME`, como o smoke normal.


### Arena ampliada, mapas e novos poderes

O mundo tem 31 × 21 casas; a janela mantém 15 × 13 casas visíveis e a câmera
acompanha o próprio jogador com uma zona central estável e limites nas bordas.
O minimapa mostra a arena inteira, os jogadores e a área visível. A renderização
principal desenha apenas os blocos dentro da janela, preservando desempenho.
Ao ser eliminado, o jogador acompanha um sobrevivente.

O anfitrião escolhe Arena Clássica, Ruínas da Selva, Palácio de Gelo ou Fábrica Neon,
ou deixa o rodízio automático (padrão). Cada opção tem geometria, densidade de
caixas e cores próprias. Gelo é o tema visual; os controles mantêm a mesma aderência.
Os quatro cantos têm corredores iniciais livres e itens próximos.

Além de alcance, bombas extras e velocidade, há escudo (absorve uma explosão e dá
1,4 s de proteção para sair das chamas), passa-bomba (atravessa bombas, sem atravessar
paredes), chama máxima (alcance 8) e bomba perfurante (atravessa caixas, para nas
paredes). Esses poderes duram a rodada, exceto o escudo consumido no impacto.
A IA considera o alcance e a perfuração ao calcular áreas perigosas. Poderes são
reiniciados na revanche. As viradas nas quinas procuram as duas faixas adjacentes
livres e deslocam o personagem gradualmente, sem alterar sua velocidade nem
teletransportá-lo; testes cobrem voltas repetidas ao redor de um bloco.


### Espera pelo anfitrião e espectador

Entrar na sala não inicia a partida. A sala permanece no lobby sem bots até o
anfitrião tocar em Iniciar; apenas nesse momento o servidor preenche as vagas e
começa a contagem. A revanche também depende do anfitrião.

Toda eliminação de um humano mostra imediatamente “VISH, SE FODEU! VAI TER QUE
BEBER!”, com sua colocação. Telar jogadores fecha o aviso e libera a visão da arena;
o botão no topo alterna entre os sobreviventes (incluindo bots). Se o observado
morrer, a câmera acompanha outro sobrevivente automaticamente. Controles de jogo
ficam desativados para quem morreu. A revanche restaura a câmera e os controles.
`node scripts/spectator-smoke.cjs` testa espera, bloqueio de início por convidados,
eliminação em 4º e 3º lugares, mensagem, alternância de câmera e troca automática.


### Personagem de uma casa e contato com a chama

A colisão de movimento mede exatamente uma casa (48 × 48 px). Os sprites cabem
inteiros nessa casa, com até 44 px de altura, mantendo as proporções originais.
As viradas continuam graduais e o movimento encosta no limite do obstáculo sem
sobrar um espaço fracionário que prenda o personagem ao lado de bombas.

O dano usa a área do corpo dentro do desenho, sem incluir nome, sombra ou brilho.
A chama sólida é definida pelas mesmas formas arredondadas no servidor e no
renderizador: proximidade, brilho e cantos vazios não causam dano. O trajeto de
cada movimento também é verificado para não atravessar fogo entre dois estados.
O escudo continua absorvendo uma explosão conforme a regra do poder.
