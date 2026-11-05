# TV DO GUH AI — assistência temporária

O controle continua sendo um app Android TV com APIs públicas, um relay HTTPS e um site pareado. Não há modelo de IA nem agente autônomo executando no servidor. O assistente desta conversa pode usar a API enquanto estiver atendendo, após o dono fornecer um código de assistência criado pelo iPhone já pareado.

## Fluxo de assistência

1. O dono instala a versão 1.2.0, habilita Acessibilidade e pareia o iPhone.
2. Na TV, autoriza o diagnóstico de apps e/ou as capturas por dez minutos. Acesso ao uso é opcional e necessário para medir dados e cache de outros apps.
3. No site, escolhe Gerar código de assistência e aceita o aviso de controle temporário. O código de 48 bits expira em cinco minutos e só pode ser resgatado uma vez. Uma nova geração revoga os códigos e sessões de assistência anteriores.
4. O dono envia o código somente neste chat. O assistente usa `POST /support/redeem` com JSON `{ "code": "CODIGO" }` no bridge `https://tv-do-guh-bridge.onrender.com`. A resposta contém um token de 256 bits com validade de cinco minutos a partir do resgate. Não imprimir ou compartilhar esse token; não colocá-lo em URL, repositório ou logs.
5. Usar o token no cabeçalho `Authorization: Bearer ...`. `GET /status` informa se a TV está online e o resultado dos comandos. `POST /command` recebe `{ "command": "DIAGNOSE" }` ou `SCREENSHOT`, que exigem a autorização temporária da TV. Guardar o ID e aguardar o resultado: uma resposta 202 indica apenas fila, não execução.
6. Após confirmação, `GET /diagnostic` retorna o relatório, ou `GET /screenshot` retorna JPEG em data URL. A captura expira em 60 segundos e o relatório em dez minutos. Para inspecionar a imagem, decodificar em arquivo local sem imprimir base64 no chat e usar a ferramenta de visualização de imagens. Confirmar que o ID do relatório/captura corresponde ao pedido atual.
7. Navegação, volume, mídia e abrir YouTube/Netflix usam os comandos documentados no código. `APP_SETTINGS` exige pacote presente no relatório atual, no campo `package`; apenas solicita a tela oficial de detalhes. `STORAGE_SETTINGS` solicita a tela de armazenamento.
8. A assistência não pode solicitar `REQUEST_UNINSTALL`, gerar novos códigos nem desconectar o pareamento principal. A navegação ainda pode interagir com telas do Android; isso não é isolamento absoluto de efeitos. Não confirmar ações destrutivas ou mudanças não autorizadas. Não afirmar que apagou, desinstalou ou acelerou a TV sem evidência real. Usar capturas e um diagnóstico atualizado para verificar resultados, quando disponíveis.
9. O dono pode revogar em `/support` com `{ "action": "cancel" }` usando o token principal do iPhone. Comandos ainda não entregues são descartados na expiração/revogação. Ações já entregues à TV podem terminar. A sessão nunca continua fora do atendimento ativo por iniciativa do assistente.

## Diagnóstico e limpeza

Lista apenas apps com atividades Launcher/Leanback visíveis ao Android, até 100 e com coleta limitada no tempo. Não solicita QUERY_ALL_PACKAGES, root, ADB nem privilégios de sistema. A lista pode ser parcial. Sem Acesso ao uso, o tamanho permanece desconhecido. Com acesso, usa StorageStatsManager; total = appBytes + dataBytes, pois cache já está incluído em dataBytes. RAM é um retrato do sistema, não uma classificação de CPU ou consumo de cada app. Espaço ocupado não comprova lentidão.

O pedido de texto “limpa os aplicativos” inicia DIAGNOSE e não apaga nada. Limpar cache, forçar parada e apagar dados só pelas telas oficiais, com escolha consciente do dono. A solicitação de desinstalação no iPhone exige confirmação explícita e é bloqueada para apps do sistema e o próprio bridge; o Android ainda apresenta sua confirmação na TV. Não há limpeza silenciosa, desinstalação automática nem alegação de ganho de desempenho.

Todas as sessões e relatórios ficam em memória numa única instância. Reinício exige novo pareamento. Testes de transporte e WebKit usam dispositivos simulados; APIs e telas reais da TCL dependem de teste físico.

## Alterações da versão 1.4.0 (substituem os prazos de sessão anteriores)

A pedido do proprietário, o pareamento principal e o acesso de assistência resgatado não expiram por tempo. Continuam autenticados e revogáveis. O código de convite mantém validade de cinco minutos e uso único; não é necessário gerar códigos durante uma assistência já conectada. Gerar outro convite revoga as assistências anteriores. Não há agente executando fora do atendimento ativo.

