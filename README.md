# Bomba Party — Arena dos 4 Amigos

Jogo **original inspirado no estilo de batalhas com bombas**, feito para jogar em navegador com **exatamente uma sala de até 4 amigos**. Não distribui ROMs ou assets do jogo comercial.

## Como jogar

1. Abra o site, escolha **Mary**, **Kaique**, **Jheniffer** ou **Gustavo** e entre na sala — sem nome, código ou senha. Personagens ocupados ficam marcados como em uso.
2. Todos abrem o mesmo endereço e tocam em Entrar na sala; não é preciso código.
3. Na sala, cada pessoa pode escolher uma das quatro skins (nenhuma pode ser repetida). O anfitrião escolhe se quer completar vagas com bots (opção desativada por padrão) e toca em Iniciar quando quiser.
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

- Uma única sala compartilhada, com entrada pelo personagem e sem nome, código ou senha. Máximo de quatro pessoas; quem chegar durante a rodada aguarda a revanche.
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

O fluxo público usa `enter` com `skinIndex`: o servidor cria a sala se ela não existir ou junta o
jogador à mesma sala existente. A interface não solicita nem exibe códigos. O link
compartilhado é o endereço principal. Clientes antigos ainda podem usar o protocolo
de convite, mas não conseguem criar uma segunda sala, nem como anfitrião.

Bombas usam horário de colocação/explosão do servidor para o pulso, pavio que
encurta e faíscas. Explosões se conectam em cruz e apagam ao fim do alcance real.
A destruição emite fragmentos de caixas; impactos nas paredes emitem brilho sem
alterar as colisões. Itens têm aro giratório e partículas ao serem coletados.
Os eventos de efeito são compartilhados e expiram no servidor; a renderização
respeita a validade mesmo quando a rodada já terminou.


### Bots opcionais

Somente se o anfitrião ativar “Completar vagas com bots de IA”, as vagas livres
são preenchidas ao tocar em Iniciar: um humano recebe três bots, dois recebem
dois e três recebem um. A opção começa desativada. Sem ela, jogam somente os
humanos conectados; uma pessoa pode iniciar um treino sozinha.
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
1,4 s de proteção para sair das chamas), empurrar bomba uma casa, fogo dourado
raro (+5 de alcance) e bomba perfurante (atravessa caixas, para nas paredes). Esses poderes duram a rodada, exceto o escudo consumido no impacto.
A IA considera o alcance e a perfuração ao calcular áreas perigosas. Poderes são
reiniciados na revanche. As viradas nas quinas procuram as duas faixas adjacentes
livres e deslocam o personagem gradualmente, sem alterar sua velocidade nem
teletransportá-lo; testes cobrem voltas repetidas ao redor de um bloco.


### Espera pelo anfitrião e espectador

Entrar na sala não inicia a partida. A sala permanece no lobby sem bots até o
anfitrião tocar em Iniciar; apenas nesse momento o servidor preenche vagas se
a opção de bots estiver ativada e começa a contagem. A revanche também depende do anfitrião.

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


### Movimento por centros de casas

O deslocamento mantém uma coordenada alinhada ao centro da faixa. Viradas entre
casas ficam pendentes até uma junção livre, e reversões respondem imediatamente.
Os segmentos terminam exatamente nos centros; não há busca binária contra paredes
nem zonas fracionárias em que o personagem fique preso. A interpolação visual
segue o mesmo trajeto em L nas curvas, sem cortar diagonalmente os blocos.

O joystick mantém a direção com pequenas oscilações perto da diagonal, mudando
quando o gesto é intencional. Perda de foco, cancelamento do toque e eliminação
liberam a captura e recentralizam o controle. A suíte inclui os desvios mínimos que
reproduziam o travamento, 16 mil mudanças rápidas e todas as junções abertas dos
quatro mapas, além da repetição com confirmações de rede atrasadas.


### Entrada só com personagem

