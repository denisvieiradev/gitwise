import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "gitwise",
      description:
        "AI-powered git toolbelt — smart commits, reviews, PRs, and releases",
      sidebar: [
        { label: "Getting Started", link: "/getting-started/" },
        {
          label: "Commands",
          autogenerate: { directory: "commands" },
        },
        { label: "Configuration", link: "/configuration/" },
        { label: "Templates", link: "/templates/" },
        { label: "Exit Codes", link: "/exit-codes/" },
        { label: "Recovery", link: "/recovery/" },
        { label: "Supply Chain", link: "/supply-chain/" },
        { label: "Publishing a Release", link: "/releasing/" },
      ],
    }),
  ],
});
