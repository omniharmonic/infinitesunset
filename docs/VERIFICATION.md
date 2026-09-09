# Release verification · 9 September 2026

- Production build and GitHub Pages workflow pass from a clean dependency install.
- Seven numerical/state tests cover deterministic shared formations, force response and post-release inertia, long-running recycling with extreme input, pause invariance, smooth color-loop boundaries, and sanitization of shared settings.
- Eight Chromium browser tests exercise real WebGPU and WebGL 2, settings persistence and URL restoration, pointer/touch input, hidden interface recovery, pause/fullscreen/PNG export, camera denial and recovery, local models running on synthetic video, track release, and reduced motion.
- The deployed GitHub Pages site was opened in Chromium at 1440 × 900. Native WebGPU ran at the intended 30 fps in balanced mode; the fallback measured 25–30 fps during short samples. These are local-device observations, not performance guarantees.
- All five palettes were viewed over a longer run. Automatic hiding after 30 quiet seconds and pointer-triggered recovery worked. Mobile controls were inspected at 390 × 844.
- Production requested zero tracking assets before camera opt-in. Camera testing used a synthetic canvas stream; real-world hand recognition accuracy has not been validated.
- No JavaScript, WebGL, or WebGPU errors were seen in the production smoke checks. Shipped dependencies had zero reported vulnerabilities in `npm audit --omit=dev` at release time.

The domain remains on Namecheap forwarding until its DNS records are changed. The working release is available at https://omniharmonic.github.io/infinitesunset/. See DOMAIN.md for the custom-domain steps.