A tela inicial oferece as quatro skins; não há campo de nome. O servidor associa
o nome ao personagem e impede escolhas duplicadas. A disponibilidade é enviada
na conexão e atualizada quando alguém entra, sai ou muda de skin. Uma vaga livre
pode ser escolhida mesmo com outro anfitrião na sala. Pedidos antigos de criar ou
entrar por convite são encaminhados à mesma sala, sem erro de anfitrião existente.
A primeira pessoa continua responsável por iniciar a partida e escolher o mapa.


### Joystick e dois dedos

O joystick mantém um único dedo responsável pelo movimento. Eventos na janela
acompanham o arrasto fora do círculo mesmo se a captura do navegador falhar ou
for perdida. Outro dedo pode soltar uma bomba sem interromper o movimento. Soltar,
cancelar, girar a tela ou sair do aplicativo recentraliza o controle e envia parada.
A zona neutra usa limites diferentes para iniciar e parar, evitando oscilações;
o deslocamento visual do botão acompanha o tamanho real do controle.

`node --test test/joystick.test.js` cobre captura, cancelamento, segundo dedo,
foco e direções. `node scripts/joystick-smoke.cjs` exercita toques simultâneos
no Chromium móvel, arrasto externo, captura perdida ou indisponível, bomba,
soltura e novo gesto. Use `BOMBA_BASE` para o endereço e `BOMBA_CHROME` para
o executável Chromium, se necessário. Isso não substitui teste em iPhone físico.


### Fechamento da arena e arte dos poderes

A contagem de 90 segundos começa depois dos três segundos de preparação. O HUD
mostra o tempo; ao terminar, paredes permanentes caem a cada 350 ms em espiral
das bordas até a faixa central. Pilares existentes são preservados. Cada casa
recebe um aviso de 900 ms, sombra e animação de queda antes da colisão. O impacto
elimina quem estiver sobreposto à casa, inclusive com escudo, remove bombas e
itens, e mantém a classificação e o modo espectador. O servidor controla o tempo
e envia as quedas aos quatro clientes. Bots antecipam essas casas como perigo
permanente. A revanche restaura mapa e temporizador.

Os nove poderes usam nove skins 3D pré-renderizadas, baseadas na referência
do usuário, no atlas transparente `public/items/powerups-3d-v1.png`. A animação
em `public/items.js` combina perspectiva suave, flutuação, sombras, reflexos
mascarados pelo contorno e movimentos próprios de cada skin, sincronizados
pelo relógio da partida. O coração pulsa, a luva golpeia, o patins oscila com
rastro, as chamas soltam brasas, a bomba acende o visor e a caveira pulsa os olhos.
Cada arte agora corresponde a um efeito: bomba colorida para empurrar bombas,
tanques para perfuração, caveira para lentidão temporária, luva para chute, além
de bomba extra, alcance, velocidade, fogo dourado +5 e escudo. A identidade
do item vem no estado do servidor. Fogo destrói imediatamente itens expostos, com partículas; itens
revelados por caixas aparecem depois que a chama daquela casa termina.

`node scripts/collapse-smoke.cjs` inicia um servidor local e quatro navegadores
móveis reais, avança o relógio apenas nesse processo de teste e verifica
contagem, aviso, impacto, morte, classificação, espectador e queima dos itens.
Não existe comando de acelerar tempo exposto no servidor publicado. Capturas
de tela são salvas em `/tmp/bomba-items-mobile.png` e
`/tmp/bomba-collapse-mobile.png`. Os testes de regras ficam em
`test/collapse.test.js` e `test/item-fire.test.js`.

`node scripts/item-art-smoke.cjs` verifica as nove skins com transparência,
quadros animados distintos e reprodução idêntica no mesmo instante; salva a
prévia em `/tmp/bomba-3d-items-preview.png`. O teste não modifica a partida.


### Caveira e luva como poderes próprios

A caveira reduz a velocidade de movimento para 62,5% durante seis segundos.
Coletar outra renova o prazo. Bônus de velocidade são preservados, inclusive
quando coletados durante a lentidão, e voltam a valer normalmente ao terminar.
O HUD mostra os segundos restantes e o personagem recebe um indicador violeta.
Bots evitam procurar caveiras. Uma caveira fica na região central e ambas as
novidades também podem surgir de caixas; a luva participa da rotação dos itens
perto dos pontos iniciais. Fogo destrói esses itens como os demais.

