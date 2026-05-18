# household-hub — A2P 10DLC Model Campaign Registration

The exact, field-by-field content to enter when resubmitting the A2P 10DLC
campaign in the Twilio Console. Derived from Twilio's "A2P 10DLC Campaign
Onboarding Guide" and the actual rejection error **30896 — Campaign vetting
rejection, Opt-in Error**.

Resubmitting costs ~$15 (campaign vetting). Submit once, with everything below.
Before paying, optionally open a free Twilio Support case to confirm there is
no additional rejection code beyond 30896.

---

## Use case
`SOLE_PROPRIETOR`

## Campaign description
> Messages are sent by household-hub to the members of one private household
> who have opted in. household-hub is a private message relay: when one member
> sends a message, it is relayed to the other members of the same household by
> text. Messages cover household coordination, reminders, plans, and logistics.
> This is not marketing, promotional, or bulk messaging. Recipients are only
> members of the one household; each member opts in individually through the
> web consent form at https://household.practicepartner.app/sms-opt-in. Registered
> under a Sole Proprietor Brand.

## Message flow — "How do end-users consent to receive messages?"
This field is the cause of error 30896 — it must name the opt-in URL, the
privacy policy URL, and the terms of service URL explicitly.

> End users opt in through a publicly accessible website consent form at
> https://household.practicepartner.app/sms-opt-in
>
> WHO opts in: members of one private household.
> WHERE: the public web form above (no login or gate — a reviewer can open the
> URL directly).
> HOW consent is collected: on the form, each household member enters their
> name and mobile phone number and ticks a consent checkbox that is unchecked
> by default. At the point of phone-number collection the form displays the
> program name (household-hub); a description of the messages (household
> coordination, reminders, plans, and logistics); the frequency disclosure
> "Message frequency varies"; the fee disclosure "Message and data rates may
> apply"; "Reply HELP for help"; and "Reply STOP to opt out".
>
> The SMS consent checkbox is separate from any other agreement and the
> consent is collected specifically for this campaign only — it is not shared,
> sold, or transferred. There is a single opt-in method (this web form); there
> is no keyword opt-in.
>
> Privacy policy: https://household.practicepartner.app/privacy
> Terms of service: https://household.practicepartner.app/sms-terms

## Privacy policy URL
`https://household.practicepartner.app/privacy`
(Already includes the mobile-number non-sharing statement, message frequency,
and the "Message and data rates may apply" disclosure that error 30896 asks
for.)

## Terms of service URL
`https://household.practicepartner.app/sms-terms`
**Must NOT be the same URL as the privacy policy** — that duplication caused
the "Terms and Conditions" rejection.

## Sample messages
Use `[Name]` as a placeholder — do not put real names in registration fields.

1. `household-hub | [Name]: Don't forget the dentist at 3 — leaving in 20. Reply STOP to opt out.`
2. `household-hub | [Name]: Running late, start dinner without me. Reply STOP to opt out.`
3. `household-hub | [Name]: Can someone grab milk and bread on the way home? Reply STOP to opt out.`
4. `household-hub | [Name]: Plumber scheduled [Date] between 9–11 AM. Reply STOP to opt out.`
5. `household-hub | [Name]: Heading to the store — anything needed? Reply STOP to opt out.`

Content checkboxes: leave **all four unchecked** — no embedded links, no phone
numbers, no direct-lending content, no age-gated content.

## Opt-in keywords
Leave **empty** — opt-in is via the web form, not a keyword.

## Opt-in confirmation message
> household-hub: You're now set up to receive your household's messages by
> text. Message frequency varies. Msg & data rates may apply. Reply HELP for
> help, STOP to opt out.

(Brand name, recurring/frequency disclosure, rates disclosure, HELP, STOP.)

## Opt-out keywords
`STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT, REVOKE`

## Opt-out message
> household-hub: You have successfully been unsubscribed. You will not receive
> any more messages. Reply START to resubscribe.

(Added the brand name, which the guide requires.)

## Help keywords
`HELP, INFO`

## Help message
> household-hub: For help, email help@practicepartner.app. Message frequency
> varies. Msg & data rates may apply. Reply STOP to opt out.

(Added the brand name and a support contact, which the guide requires.)

---

## Notes
- Brand website field: `https://household.practicepartner.app` (it loads — verified).
- The customer-support address is `help@practicepartner.app` — a branded
  address on the registered brand's domain, which reads as more consistent to
  reviewers than a Gmail address. (A Gmail address would not by itself fail a
  Sole Proprietor brand, but the branded address is the stronger choice.)
- The use case (private household coordination) is in no forbidden category.
- The `/sms-opt-in` form is public, so a hosted screenshot is not required —
  but attaching one does no harm.

## What changed since the rejected submission
| Field | Before | After |
| --- | --- | --- |
| Terms of service URL | `/privacy` (duplicate) | `/sms-terms` |
| Message flow | verbal/in-person narrative | web form + all three URLs |
| Sample messages | real names (Matt, Julie, Bob) | `[Name]` placeholder |
| Opt-in confirmation | no frequency disclosure | adds "Message frequency varies" |
| Opt-out message | no brand name | prefixed "household-hub:" |
| Help message | no brand name, no support contact | adds both |
