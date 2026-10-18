<div align="center">
<img src="https://raw.githubusercontent.com/floogulinc/hydrus-web/master/src/assets/icon.svg?sanitize=true" alt="Hydrus Web Icon" width="150"/>
<h1> Hydrus Web </h1>

Hydrus web is a web client for [Hydrus](https://hydrusnetwork.github.io/hydrus/)

</div>
<div align="center">
<br>
<img src="https://user-images.githubusercontent.com/1300395/92695467-1c69aa00-f30e-11ea-844e-5ea80cfe6fcb.png" width="40%" />
<img src="https://user-images.githubusercontent.com/1300395/92695470-1d024080-f30e-11ea-8eb9-ae3b36bfdbe3.png" width="40%" />

</div>

## Usage

### SideStore IPA

The iOS wrapper bundles Hydrus Web into a native Capacitor app. It does not need the LAN web server: enter the HTTPS Hydrus Client API address you already use over Tailscale directly in the app's API Configuration. On first launch, allow the local-network permission if iPadOS asks for it.

An unsigned SideStore-ready IPA can be built on GitHub without owning a Mac:

1. Push this repository to a GitHub fork or private repository.
2. Open **Actions → Build unsigned iOS IPA → Run workflow**.
3. Download the `Hydrus-Web-unsigned-IPA` artifact and unzip it.
4. Send `Hydrus-Web-unsigned.ipa` to the iPad and open it with SideStore. SideStore will re-sign it with your personal development certificate.

The workflow also runs automatically for pushes to `dev`, `main`, or `master`. The resulting IPA supports iOS and iPadOS 15 or newer and uses the bundle identifier `io.github.hydrusweb.client`, so installing a later build over the existing one preserves the app's local settings and selection groups.

If you have a Mac with Xcode 26 or newer, build the same unsigned IPA locally with:

```bash
npm run ios:ipa
```

The output is written to `ios/App/output/Hydrus-Web-unsigned.ipa`. For normal native development, `npm run ios:open` rebuilds the Angular app, syncs it into the iOS project, and opens Xcode.

### GitHub Releases: iPad, Android, and Windows

Pushing a version tag builds all three applications and publishes them together on the repository's **Releases** page:

- `Hydrus-Web-unsigned.ipa` — iPhone/iPad application for SideStore to re-sign.
- `Hydrus-Web-Android.apk` — directly installable Android application.
- `Hydrus-Web-Windows-Setup-<version>.exe` — guided per-user Windows installer with Start menu, desktop shortcut, install-folder selection, and uninstaller.
- `Hydrus-Web-Windows-Portable-<version>.exe` — portable Windows application that needs no installer.

Create a release from the current commit with:

```powershell
git tag v1.3.0
git push origin v1.3.0
```

The **Publish application release** workflow builds the three targets and creates the GitHub Release automatically. Both mobile applications bundle the web UI and connect directly to the Hydrus Client API address configured in the app. Plain HTTP is allowed by the Android wrapper for Hydrus servers reached inside a trusted Tailscale network; HTTPS should still be used when available.

The Android workflow creates an installable debug-signed APK when no signing secrets are configured. That is suitable for sideloading, but a later build may require uninstalling the old APK before installation. For stable in-place Android updates, configure these repository Actions secrets with a permanent Android keystore:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The Windows installer and portable executable are currently unsigned, so Windows may show a SmartScreen warning on first launch.

For Android development, `npm run android:open` rebuilds and opens the project in Android Studio. On macOS or Linux, `npm run android:apk` writes the APK to `release/android/Hydrus-Web-Android.apk`. For desktop development, use `npm run desktop:start`; `npm run desktop:build` creates both the Windows installer and portable executable.

### iPad, phones, and other devices on your network

Hydrus Web is an installable Progressive Web App (PWA), so the same build works on iPadOS, iOS, Android, Windows, macOS, and Linux. A small production server is included for running this customized copy from any computer that can reach Hydrus. Running it on the Hydrus computer is the simplest setup.

Build and serve it with:

```powershell
node scripts/serve-mobile.mjs --build
```

The server prints its LAN addresses. On an iPad connected to the same network, open one of those addresses in Safari. In Hydrus Web's API Configuration, use the same address followed by `/hydrus-api/`; for example:

```text
Web app:       http://192.168.1.50:8080/
Hydrus API:    http://192.168.1.50:8080/hydrus-api/
```

The `/hydrus-api/` route is proxied to `http://127.0.0.1:45869/` by default. This lets Hydrus keep listening only on the host machine instead of exposing its Client API port directly to every device on the LAN. If Hydrus runs on another computer, or uses a different port, set `HYDRUS_API_PROXY` to an address the web-app computer can reach before starting the server:

```powershell
$env:HYDRUS_API_PROXY = 'http://192.168.1.40:45869/'
node scripts/serve-mobile.mjs --build
```

In Safari, choose **Share → Add to Home Screen → Open as Web App**. The plain HTTP LAN address works for normal browser use; service-worker caching and full installed-PWA behavior on another device require trusted HTTPS. If you already have a trusted certificate and key, set `HYDRUS_WEB_TLS_CERT` and `HYDRUS_WEB_TLS_KEY` before launching. A private-network HTTPS proxy such as Caddy or Tailscale HTTPS is another option.

The default port is `8080`. Override it with `HYDRUS_WEB_PORT`. After the first build, `node scripts/serve-mobile.mjs` starts the existing build without rebuilding it.

### hydrus.app

[hydrus.app](https://hydrus.app/) is the recommended way to use Hydrus Web. It will always be the latest stable version (latest commit on the `master` branch) of Hydrus Web. It is automatically deployed with [Vercel](https://vercel.com/).

The latest development build (latest commit on the `dev` branch) can be found at [dev.hydrus.app](https://dev.hydrus.app/).

### Docker

A [Docker image](https://github.com/floogulinc/hydrus-web/pkgs/container/hydrus-web) is provided for Hydrus Web. 

It hosts Hydrus Web on port 80 using nginx. Hydrus Web needs to be hosted with valid HTTPS unless it is only being used on `localhost`. The Docker image is meant to be used with some proxy that can provide HTTPS (like Caddy or Traefik).

You may also want to run [Hydrus on Docker](https://hydrusnetwork.github.io/hydrus/docker.html).

## Hydrus API HTTPS

Unless you are opening Hydrus Web on the same device the Hydrus client is running on, you will need to make its API available with valid HTTPS. This will likely mean running some form of reverse proxy.

There are some guides on doing this on the [wiki](https://github.com/floogulinc/hydrus-web/wiki).

## Hydrus Version Support

The minimum required versions of the Hydrus client for Hydrus Web are:

| Hydrus Web | Hydrus Client Version |
|--|--|
| Stable branch ([hydrus.app](https://hydrus.app/)) | v500 |
| Dev branch ([dev.hydrus.app](https://dev.hydrus.app/)) | v500 |
| 1.0.0+ | v500 |
| [0.3.2](https://github.com/floogulinc/hydrus-web/releases/tag/v0.3.2) | v357 probably |

Some features may require a newer Hydrus version than the minimum.

## Development

### Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

### Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

### Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

### Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

### Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

### Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).

## ComfyUI output browser

Hydrus Web connects directly to the running ComfyUI server with ComfyUI-Gallery installed. In Settings → ComfyUI, save ComfyUI's normal address. Save the same Hydrus API key in both applications; the handshake completes automatically. No separate bridge process, address or token is required. The ComfyUI entry browses output folders with image/video previews and paging.

See [COMFYUI_INTEGRATION.md](COMFYUI_INTEGRATION.md) for setup, connection verification, remote addresses and validation. Existing Node import-folder rules are retained, but the old scheduler no longer starts with the app.
