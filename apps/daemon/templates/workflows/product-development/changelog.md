# Changelog

All notable changes to the product-development workflow.

## [1.5.0] - 2026-03-12

### New

- **Human Review phase** - A new manual checkpoint after Build where you can review completed work before creating a pull request
- **Skippable Pull Requests** - The Pull Requests phase can now be toggled off, sending tickets straight to Done
- **Skippable Human Review** - The Human Review phase can also be toggled off if you prefer to go straight from Build to Pull Requests
- **Auto-advance to Done** - Tickets now automatically move to Done after the PR agent completes, instead of staying in Pull Requests

### Improved

- Disabling phases no longer accidentally routes tickets through the Blocked column

## [1.4.0] - 2026-02-10

### Improved

- PR Agent now 72% more likely to do it's job.

## [1.3.0] - 2026-02-10

### Fixed

- PR Agent should not move tickets any further. Tickets stay in Pull Requests until the user takes action against them.
- Updated names of refinements and architecture loops

## [1.2.0] - 2026-02-10

### New

- **Per-agent model selection** - Configure which Claude model each agent uses for cost optimization and capability tuning
- Use shortcuts (`haiku`, `sonnet`, `opus`) or explicit model IDs for version pinning
- Verification agents can now use cheaper models while complex reasoning stays on more capable ones

### Example

```json
{
  "id": "spec-verifier",
  "type": "agent",
  "source": "agents/verify-spec.md",
  "model": "haiku"
}
```

## [1.1.1] - 2026-02-05

### Improved

- Builder agent now produces cleaner, more maintainable code
- Specification verification catches more edge cases
- Quality reviews provide more actionable feedback

### Fixed

- Brainstorm conversations now flow more naturally across multiple turns

## [1.1.0] - 2026-02-05

### New

- **Template versioning** - Workflows now use semantic versioning so you know when updates are available
- **Per-project customization** - Each project gets its own copy of the workflow that you can modify
- **Upgrade notifications** - See when new workflow versions are available with a banner showing what changed

## [1.0.12] - 2026-02-05

### New

- **Ticket archiving** - Move completed tickets out of sight to keep your board focused
- **Swimlane colors** - Customize column colors to match your team's visual preferences
- Archive toggle in Done column to show/hide archived work

### Fixed

- Mobile experience improvements when switching between tabs

## [1.0.11] - 2026-02-04

### New

- Toast notifications for important actions
- Consistent styling across all dropdown menus

### Fixed

- Stuck tasks now restart automatically when detected

## [1.0.10] - 2026-02-04

### New

- **Table view sorting** - Click column headers to sort by ID, title, phase, or last updated
- Press Escape to quickly close ticket details
- Ask questions about any artifact directly from the viewer

### Fixed

- Processing indicators now clear reliably when work completes

## [1.0.9] - 2026-02-04

### New

- **Clickable links** - URLs in chat messages are now clickable
- Better recovery when the daemon restarts mid-work

### Improved

- Session history now tracks each agent run separately

## [1.0.8] - 2026-02-04

### New

- **Task list in ticket details** - See all tasks for the current phase at a glance
- **Table view** - Switch between kanban board and table list views
- Full-screen artifact viewer with integrated chat

## [1.0.7] - 2026-02-03

### New

- **Review feedback loop** - When reviewers reject work, their feedback is passed to the next attempt
- Agents learn from previous rejections to avoid repeating mistakes

### Improved

- Better visibility into what's happening during adversarial review cycles

## [1.0.6] - 2026-02-03

### New

- AI messages now have a distinctive visual style
- Smart scrolling - chat stays at bottom unless you scroll up to read history

### Fixed

- Task creation prompts improved for better ticket breakdown

## [1.0.5] - 2026-02-02

### New

- Automatic detection when work gets stuck
- Human intervention requests when agents need help

### Improved

- Clearer error messages when something goes wrong

## [1.0.4] - 2026-02-02

### Improved

- Work continues automatically after daemon restarts
- Better cleanup when phases complete

### Fixed

- Complex nested workflows now complete reliably

## [1.0.3] - 2026-02-01

### New

- **Multi-agent orchestration** - Multiple agents can work together on complex tasks
- **Task loops** - Automatically process multiple tickets in parallel
- **Review loops** - Adversarial review until quality standards are met

## [1.0.2] - 2026-02-01

### Improved

- Code isolation only created when actually needed (Build phase)
- Specification agents focus on planning, not task management

## [1.0.1] - 2026-01-31

### New

- **Dedicated brainstorm view** - Full master-detail layout for brainstorming sessions
- Mobile-friendly brainstorm interface

### Fixed

- Sidebar behavior on mobile devices
- Template validation when creating new workflows

## [1.0.0] - 2026-01-30

### New

- **Complete workflow redesign** - New phases for refinement, architecture, specification, and build
- **Adversarial review** - Each phase includes a review step to catch issues early
- **QA validation** - Automated quality checks after build completion
- **PR automation** - Automatic pull request creation when work is done

### Improved

- Modern React-based interface with better performance
- Real-time updates across all views

## [0.9.2] - 2026-01-30

### New

- Edit workflow templates directly in the UI
- Modify agent prompts without touching files
- See available updates for your workflow

## [0.9.1] - 2026-01-30

### New

- Bundled workflow templates ship with the product
- Templates can be customized per-project

## [0.9.0] - 2026-01-30

### New

- **Workflow templates** - Define your own development process with reusable templates
- Flexible phase system - add or remove phases as needed

## [0.8.1] - 2026-01-30

### New

- Rich text formatting in brainstorm messages
- Markdown support for better readability

## [0.8.0] - 2026-01-29

### New

- **Session recovery** - Work continues where it left off after restarts
- Only one daemon instance can run at a time (prevents conflicts)

### Improved

- Simpler, more reliable communication between components

## [0.7.2] - 2026-01-29

### New

- **Telegram integration** - Get notifications and respond from Telegram
- Pluggable chat system ready for Slack, Discord, and more

## [0.7.1] - 2026-01-29

### Fixed

- Reliability improvements for session management
- Better handling of chat context across restarts

## [0.7.0] - 2026-01-29

### Improved

- Complete codebase modernization for better maintainability
- More reliable communication with Claude Code

## [0.6.0] - 2026-01-29

### Improved

- Full type safety across the codebase
- Better error messages and debugging

## [0.5.0] - 2026-01-29

### New

- Automatic agent updates
- More granular workflow phases for better control

## [0.4.0] - 2026-01-28

### New

- **Initial release** - Multi-agent software engineering assistant
- Kanban board for ticket management
- Claude Code integration for autonomous development
- Basic workflow: Ideas → Build → Done
