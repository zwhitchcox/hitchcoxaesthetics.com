# Content & Linking Rules

when committing/pushing, make sure to check the linter/tsc

## Content Strategy

- **Keywords:** Integrate "Knoxville" keywords naturally. Do not stuff.
- **Variations:** Use diverse phrasing:
  - "Botox in Knoxville"
  - "Botox Knoxville"
  - "Knoxville Botox"
  - "Botox in Knoxville, TN"
  - "Knoxville, TN Botox"
- **Headings:** H2 headers (markdown `##`) must include the service name and
  location (e.g., "## Lip Filler Results in Knoxville"). Keep them concise.
- **H1:** Handled by the hero component. Do NOT include H1 (`#`) in markdown
  body.
- **Distribution:** Spread keywords and links throughout the content, not
  bunched at the beginning or end.

## Linking Hierarchy

Strict hierarchy rules to prevent circular logic and maintain silo structure:

1. **Category Pages** (e.g., `/injectables`, `/laser-services`)

   - **Can link to:** Sibling categories (e.g., `/microneedling`,
     `/weight-loss`)
   - **Cannot link to:** Sub-services or children in body text (e.g.,
     `/botox/forehead-lines`). Use the automated card grid for child navigation.

2. **Mid-Level Pages** (e.g., `/botox`, `/everesse`)

   - **Must link to:** Parent category (e.g., `/injectables`)
   - **Can link to:** Sibling mid-level pages (e.g., `/filler`, `/dysport`)
   - **Cannot link to:** Child leaf pages (e.g., `/botox/forehead-lines`) in
     body text.

3. **Leaf Pages** (e.g., `/botox/forehead-lines`, `/everesse/face`)
   - **Must link to:** Parent mid-level page (e.g., `/botox`)
   - **Can link to:** Sibling leaf pages (e.g., `/botox/crows-feet`)
   - **Cannot link to:** Non-sibling pages (e.g., `/filler/lip-filler` or
     `/microneedling/face`)

## Anchor Text

- Use descriptive, keyword-rich anchor text.
- **Bad:** "Click here", "Learn more"
- **Good:** "Learn more about [Knoxville Botox treatments](/botox)", "Explore
  our [dermal filler options in Knoxville](/filler)"
