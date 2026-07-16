# AI Output Disclaimer and Conditions of Use

Effective date: 2026-07-16

This document explains important limits and conditions for using Brainworm
("the App"). It is informational and not legal advice. If you do not agree to
these conditions, do not use the App.

## 1. Purpose and scope

- Brainworm is an interface for third-party xAI models and user-configured MCP
  services.
- Text, images, audio, citations, code, and tool actions may be generated or
  triggered by services Brainworm does not operate or control.
- You are responsible for reviewing outputs and for any action you take based
  on them.

## 2. How the App works

- You provide your own xAI API key. Brainworm stores it in your browser and
  sends it to same-origin server routes, which forward requests to xAI without
  persisting the key on the server.
- MCP definitions and credentials are stored in your browser. Enabled MCP
  configuration may be sent to xAI so its Responses API can call those remote
  services.
- Generated images are stored in browser IndexedDB. Conversation metadata and
  settings are stored in browser local storage, and synthesized voice clips may
  be stored in the browser Cache API.
- Provider logging, retention, training, moderation, and data handling are
  controlled by the relevant provider, not by Brainworm.

## 3. AI outputs are unreliable

- Outputs may be inaccurate, fabricated, incomplete, biased, offensive,
  insecure, or unsuitable for your situation.
- Citations can be misleading or fail to support a claim. Code can contain
  security vulnerabilities or destructive behavior. Images and audio can
  misrepresent real people, places, or events.
- Independently verify outputs before using, publishing, executing, or relying
  on them.

## 4. No professional, emergency, or safety-critical use

- Brainworm is not a substitute for medical, mental-health, legal, financial,
  engineering, security, or other qualified professional advice.
- Do not use the App for crisis response, emergency decisions, life-support,
  or any context where an error could cause injury, death, or substantial harm.
- If you or someone else is in danger or crisis, contact local emergency
  services or an appropriate qualified professional. Do not rely on Brainworm
  or any AI model for intervention.

## 5. Not for children

- Brainworm is not designed, intended, or directed toward children. It may
  produce content that is inaccurate, disturbing, explicit, or otherwise
  inappropriate for minors.
- Children should not use Brainworm. Do not provide or promote access to the
  App for children.
- Do not deploy Brainworm in schools, youth programs, or other child-directed
  settings.
- Adults, guardians, administrators, and deployers are solely responsible for
  preventing inappropriate access and for any minor's use of the App.

## 6. Personal responsibility

- Do not submit secrets, confidential material, personal data, or regulated
  information unless you understand and accept how it may be transmitted and
  handled.
- Follow applicable laws, provider terms, intellectual-property rights, privacy
  obligations, and organizational policies.
- Review tool permissions before use. Web search, image generation, code tools,
  and MCP servers can disclose data or cause external actions.
- You are responsible for your prompts, configured services, selected
  permissions, outputs, tool actions, and downstream use.

## 7. Prohibited and harmful uses

Do not use Brainworm to:

- harass, exploit, stalk, manipulate, discriminate against, or impersonate
  another person;
- target children, minors, or vulnerable individuals;
- encourage self-harm, violence, illegal conduct, or dangerous activity;
- violate privacy, intellectual-property rights, laws, or third-party terms;
- create emotional dependency or simulate a human relationship.

## 8. Third-party services

Your use of xAI and any MCP server is subject to that service's terms, policies,
availability, pricing, rate limits, and data practices. Brainworm does not
control those services and cannot guarantee their behavior or continued
availability.

## 9. Assumption of risk

Brainworm is provided as is, without warranties. To the maximum extent
permitted by applicable law, its authors, contributors, and maintainers are not
liable for claims, losses, or damages arising from the App, AI outputs, tool
actions, configured third-party services, or your reliance on them. You assume
the risks of using the App.

## 10. Acceptance and updates

By using Brainworm, you confirm that you have read and accepted these
conditions. This document may change over time; continued use after an update
constitutes acceptance of the revised version.
