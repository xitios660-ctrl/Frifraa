# TV DO GUH AI

Android TV 8+ (API 26), Java 17, SDK 35, Gradle 8.10.2.

## Compilar

Instale Android SDK e defina ANDROID_HOME. Execute `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug` nesta pasta. O workflow exclusivo `.github/workflows/tv-do-guh-android.yml` executa os testes da API, instala SDK, compila e publica APK de teste e SHA-256 em uma release própria a cada execução. A assinatura é de desenvolvimento; builds de ambientes diferentes podem exigir desinstalar a versão anterior. Não é uma release de Play Store.

## Instalar e parear

1. Na TCL, abra Downloader e acesse https://tv-do-guh-ai.onrender.com.
2. Baixe o APK pelo link. Nas configurações da TV permita instalar apps desconhecidos para Downloader, quando solicitado. Instale e abra TV DO GUH AI.
3. Com o controle físico, abra o botão Acessibilidade e ative TV DO GUH AI. Leia o aviso e autorize apenas se deseja controle remoto. Em algumas versões, apps instalados por APK precisam de autorização adicional nas configurações do app; se o fabricante bloquear o serviço, não há contorno implementado.
4. Volte ao app. No Safari do iPhone abra o mesmo site e informe o código da TCL, válido por dez minutos.
5. Não compartilhe o código. Use Desconectar no site ou gere novo código na TCL para revogar o acesso. Desativar Acessibilidade encerra o serviço.

## Segurança e limites

HTTPS, códigos aleatórios únicos, uso único, prazo absoluto, limites de tentativa, tokens de 256 bits armazenados no servidor como SHA-256, fila limitada, prazo de execução e confirmação pela TV. Nunca há acesso ADB, root, injeção arbitrária de teclas nem permissão de sistema. O servidor usa memória em uma única instância; reiniciar perde as sessões. O Android detecta 401 e registra novamente. Não escale o servidor para múltiplas instâncias sem adicionar armazenamento compartilhado. Uma sessão dura 24 horas; se expirar, gere outro código na TCL.

O serviço de acessibilidade usa foco e clique de elementos expostos pelos apps; navegação pode falhar em YouTube, Netflix e outras interfaces próprias. Falhas são retornadas ao site. Volume usa STREAM_MUSIC e pode ser fixo com saídas externas/CEC. Play/pause despacha a tecla de mídia pela API pública: depende de uma sessão de mídia ativa. Confirmação significa aceitação pela API Android, não prova visual. Sem controle de energia, busca universal ou simulação de funcionalidades.

Voz depende do reconhecimento disponível no navegador; o ditado do teclado do iPhone é a alternativa. Nenhum áudio é recebido pelo bridge. O serviço não transmite textos de tela.

Não houve teste físico na TCL ou em iPhone real. Testes automatizados usam API HTTP e WebKit quando disponível; não equivalem a validação de hardware.

## Diagnóstico visual (1.1.0)

Requer Android 11/API 30 ou superior. Na TV, o botão “Diagnóstico visual” pede confirmação explícita para autorizar capturas por dez minutos. O mesmo botão revoga a autorização. No site, o iPhone já pareado pode solicitar uma única captura por vez, com intervalo mínimo de cinco segundos. O serviço usa exclusivamente AccessibilityService.takeScreenshot; não grava vídeo nem contorna telas protegidas. Android 8–10 continuam com controle remoto, mas não oferecem capturas.

O JPEG reduzido passa pelo bridge HTTPS e só pode ser consultado usando o token do iPhone pareado. A imagem não é gravada em disco e expira em até 60 segundos; o botão Apagar captura remove o acesso antes disso. Desautorizar na TV também remove a captura no próximo poll. Capturas podem conter dados pessoais da tela; salve apenas o necessário. Arquivos que o usuário salvar no iPhone não são apagados pelo app. O ChatGPT não recebe imagens automaticamente: salve a captura no iPhone e anexe-a à conversa para análise.

Foram adicionados testes de API para autorização, isolamento entre dispositivos, validação da imagem, expiração e revogação. A exibição e exclusão da imagem foram verificadas em WebKit com dispositivo simulado. A captura real pela API Android ainda requer validação na TCL.

## Diagnóstico de apps e assistência (1.2.0)

Na TV, “Diagnóstico de apps” permite compartilhar espaço livre, RAM e apps visíveis com o iPhone por dez minutos. O acesso opcional ao uso libera as medições públicas de StorageStatsManager quando a TCL permitir. Nenhum dado é apagado automaticamente. O site solicita as telas oficiais de armazenamento/detalhes e permite ao dono pedir a desinstalação, ainda sujeita à confirmação do Android. Apps do sistema e o próprio bridge são protegidos dessas solicitações.

O site permite gerar um código de assistência temporária para enviar nesta conversa. Seu resgate concede até cinco minutos de acesso, revogável pelo iPhone. Não há IA rodando permanentemente nem acesso ao chat sem esse código. Consulte [o fluxo da API de assistência](../tv-bridge/README.md) para escopo, expiração, limites e operação responsável.

## Teste MediaProjection no Android 9 (1.3.0)

A versão 1.3.0 adiciona o botão “Teste Android 9: compartilhar tela / parar”. Primeiro há uma explicação no app e depois a autorização oficial do Android. Não há contorno da autorização do sistema. Se a TCL não expuser essa tela ou recusar a projeção, o app informa o erro; a compatibilidade com a TCL ainda não foi validada fisicamente.

Após autorizar, um serviço foreground com notificação e ação Parar mantém uma MediaProjection e um VirtualDisplay por no máximo dez minutos. Uma única imagem de tela permanece no ImageReader local, substituída conforme novos frames chegam, sem compressão contínua. Somente o comando autenticado SCREENSHOT converte a imagem disponível em JPEG e a envia pelo relay existente. A imagem pode conter informações pessoais; telas protegidas podem aparecer pretas. Não se trata de vídeo transmitido ao servidor.

O compartilhamento para quando o usuário toca no botão novamente, usa a ação Parar da notificação, o Android revoga a projeção, o serviço é destruído ou o prazo termina. Desativar o serviço de acessibilidade também encerra a projeção. Tokens de autorização MediaProjection não são persistidos nem reutilizados após reinício. A versão anterior de captura por AccessibilityService continua disponível no Android 11+.

### Teste físico necessário

1. Instalar a atualização 1.3.0 sobre o APK anterior. Abrir o app, manter Acessibilidade ativa e parear novamente se o servidor tiver reiniciado.
2. Escolher Teste Android 9: compartilhar tela, Continuar e aceitar a tela oficial do sistema.
3. Confirmar no app a mensagem “Compartilhamento Android autorizado”. Se aparecer erro ou a autorização oficial não abrir, enviar foto do erro antes de continuar.
4. No iPhone, solicitar Capturar tela da TV. Verificar se a imagem corresponde à TCL e se muda após uma navegação manual.
5. Gerar um novo código de assistência para que o assistente consiga inspecionar a imagem autorizada e verificar o resultado de cada ação. Até receber uma imagem válida, não afirmar que a visão remota funciona.
6. Parar o compartilhamento e confirmar que novos pedidos de captura são recusados. Conteúdo DRM não será usado para validar a captura.