As identidades e hashes de tokens/segredos são gravados atomicamente em arquivo local de modo 0600 (`TV_STATE_PATH`, padrão `.data/identities.json`), sem imagens, relatórios, filas ou tokens em texto puro. Isso permite reiniciar o processo usando o mesmo sistema de arquivos sem perder o pareamento. **O sistema de arquivos padrão do Render não é um disco persistente: um deploy ou substituição da instância pode perder esse arquivo e exigir novo pareamento.** Configure TV_STATE_PATH em um volume persistente para sobreviver a essas operações. Nenhum recurso pago foi criado automaticamente. A revogação é salva imediatamente.

### Caminho rápido para controle com visão

A TV faz long-poll de até dez segundos e o servidor acorda essa requisição assim que há um comando. Foi removida a pausa de 1,2 segundo entre entrega e confirmação. Capturas têm intervalo mínimo de 300 ms, em vez de cinco segundos. Não há transmissão contínua de imagens; o compartilhamento local continua sujeito à autorização do Android.

`POST /command` pode receber `{ "command": "OPEN_APP", "package": "br.com.saimo.tv", "observe": true }`. OPEN_APP usa apenas o launcher público de um pacote com interface visível no Android, sem injeção de intents arbitrários. A TV valida o pacote antes de abrir. Isso evita navegar toda a lista de favoritos. Os comandos existentes também aceitam observe=true, exceto SCREENSHOT e DIAGNOSE.

A resposta contém id e observationId. O servidor entrega a ação, aguarda sua confirmação e só então entrega a captura dependente. Se a ação falhar ou a autorização for revogada, a captura dependente não é executada. `POST /wait` com `{ "id": "observationId", "timeoutMs": 12000 }` aguarda o evento e retorna actionResult, result e image (JPEG em data URL) apenas se houver uma captura correspondente. Valida a autorização novamente antes de responder. Não considere a ação visualmente verificada até inspecionar a imagem retornada.

O cliente `tools/assist.py` usa esse caminho, guarda o token em arquivo local 0600 e escreve a imagem sem imprimir base64 ou credenciais. Exemplos: `python3 tv-bridge/tools/assist.py redeem CODIGO`, depois `python3 tv-bridge/tools/assist.py act OPEN_APP br.com.saimo.tv`. Use a ferramenta de visualização sobre imagePath retornado. O tempo reportado mede transporte completo nessa execução; não é garantia de latência para a TCL.

O site mantém o token do iPhone em localStorage (com fallback em sessionStorage quando o navegador bloquear persistência), para preservar o pareamento ao fechar e abrir a aba. Desconectar remove o token dos dois locais. Limpar os dados do Safari ou usar navegação privada pode exigir parear novamente.

## Digitação planejada (1.5.0)

TYPE_TEXT envia o texto completo (1–80 caracteres, sem controles) para o campo editável atualmente focado usando ACTION_SET_TEXT. Campos marcados como senha são recusados. O Android confere o valor final antes de confirmar. Não procura campos arbitrários em outras telas nem injeta teclas por APIs privadas.

SAIMO_TEXT é limitado ao pacote br.com.saimo.tv e ao teclado de busca acessível conhecido. O plano inteiro é calculado e validado antes de qualquer alteração: Limpar, depois cada letra/número/espaço do nome normalizado (até 40 caracteres). O serviço localiza o menor contêiner acessível com as teclas esperadas, clica nos controles por seus rótulos e interrompe se o app ou o teclado mudar. Não há viagens ao servidor nem screenshots entre as teclas. Ao final tenta confirmar o texto na caixa de busca acima do teclado; sem confirmação não declara sucesso. A compatibilidade dessa execução local com o Saimo instalado ainda precisa de teste físico. Não há promessa de funcionar em qualquer teclado de TV.

Exemplo durante atendimento: depois de abrir e conferir a tela de busca, `python3 tv-bridge/tools/assist.py act SAIMO_TEXT 'Os Simpsons'`. O cliente envia um comando com o nome completo e observe=true; a captura final só é solicitada após sucesso. Se houver erro ou confirmação incompleta, pedir uma captura separada e não repetir a digitação cegamente.

Isso não transmite um vídeo ao modelo do chat. O assistente continua recebendo imagens por solicitações explícitas e conferindo o estado antes/depois das ações. O plano de digitação não concede comandos de shell, scripts de UI arbitrários nem acesso a senhas.