Com a luva, andar diretamente contra uma bomba livre e alinhada inicia um chute.
A bomba percorre o corredor, com animação interpolada e passos de 100 ms, até
encontrar parede, caixa, outra bomba ou jogador. A origem e o destino de cada
passo ficam reservados para impedir cruzamentos durante o movimento. Não é
possível chutar uma bomba ocupada por um jogador. O pavio, o dono e a regra de
eliminações permanecem os originais. Reações em cadeia e paredes caindo também
afetam bombas em movimento. Se possuir empurrão e luva, prevalece o chute contínuo. Nenhum poder permite
atravessar bombas. O dono só conserva a saída inicial da bomba recém-colocada;
a permissão é revogada assim que ele sai.

O servidor controla os chutes em `bomb-motion.js`; os clientes recebem a direção
e os horários do deslocamento. Bots consideram o trajeto e as futuras explosões.
A revanche limpa luva e lentidão. `test/kick.test.js` e
`test/skull-glove.test.js` cobrem colisões, duração, bônus, reações em cadeia e
reinício. `node scripts/powers-smoke.cjs` testa coleta, chute, animação, parada,
pavio, explosão, lentidão e recuperação com quatro navegadores móveis reais
contra um servidor local. Não há comando de teste exposto na versão publicada.


### Balanceamento e bots com falas

Bombas extras e alcance não têm teto de coleta. Cada chama comum soma 1 e a
chama dourada soma 5, inclusive acima do alcance antigo. Ouro tem peso 1/100
entre os itens revelados, contra 24/100 da chama comum, e não nasce nos pontos
iniciais. Uma caixa ainda tem 25% de chance de revelar algum item: ouro equivale
a 0,25% das caixas. O bônus de velocidade reduz 5 ms do tempo por casa, de
170 até 150 ms (cerca de 13,3% de ganho máximo). A caveira só causa lentidão
temporária. A skin colorida agora empurra a bomba uma casa, com a mesma regra
de colisão e de pavio da luva. Colisões ignoram até a antiga flag passa-bomba.

`bot-minds.js` mantém intenção, personalidade, memória, alvo, parceiro e
relações separadas para cada bot. A navegação local continua desviando do fogo
e de paredes caindo; a intenção influencia busca de itens, ataque e abertura de
caixas. Amigos não são alvos intencionais e bombas não são plantadas
deliberadamente sobre seu parceiro. Ameaças com bombas podem romper tréguas.
Quando só restam aliados vivos, a trégua termina para a disputa continuar.
Balões exibem falas ficcionais ou resumos de intenção, nunca raciocínio interno
de modelos. As mensagens e alianças são sincronizadas pelo servidor.

**Estado padrão: IA local, sem chamadas externas.** A API do Grok exige chave
e acesso/créditos de acordo com a xAI; o aplicativo não promete API gratuita.
Para habilitar conscientemente o provedor, configure no mesmo serviço Render:

- `XAI_API_KEY`: chave da sua conta xAI (nunca no repositório ou no cliente).
- `BOT_AI_PROVIDER=grok`: ativa as consultas; `local` desativa.
- `XAI_MODEL=grok-4.7`: opcional, substitua por um modelo disponível na conta.

Cada bot envia uma solicitação própria, com seu contexto, sua memória e as falas
públicas recentes da partida. Não há sessão de modelo compartilhada entre bots.
Planos aceitos alteram apenas intenção, alvos, relações e fala; movimento e
segurança continuam sob as regras do jogo. As consultas não bloqueiam os ticks:
timeout de 2,5 segundos, intervalo mínimo de 10 segundos e no máximo 12 por bot
por rodada. Falhas, falta de créditos e limites mantêm a IA local. Revanche,
saída e fim de partida cancelam respostas antigas. `/health` informa o provedor
e o estado da integração sem expor a chave. Os testes do conector usam respostas
simuladas: não comprovam autenticação, créditos ou disponibilidade do Grok real.

