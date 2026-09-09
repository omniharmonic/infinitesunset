# Connecting infinitesunset.xyz

The domain currently uses Namecheap BasicDNS. GitHub Pages supplies free static hosting and HTTPS. Domain renewal is separate.

1. In this repository's **Settings → Pages**, choose **GitHub Actions** as the source. The included workflow builds and deploys the site.
2. Add `infinitesunset.xyz` as the custom domain in Pages settings before changing DNS.
3. In **Namecheap → Domain List → Manage → Advanced DNS**, replace the existing parking/URL-redirect record for `@` with these four records. Do not remove unrelated MX, TXT, or email records.

| Type | Host | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | omniharmonic.github.io |

4. After DNS resolves correctly and GitHub provisions the certificate, enable **Enforce HTTPS** in Pages settings. Camera tracking and WebGPU require a secure origin.

DNS/certificate provisioning can take up to 24 hours. The GitHub project URL redirects to the custom domain once one is configured. GitHub Actions publishing ignores any CNAME file in the build; the Pages setting is authoritative.

Official instructions: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
