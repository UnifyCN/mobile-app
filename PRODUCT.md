# Product

## Register

product

## Users

Unify serves newcomers settling in Canada, including immigrants, refugees, international
students and skilled workers. They use personalized tasks, educational content, community
and Companion guidance. The Vancouver first-week scenario in specification #359 is a
validation fixture. It does not restrict the audience to one city or province.

## Product Purpose

Help a newcomer turn settlement guidance into useful, completed work. Companion and
Checklist share task identity and progress. A user can review an action, authorize the
exact change and resume it in a later conversation or on another platform.

## Brand Personality

Minimal, aesthetic, premium. The repository specifies native iOS Apple conventions as
the default for mobile. Preserve the committed visual system and use familiar controls.

## Anti-references

Do not add a separate assistant destination or a new main tab for Companion actions.
Do not add unnecessary elements, visual noise or decorative styling without a user need.
Do not replace the approved mobile sheet and web drawer with another interaction model.
No additional named visual anti-reference is assumed.

## Design Principles

- Use current information that the signed-in account can access. Do not repeat permission
  prompts for authorized reads.
- Keep the user in control. Clear commands authorize exact changes. Proposals require
  approval. All removals require confirmation.
- Show the actual saved result. Preserve receipt history, drafts and durable progress.
- Keep task identity and domain behavior consistent across mobile and web. Preserve
  direction B: compact conversation cards, a mobile bottom sheet and a web overlay drawer.
- Make the current task usable with native text scaling, input and navigation.

## Accessibility & Inclusion

Support all seven application locales, long text, RTL, reduced motion, keyboard navigation,
safe areas, focus and accessible control names. Preserve message drafts during navigation
and updates. Mobile targets must satisfy the agreed native minimums: 44 pt on iOS and
48 dp on Android. Verify native text scaling and input on the actual native rendering.
Keep declared styles, simulator observations and observed screen-reader use as separate
proof classes. A hierarchy dump does not prove VoiceOver or TalkBack behavior.

## Sources and Scope

This document records confirmed existing context from README.md, AGENTS.md, the approved
Companion specification #359 and the reviewed direction-B prototype. It introduces no new
product decision, design direction, numerical AI allowance or release claim.

The existing root DESIGN.md governs the Resources directory in Learn. It is not a
Companion design contract. Companion work uses the approved specification, prototype,
native typography roles in unify-front-end/constants/Typography.ts and existing components.
Do not overwrite DESIGN.md or change the design system as part of a targeted layout fix.

This is a React Native surface. A browser live-mode HTML configuration is not required
for native simulator validation.
