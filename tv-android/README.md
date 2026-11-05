# TV DO GUH AI - Android TV bridge (initial scaffold)
This is an **initial Android TV app scaffold**, not a functional remote-control bridge.
It deliberately does not expose unauthenticated network commands or claim to control Google TV.
Next steps: implement authenticated pairing (short-lived one-time code), secure outbound websocket connection, TV-side user approval, supported media actions, and explicit accessibility permission only if needed. Android TV does not grant third-party apps arbitrary system remote-control privileges.
Build with JDK 17 and Android SDK 35: `gradle :app:assembleDebug` from tv-android. APK build and device testing have NOT been completed.
Do not install APKs from untrusted links.