`test/balance.test.js` cobre raridade, crescimento sem teto, empurrão e velocidade.
`test/bot-minds.test.js` cobre contextos independentes, alianças, traição, planos
inválidos e falhas do provedor. `node scripts/social-bots-smoke.cjs` testa um
humano com três bots autônomos, balões, amizade e espectador no navegador móvel.
A captura fica em `/tmp/bomba-bot-balloons-mobile.png`.


### Gemini para os bots

O mesmo controlador aceita `BOT_AI_PROVIDER=gemini`, `GEMINI_API_KEY` e
`GEMINI_MODEL=gemini-3.1-flash-lite`. A chave fica somente no servidor e segue
no cabeçalho `x-goog-api-key`, nunca na URL, no cliente ou no repositório.
O modelo tem uma faixa gratuita documentada pelo Google, sujeita às cotas e
ao plano da conta; o projeto não ativa faturamento ou migra automaticamente
para modelos pagos.

Cada bot envia seu próprio contexto e recebe uma intenção/fala estruturada em
JSON. O motor local continua responsável pelo movimento e pela segurança.
Para Gemini, o aplicativo limita o conjunto dos bots a 4 consultas por minuto
e 60 por dia UTC por processo, com até 4 por bot em cada rodada e um intervalo
de 60 segundos entre consultas daquele bot. Esses contadores sobrevivem a
revanche e troca de sala no mesmo processo; reiniciar o serviço reinicia os
contadores locais. As cotas do Google continuam valendo independentemente deles.
Timeout de 12 segundos, erros e cota esgotada preservam as decisões locais.
Não há troca automática para Grok.

`bot-providers.js` implementa os protocolos Gemini/Grok e o limite compartilhado.
`test/gemini.test.js` valida isolamento de contextos, formato das respostas,
limites e fallback. `/health` informa também a quantidade de respostas aceitas
e a data da última resposta, sem credenciais. `scripts/live-gemini-smoke.cjs`
é uma verificação opcional contra a API real: inicia uma partida, confirma
respostas Gemini de três bots e uma fala desenhada na tela móvel. Ela consome
consultas da conta configurada. Captura em `/tmp/bomba-gemini-live-mobile.png`.


### Jogadores sólidos e ordens de movimento da IA

Personagens vivos bloqueiam o espaço do corpo e reservam a próxima casa durante
um passo. Humanos e bots usam a mesma verificação no servidor, na previsão do
cliente e na repetição de comandos confirmados. Mortos não bloqueiam casas.
Bombas chutadas ou empurradas também respeitam reservas de personagens. Não há
teletransporte para separar personagens: o movimento é impedido antes da colisão.
A revanche limpa as reservas.

O Gemini pode escolher `destination: {x,y}` e `bombMode` (`auto`, `hold`, `attack`
ou `break`), além de objetivo, adversário e aliado. Um destino ocupado, reservado,
fora do mapa ou dentro de parede é rejeitado. O navegador local de rotas executa
a ordem com a velocidade normal, contorna pessoas e continua priorizando a fuga
de explosões. A ordem de destino/bomba vale por até 20 segundos; o objetivo
estratégico continua até a próxima decisão. Os limites da API e o fallback local
continuam os mesmos. `botPlan` no estado permite verificar a origem e as ordens
aplicadas sem expor prompts ou credenciais.

Os bots acompanham casas recentes, replanejam quando bloqueados e deixam de
preferir ficar parados ou oscilar entre duas casas quando existe uma rota segura.
Proteger um aliado não autoriza ocupar a casa dele.

`test/player-collision.test.js` cobre disputa da mesma casa, cruzamentos, 20 mil
comandos, previsão com confirmação atrasada, desvio de pessoas, destino/política
de bombas da IA e quatro bots escolhendo um único destino.
`node scripts/solid-players-smoke.cjs` testa quatro navegadores móveis disputando
uma casa com atraso de rede; as posições e o mapa controlados existem apenas
no processo de teste. O smoke Gemini real também verifica as ordens recebidas
e a ausência de sobreposição nos estados da partida.


