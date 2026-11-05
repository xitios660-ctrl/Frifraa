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
