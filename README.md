# Bomba Party — Arena dos 4 Amigos

Jogo **original inspirado no estilo de batalhas com bombas**, feito para jogar em navegador com **exatamente uma sala privada de até 4 amigos**. Não distribui ROMs ou assets do jogo comercial.

## Como jogar

1. Abra o site, escolha seu apelido, digite a senha privada e crie uma sala.
2. Compartilhe o link ou o código de cinco letras com até três amigos, passando a senha em separado.
3. O anfitrião inicia quando todos entrarem (ou sozinho para treinar).
4. Vire o celular na horizontal para ver apenas a arena. Use o joystick à esquerda e o botão de bomba à direita. No computador, use setas/WASD e espaço.
5. O primeiro eliminado fica em último e recebe a mensagem brincalhona de bebida na própria tela.

## Instalar como aplicativo (PWA)

- **Android/Chrome:** toque em **Instalar** quando o convite aparecer.
- **iPhone/Safari:** abra o menu **Compartilhar** e escolha **Adicionar à Tela de Início**.
- O atalho abre o site em modo aplicativo, sem a barra normal do navegador. As partidas ainda exigem internet.
- Em navegadores que permitem, o início da partida solicita tela cheia e rotação horizontal; caso contrário, aparece um aviso para virar manualmente o aparelho.

## Skins

Existem quatro skins originais: **Mística, Rubi, Cyber e Solar**, uma por posição na arena. Para criar versões personalizadas futuramente, envie uma foto nítida de cada pessoa, preferencialmente de corpo inteiro, em pé, de frente, com rosto bem visível, iluminação uniforme e fundo simples. Fotos em **JPG, PNG ou HEIC** servem como referência; o resultado para o jogo será exportado em **PNG com transparência**, sem usar imagens de outros jogos.

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
- Variável secreta obrigatória no Render: `GAME_PIN` (senha privada compartilhada entre os 4 amigos)
- Plano: Free (o serviço pode adormecer por inatividade)
- Banco de dados: nenhum
- WebSockets no mesmo domínio HTTPS

Salas, mapas e resultados ficam apenas na memória do servidor. Ao reiniciar o processo, são reiniciados. Um serviço único é suficiente; não habilite múltiplas instâncias sem adicionar armazenamento/sincronização compartilhada.

## Recursos

- Uma única sala privada por vez, com senha configurada no servidor e convite por URL.
- Limite rigoroso de quatro jogadores na arena inteira.
- Tabuleiro diferente a cada rodada, poderes de alcance, bombas extras e velocidade.
- Bombas com efeito em cruz, caixas destrutíveis e explosões em cadeia.
- Joystick touch e teclado, orientação horizontal, revanche e treino solo.

Projeto independente sem associação com os titulares da marca Bomberman.