### Escolha de bots e início manual

`botsEnabled` começa falso em cada sala. Apenas o anfitrião pode alterar essa
opção, no lobby ou no resultado antes da revanche. Alterar a opção não cria
bots nem dispara a contagem. Apenas um pedido de Iniciar do anfitrião começa
a rodada. Sem bots, a quantidade de participantes é a de humanos conectados;
com bots, o servidor completa até quatro. Não há reposição automática durante
a partida. A opção também aparece no resultado para o anfitrião escolher a
próxima rodada, que sempre exige tocar em Jogar novamente.

Ao trocar de anfitrião ou esvaziar a sala, a autorização de bots volta a falso.
Uma rodada já autorizada continua até terminar; o novo anfitrião escolhe os
bots da próxima. A configuração é validada no servidor mesmo se um convidado
tentar enviar mensagens diretas. Sem bots, não são feitas consultas de IA.

`test/host-start.test.js` testa padrão desativado, lobby sem início automático,
permissões, revanche, troca de anfitrião e treino solo.
`node scripts/host-options-smoke.cjs` verifica as mesmas escolhas na interface
móvel com dois jogadores reais: partida sem bots e revanche manual com bots.
A captura é salva em `/tmp/bomba-host-options-mobile.png`. Os smokes específicos
de bots agora ativam a opção explicitamente antes de iniciar.

### Carteira, cofrinho e loja permanente

O jogo consulta o serviço existente do cofrinho por HTTPS, configurado em
`COFRINHO_URL` (padrão: https://cofrinho-bomba-party.onrender.com). Configure
`WALLET_SERVICE_KEY` com o mesmo segredo nos dois serviços. O jogo não recebe
credenciais do MongoDB e não acessa outros bancos. A identidade da carteira vem
exclusivamente de uma sessão autenticada por PIN no cofrinho; trocar a skin ou
forjar um personagem na compra não concede acesso à carteira de outra pessoa.

`Minha Carteira` funciona na entrada e no lobby. O cookie de sessão é HttpOnly,
SameSite=Strict e Secure em HTTPS. O vínculo ao WebSocket exige um segredo
individual entregue somente no hello daquela conexão. Na hora de iniciar, o
servidor consulta novamente as melhorias equipadas e valida sua correspondência
com a skin; bots e pessoas sem carteira usam os atributos padrão. Falha ao
consultar uma carteira autenticada impede o início até tentar novamente ou sair
da carteira, sem retirar silenciosamente uma vantagem comprada. Só o anfitrião
inicia a rodada e escolhe se haverá bots.

As oito melhorias são permanentes, sem repetição de compras, e o equipamento
é opcional: um nível por categoria. Corações no mapa sobem vidas até 5; sem
melhorias equipadas, todos começam com vida 1, fogo 1 e velocidade 1. Velocidade
é limitada a 3 (170/160/150 ms por casa), bombas e fogo coletados não têm teto;
fogo dourado raro acrescenta 5. Nenhum poder atravessa caixas. Explosões
simultâneas usam uma cópia imutável do mapa e fragmentam caixas com fogo por
500 ms. A proteção breve de reaparecimento não deixa o corpo dentro de uma
parede em queda. Sequências de comandos descartadas são confirmadas e a
previsão reinicia a partir da confirmação, evitando travar depois de perder vida.

Validação: `npm test`; para integração entre as duas branches já existentes,
instale as dependências de desenvolvimento do cofrinho e execute:

```sh
COFRINHO_PROJECT=/caminho/do/worktree/cofrinho \
BOMBA_CHROME=/caminho/do/chromium \
node scripts/commerce-e2e.cjs
```

Esse teste inicia MongoDB temporário e os dois serviços localmente, compra e
equipa melhorias por interface, testa quatro navegadores móveis, atualização
por outro dispositivo e persistência após reiniciar o serviço do cofrinho.
Não usa contas, depósitos ou credenciais de produção. Os testes de latência
preservam a ordem das mensagens, assim como o WebSocket real.
