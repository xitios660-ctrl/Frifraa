# Instalação bloqueada pelo Play Protect

O usuário enviou uma foto da TCL mostrando o aviso “O app foi bloqueado para proteger seu dispositivo”, citando dados sensíveis e risco de fraude. A documentação oficial descreve esse aviso para apps distribuídos por navegador/gerenciador de arquivos com permissões sensíveis, incluindo acessibilidade. O TV DO GUH AI declara um serviço de acessibilidade, portanto essa regra é compatível com o bloqueio observado. Não há diagnóstico individual do Google para este APK além do aviso enviado.

Compilação, assinatura e testes de transporte aprovados não comprovam instalação aprovada pelo Play Protect. Não há APK novo comprovadamente liberado nesta TCL. Não alterar nome, assinatura ou forma de entrega para tentar evitar a classificação. Remover a acessibilidade retira a navegação global e as capturas implementadas; isso mudaria os requisitos e não é uma correção equivalente.

Referência oficial: https://developers.google.com/android/play-protect/warning-dev-guidance
Formulário oficial: https://support.google.com/googleplay/android-developer/contact/protectappeals

## Rascunho para revisão pelo responsável do app

Este texto ainda NÃO foi enviado. Submissão exige acesso do responsável e autorização explícita para contatar o Google. A revisão pode ser recusada e não há prazo de aprovação conhecido.

App: TV DO GUH AI
Package: com.tvdoguh.bridge
Version: 1.2.0 (versionCode 4)
APK: https://tv-do-guh-ai.onrender.com/tv-do-guh-ai-v1.2.0.apk
Source: https://github.com/xitios660-ctrl/Frifraa/tree/tv-do-guh-ai/tv-android

We request review of the Play Protect installation block reported on a TCL Google TV when installing this development APK through Downloader. The displayed warning says the app may access sensitive data and increase identity-theft or financial-fraud risk.

The app is a user-operated remote control for the owner's television, paired to an iPhone website using an on-screen one-time code. Its accessibility service supports explicit remote focus navigation, clicks, Home/Back actions and optional screenshots using public Android APIs. This is a remote-control utility, not a disability accessibility tool; the app does not declare isAccessibilityTool=true. Users explicitly enable the service in Android settings. Screenshots require an additional TV-side authorization valid for ten minutes and a request from an authenticated session. It does not collect passwords or payment details intentionally; authorized screenshots may contain personal screen content, as disclosed to the user.

App storage statistics require the separately user-granted Usage Access setting and a temporary TV-side diagnostic authorization. There is no QUERY_ALL_PACKAGES, root, ADB, SMS permission or notification-listener service. Application data/cache is not silently deleted. Uninstall requests open Android's official confirmation UI and are blocked for system apps and the bridge itself.

The optional support feature requires the owner to generate and share a single-use support code. Redeemed access expires in five minutes and can be revoked from the paired iPhone. This feature permits remote navigation, so it is described explicitly as temporary control, not read-only access. It cannot request uninstallation through the uninstall API. There is no permanent AI agent running on the relay server. HTTPS, session authorization and command acknowledgements are used. Screenshots expire in up to 60 seconds, diagnostics in up to ten minutes; server storage is in memory. The APK is currently a development-signed build, not a Play Store release.

Please assess the classification and advise any required changes. We cannot claim Play Protect approval or successful installation on the affected TCL.
