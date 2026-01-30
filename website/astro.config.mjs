// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://mshell.dev",
  integrations: [
    starlight({
      title: "Magic Shell",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/austin-thesing/magic-shell",
        },
      ],
      customCss: ["./src/styles/starlight-custom.css"],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Configuration", slug: "getting-started/configuration" },
            { label: "First Command", slug: "getting-started/first-command" },
          ],
        },
        {
          label: "Features",
          items: [
            { label: "AI Providers", slug: "features/providers" },
            { label: "Safety Levels", slug: "features/safety-levels" },
            { label: "Themes", slug: "features/themes" },
            { label: "TUI Mode", slug: "features/tui-mode" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "CLI Options", slug: "reference/cli-options" },
            { label: "Config File", slug: "reference/config-file" },
            { label: "Keyboard Shortcuts", slug: "reference/keyboard-shortcuts" },
            { label: "Changelog", slug: "reference/changelog" },
          ],
        },
      ],
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://mshell.dev/og-image.png",
          },
        },
      ],
      components: {
        Head: "./src/components/Head.astro",
      },
    }),
  ],
});
