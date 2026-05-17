import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "devflow-cli",
      description:
        "CLI pipeline for structured software development — from PRD to merge",
      sidebar: [
        { label: "Getting Started", link: "/getting-started/" },
        {
          label: "Commands",
          autogenerate: { directory: "commands" },
        },
        { label: "Configuration", link: "/configuration/" },
        { label: "Templates", link: "/templates/" },
      ],
    }),
  ],
});
