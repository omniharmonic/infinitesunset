# Infinite Sunset

A little more golden hour. An endless, living sky for a quiet room, a gathering of friends, or absolutely no reason at all.

Built from the Air experience in [Element Bender](https://element-bender.vercel.app). Free to enjoy and remix under the MIT license. No account, API keys, advertisements, analytics scripts, or backend.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To create a completely static site:

```sh
npm run build
npm run preview
```

Host the contents of `dist/` on any static host. All assets use relative paths, so both custom domains and GitHub project URLs work. HTTPS is required for camera access and WebGPU outside localhost.

## Linger, or play

- **Atmosphere:** five color stories plus a continuous journey, cloud cover, drift, billowing, sunlight position, glow, and rendering quality.
- **Just the sky / H:** hide every interface element and the pointer. Press H, Escape, or double-click to return. A double tap works where the browser generates a double-click; H/Escape always work with a keyboard.
- **F:** fullscreen. The app requests a screen wake lock while fullscreen, where supported.
- **Space:** pause/resume. Reduced-motion preferences start the sky paused.
- **Drag / touch:** move the clouds. Choose Gather, Swirl, or Scatter in the atmosphere tray; Shift-drag also scatters.
- **Use camera:** optional local hand and body tracking. Open palms move the sky; pinching gathers; circling swirls; bringing hands together gathers; spreading them pushes.
- **Picture:** download a PNG of the sky without the interface.
- **Share:** a URL carries the seed and settings, so someone else can start the same formation. It does not capture a running simulation's exact time or hand deformations.

Settings persist on your device. Controls fade after 30 idle seconds and return on pointer movement. Manually hiding the interface keeps it hidden until you ask for it back. No animation work runs in a hidden tab.

## How the sky works

A deterministic field of 48 cloud lobes drifts continuously through the view. Buoyancy-like motion, damped restoring forces, momentum, and hand forces shape those volumes. Cloud recycling happens outside the visible area. A seeded, tileable three-scale Worley noise volume creates the billows and fine erosion.

The native **WebGPU** path computes a 256 × 128 × 128 volume on the GPU, then ray marches it with Beer–Lambert extinction, sampled self-shadowing, an approximate multiple-scattering contribution, warm directional illumination, atmospheric gradients, tone mapping, and dithering. Surface detail is sampled at render resolution so the cached volume doesn't blur away the billows. **WebGL 2** supplies an equivalent floating-point atlas path when WebGPU is unavailable. Both paths run locally; there is no rendering service.

This is an artistic real-time approximation. The lobe dynamics run on the CPU; volume generation and rendering run on the GPU. It is not a full atmospheric fluid solver, thermodynamic condensation model, or meteorological simulation. Lighting includes an artistic fill direction to keep backlit formations legible. Quality adapts to the device; full detail can use more battery. Balanced and low-energy modes cap at 30 fps, and the volume cache updates less frequently than the display.

## Camera privacy

Camera access starts only after you press **Use camera**. MediaPipe models and WASM are served from this site and loaded on demand. Video, landmarks, and gestures stay in browser memory. Stop camera releases every media track; leaving the page also releases tracking. The site does not upload or record frames. Hosting providers may retain ordinary access logs; see their privacy policies.

Local models and runtime total about 32 MB. A normal visit does not download them. The rendering application is approximately 145 KB gzipped plus a small stylesheet; the vision SDK is a separate lazy chunk. See `public/tracking/NOTICE.md` for third-party provenance. The MIT license covers application code; upstream dependencies and model assets retain their own licenses.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser suite exercises real WebGPU, the fallback, UI state, camera permission failure and recovery, actual model loading against synthetic video, media-track release, PNG capture, fullscreen, touch, and reduced motion. WebGPU assertions require a compatible GPU/browser. Physical hand recognition accuracy still needs testing with real users and varied cameras.

## Free hosting

This public repository includes a GitHub Pages workflow. Every push to `main` runs tests, builds, and publishes `dist/`. GitHub Pages is available for public repositories on GitHub Free, subject to its service limits. The site has no server compute or database costs. Domain registration/renewal is separate. See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [domain setup](docs/DOMAIN.md).

Contributions are welcome: rendering performance, more accessible controls, lower-power devices, and better physical cloud models are especially useful. Keep the experience quiet and camera processing local.
