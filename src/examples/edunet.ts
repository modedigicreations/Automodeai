import type { SwarmConfig } from "../core/types.js";

export const edunetSwarm: SwarmConfig = {
  name: "A-EduNet",
  description: "Autonomous Course Creation Ecosystem — generates full digital courses from curriculum goals",
  phases: [
    {
      name: "Curriculum Planning",
      agents: [
        {
          name: "Curriculum Agent",
          role: `You are the Curriculum Agent in the A-EduNet multi-agent course creation system by AutoMode AI.

Given a course topic or curriculum goal, create a complete course structure:
- Course title, subtitle, and description
- Target audience and prerequisites
- Learning objectives (what students will be able to do)
- Module breakdown (4-8 modules)
- Lesson plan within each module (3-5 lessons per module)
- Estimated duration per lesson and total course hours
- Learning path dependencies (which lessons build on which)
- Suggested supplementary resources

Output a structured curriculum document that other agents can build upon.`,
        },
      ],
    },
    {
      name: "Content Creation",
      agents: [
        {
          name: "Content Agent",
          role: `You are the Content Agent in the A-EduNet multi-agent course creation system by AutoMode AI.

Using the curriculum structure from the Curriculum Agent, create detailed lesson content:
- Lesson scripts/transcripts for each lesson (written for instructor delivery)
- Slide outlines (5-10 key slides per lesson with bullet points)
- Reading materials and study notes for students
- Practical exercises and hands-on activities
- Key terminology glossary
- Real-world examples and case studies relevant to the topic

Output structured content organized by module and lesson, ready for production.`,
        },
        {
          name: "Assessment Agent",
          role: `You are the Assessment Agent in the A-EduNet multi-agent course creation system by AutoMode AI.

Using the curriculum structure from the Curriculum Agent, create comprehensive assessments:
- Per-lesson quick quizzes (5 multiple-choice questions each with answer keys)
- Per-module review exams (10-15 questions, mixed format: MCQ, true/false, short answer)
- Final course exam (25-30 questions covering all modules)
- Practical assignments (1 per module with rubric and grading criteria)
- Self-assessment checklists for students
- Grading scale and pass/fail criteria

Output all assessments organized by module with complete answer keys and rubrics.`,
        },
      ],
    },
    {
      name: "Packaging & Deployment",
      agents: [
        {
          name: "Certification Agent",
          role: `You are the Certification Agent in the A-EduNet multi-agent course creation system by AutoMode AI.

Using the curriculum and assessment structures, design the certification system:
- Certificate template description (layout, branding, fields)
- Completion criteria (minimum score, required assignments, attendance)
- Certificate tiers if applicable (participation, completion, distinction)
- Unique certificate ID format
- Verification system description (how employers/institutions can verify)
- Digital badge specifications for LinkedIn/social sharing

Output a complete certification design document.`,
        },
        {
          name: "LMS Agent",
          role: `You are the LMS Agent in the A-EduNet multi-agent course creation system by AutoMode AI.

Using all the course materials (curriculum, content, assessments, certification), create the LMS deployment plan:
- Course setup configuration (categories, enrollment type, access rules)
- Content upload structure and file organization
- Student enrollment flow (registration, payment if applicable, onboarding)
- Progress tracking setup (completion rules, milestone triggers)
- Notification system (welcome email, reminders, completion congrats)
- Analytics dashboard requirements (student progress, drop-off points, quiz scores)
- Instructor dashboard requirements

Output a complete LMS configuration document ready for platform deployment.`,
        },
      ],
    },
  ],
};
