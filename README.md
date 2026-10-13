# iGEM Ping

[简体中文](README.zh-CN.md)

A small desktop launcher for iGEMers. Click Gemy to open a wheel of official links, local signals, and preferences.

![iGEM Ping desktop wheel](docs/wheel.png)

## What it does

- Gemy stays on your desktop as a draggable launcher. The wheel contains the app's controls; there is no separate dashboard window.
- The default **iGEM** navigation offers **Timeline**, **Judge handbook**, **Submission guides**, **Past teams**, **Start here**, and **My deliverables**.
- **Explore** adds 12 official links across pages, including Wiki editing and uploads, project archives, and competition resources.
- **Signals** offers six local pings: **Need a hand**, **New idea**, **Check this**, **It worked!**, **Focus time**, and **Take a break**.
- **Settings** contains language, sound, reduced motion, companion size, a 25-minute focus toggle, and quit.
- English is the default language; Simplified Chinese is available. Preferences are saved on your computer.

This is an independent community project for everyone in iGEM. It is not an official iGEM application or an endorsement by the iGEM Foundation. Artwork sources and terms are listed in [ASSETS.md](ASSETS.md).

## Run on Windows

Download the portable `iGEM-Ping-<version>-win-x64.exe` from this repository's **Releases** page, then open it. The portable build does not need an installer. Builds are unsigned, so Windows may show a publisher or SmartScreen notice.

The packaged target is Windows x64. macOS and Linux builds are not provided or tested.

## Controls

- **Ctrl + Alt + G:** open the wheel at the cursor, starting with official navigation.
- **Ctrl + Alt + P:** show or hide the companion.
- **Drag the companion:** move it.
- **Click Gemy:** open the navigation wheel.
- **Right-click Gemy:** open the **Settings** wheel.
- **Tray menu:** access the wheel or quit.

Choose an official shortcut to open its page in your default browser. Use **Explore** to browse the additional links, **Signals** for local animations, or **Settings** to change settings. The **1–6** keys select an item on the current wheel page, and **Esc** closes the wheel. If another application already owns a shortcut, use Gemy or the tray menu.

In **Settings**, the focus control starts a 25-minute session or ends the current session. Gemy shows the countdown and a break ping appears when time is up. Quitting the app ends the session.

Pings appear locally. People watching a whole-screen share can see them; sharing only another application's window does not include the overlay. There are no shared rooms or pings sent to teammates. Exclusive fullscreen applications may cover the overlay.

## Official navigation

The six default shortcuts appear in this order:

1. **Timeline:** [competition deliverables and deadlines](https://competition.igem.org/deliverables/).
2. **Judge handbook:** [the official judging handbook](https://competition.igem.org/judging/handbook), covering the judging process and reference material for judges.
3. **Submission guides:** [public deliverable guides](https://competition.igem.org/deliverables/guides), so you can read the instructions before signing in.
4. **Past teams:** [the all-years team directory](https://teams.igem.org/list?year=all). Search by team name, institution, or region, then open a team's wiki.
5. **Start here:** [the official starting-a-team guide](https://competition.igem.org/about/starting-a-team).
6. **My deliverables:** [your team's deliverables dashboard](https://teams.igem.org/go/deliverables), where you can check submission status and deadlines after signing in and selecting your team.

The **Explore** wheel also offers [Wiki getting started](https://teams.igem.org/go/deliverables/wiki/getting-started) and [Wiki asset uploads](https://teams.igem.org/go/deliverables/wiki/uploads), both requiring an iGEM login and team selection, plus [Video Universe](https://video.igem.org/) for video and audio. Uploading media requires the appropriate account access. [Phoenix project search](https://community.igem.org/projects/phoenix-project) is another source of inspiration, with coverage through **2022** only; use the all-years directory for later teams.

Uploading a wiki asset and submitting a competition deliverable are separate steps. Wiki source belongs in your team's iGEM GitLab repository; images, documents, and fonts use Wiki Uploads; video and audio use Video Universe. Follow the relevant official guide for each submission.

These shortcuts open the live official websites. **Timeline** opens public requirements and dates; **My deliverables** opens your team's status page in the browser. The app does not sign in for you, read your team's dashboard, or synchronize your submission status.

## Privacy

The application does not require an account, collect telemetry, or make background network requests. Preferences stay in Electron's local user-data directory on your computer. Opening an official resource deliberately launches its HTTPS page in your browser; that website's login requirements and privacy practices then apply. Browser sign-in stays in your browser.

Installing development dependencies and downloading releases use npm and GitHub as usual.

## Build from source

Use Node.js 22 and npm on Windows. From the repository directory:

```powershell
npm ci
npm start
```

Run the checks and create the portable build:

```powershell
npm test
npm run test:smoke
npm run dist
```

The executable is written to `release/iGEM-Ping-<version>-win-x64.exe`. The smoke test starts the Electron application, so run it in a desktop session.

The app uses Electron with plain JavaScript, HTML, and CSS. No native input-hook helper is required: the wheel opens through a registered shortcut rather than intercepting a modifier-and-mouse gesture. Useful upstream references are Electron's [global shortcuts](https://www.electronjs.org/docs/latest/api/global-shortcut), [screen coordinates](https://www.electronjs.org/docs/latest/api/screen), and [transparent-window interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions).

## Releases and contributions

Pull requests run the Windows checks in GitHub Actions. To release, update the version in `package.json` and `package-lock.json`, commit it, and push a matching `v<version>` tag. The release workflow tests the app, builds the portable executable, and attaches it to a GitHub release.

Bug reports are welcome. Include the app version, Windows version, display scaling, and steps to reproduce. Keep personal data out of screenshots and logs.

## Credits and license

The desktop ping interaction was inspired by [darrenprx/lolPing](https://github.com/darrenprx/lolPing). This project has its own implementation and does not copy lolPing code or League of Legends artwork or sounds.

The source code is available under the [MIT license](LICENSE). Official iGEM logos, mascots, and other third-party artwork are excluded from the code license; consult [ASSETS.md](ASSETS.md) before reusing them. [iGEM](https://igem.org/) names and marks belong to their respective rights holders.
