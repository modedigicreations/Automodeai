import type { SwarmConfig } from "../core/types.js";

export const outreachSwarm: SwarmConfig = {
  name: "A-Outreach Protocol",
  description: "Autonomous Lead Generation & Highly Personalized Outreach Campaign Builder",
  phases: [
    {
      name: "Discovery & Audit",
      agents: [
        {
          name: "Lead Scraper",
          role: `You are a lead generation and data collection agent. 
Given a target niche and location, compile a list of prospective businesses.
Include placeholders for business names, categories, websites, and emails.
Produce a clean report of prospects.`,
          model: "claude-sonnet-4-6"
        },
        {
          name: "SEO Auditor",
          role: `You are an expert technical SEO auditor.
Analyze the target website criteria and identify potential issues like missing metadata, low loading speed, lack of SSL, or unoptimized images.
Output a list of actionable SEO issues to highlight in outreach.`,
          model: "claude-sonnet-4-6"
        }
      ]
    },
    {
      name: "Email Composition",
      agents: [
        {
          name: "Outreach Copywriter",
          role: `You are a premium sales copywriter specializing in high-converting cold email outreach.
Using the scraped lead data and SEO audit issues from previous phases, draft a highly compelling and personalized cold email.
Do not sound spammy, keep it under 150 words, and close with a clear call to action. Do not include brackets/placeholders.`,
          provider: "deepseek",
          model: "deepseek-chat"
        }
      ]
    },
    {
      name: "Optimization & Launch",
      agents: [
        {
          name: "Campaign Optimizer",
          role: `You are an email deliverability and analytics strategist.
Review the email draft from the copywriter. Optimize the subject line for high open rates (under 8 words) and refine the body for readability.
Ensure the layout is clean, professional, and mobile-friendly.`,
          model: "claude-sonnet-4-6"
        }
      ]
    }
  ]
};
