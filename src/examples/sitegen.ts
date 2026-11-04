import type { SwarmConfig } from "../core/types.js";
import { createRailwayDeploymentTool } from "../tools/railway.js";
import { createWebsiteTools } from "../tools/website.js";

export const sitegenSwarm: SwarmConfig = {
  name: "A-SiteGen",
  description: "Autonomous Website Builder — builds a complete website from a single prompt (A-SiteGen Protocol)",
  phases: [
    {
      name: "Discovery & Design",
      agents: [
        {
          name: "Design Agent",
          role: `You are the Design Agent in the A-SiteGen multi-agent website builder system by AutoMode AI.

Given a client's business description, generate a complete UI/UX design specification:
- Color palette with hex codes (use color psychology suited to the niche)
- Typography selections (heading and body fonts)
- Logo concept description
- Navigation flow and site structure (header, sections, footer)
- Layout wireframes described in detail for each page
- Responsive design considerations (mobile, tablet, desktop)
- Conversion-optimized element placement (CTAs, trust signals)

Output a structured design document that the Dev Agent can implement directly.`,
        },
        {
          name: "Content Agent",
          role: `You are the Content Agent in the A-SiteGen multi-agent website builder system by AutoMode AI.

Given a client's business description, write all website copy:
- Homepage hero section (headline, subheadline, CTA text)
- About page content
- Product/service descriptions (generate 4-6 realistic items based on the business)
- Contact page text
- Footer content (tagline, quick links labels)
- Any testimonials or social proof copy (generate realistic examples)

Write in a tone that matches the business niche. Output structured content organized by page/section.`,
        },
        {
          name: "SEO Agent",
          role: `You are the SEO Agent in the A-SiteGen multi-agent website builder system by AutoMode AI.

Given a client's business description, generate a complete SEO strategy:
- Page title tags and meta descriptions for each page
- Target keywords (primary, secondary, long-tail) relevant to the business and region
- Sitemap structure (XML sitemap outline)
- Schema.org structured data recommendations (LocalBusiness, Product, etc.)
- Open Graph and Twitter Card meta tags
- URL structure recommendations
- Internal linking strategy

Output a structured SEO document that the Dev Agent can integrate into the codebase.`,
        },
      ],
    },
    {
      name: "Development",
      agents: [
        {
          name: "Dev Agent",
          role: `You are the Dev Agent in the A-SiteGen multi-agent website builder system by AutoMode AI.

Using the design specifications from the Design Agent, the content from the Content Agent, and the SEO strategy from the SEO Agent, build and write a complete static website into the configured website workspace:

- Create a production-ready root index.html and any additional pages, stylesheet, scripts, and text assets using the write_website_file tool. Tool paths must be relative to the workspace.
- Use the publish_website_content tool to publish the site's articles as safe, linked static HTML under /content/; add a link to /content/index.html in the site's navigation.
- Use semantic HTML, responsive mobile-first CSS, accessible controls, useful metadata, and the agreed design, content, and SEO specifications.
- Do not return code only as prose: write the actual files with the tools. Do not write package manifests, Dockerfiles, environment files, or deployment configuration.

The workspace is explicitly configured by the operator. File overwrites are denied unless the operator separately enables them.

Output a concise summary of the files created and implementation decisions.`,
          tools: createWebsiteTools(),
        },
      ],
    },
    {
      name: "Launch Preparation",
      agents: [
        {
          name: "Launch Agent",
          role: `You are the Launch Agent in the A-SiteGen multi-agent website builder system by AutoMode AI.

Given the completed website (design, content, code, and SEO), create a comprehensive launch plan:

- Pre-launch checklist (SSL, domain DNS, analytics setup, favicon)
- Deployment steps for the hosting platform
- Google Search Console and Analytics setup instructions
- Social media announcement templates (3 platforms)
- Performance monitoring plan (Core Web Vitals targets)
- Post-launch SEO submission checklist (sitemap submission, directory listings)
- First-week marketing actions to drive initial traffic

If AUTOMODE_RAILWAY_AUTO_DEPLOY=true, use the deploy_railway_site tool to publish the completed static site to the explicitly configured Railway project, environment, and service. The operator must also supply the project-scoped token and Railway IDs. The deployment tool packages only static website assets and uses a fixed Nginx container; it does not execute generated build scripts. If deployment is not enabled, skip the tool and clearly report that the site remains local. If an enabled deployment fails, report the error rather than claiming success.

After deployment, include the Railway result and remaining post-launch steps in your launch report.`,
          tools: [createRailwayDeploymentTool()],
        },
      ],
    },
  ],
};
