<svelte:head>
	<title>SMS Terms of Service — household-hub</title>
</svelte:head>

<main>
	<p class="back"><a href="/">&larr; back to household-hub</a></p>

	<h1>household-hub — SMS Messaging Terms of Service</h1>
	<p class="effective">Effective date: May 17, 2026</p>

	<p>
		These Terms of Service govern the <strong>household-hub</strong> SMS messaging program.
		For how personal information is handled, see the separate
		<a href="/privacy">Privacy Policy</a>.
	</p>

	<h2>The program</h2>
	<p>
		household-hub is a private, household-scale communication relay operated by an
		individual for the members of one household. The SMS program delivers, by text
		message, the messages that other members of the same household have sent through
		the relay, so that a member who prefers text can take part. It is not a public
		service, is not marketed to the general public, and sends no advertising,
		promotional, or marketing content.
	</p>

	<h2>Message types and frequency</h2>
	<p>
		Messages are conversational: household coordination, reminders, plans, and
		logistics sent by other members of the same household. Message frequency is
		recurring and varies with household activity.
	</p>

	<h2>Cost</h2>
	<p>
		household-hub does not charge a fee for the SMS program.
		<strong>Message and data rates may apply</strong> — these are charged by your
		mobile carrier, not by household-hub.
	</p>

	<h2>How to opt in</h2>
	<p>
		A household member opts in by completing the consent form at
		<a href="/sms-opt-in">household.practicepartner.app/sms-opt-in</a>, where the member
		provides their mobile number and explicitly agrees to receive the household's
		messages by text. Only members of the one household are eligible; there is no
		public sign-up, and no number is ever added without that member's consent.
	</p>
	<p>
		After opting in, the member receives a one-time confirmation message:
		<em>“household-hub: You're now set up to receive your household's messages by
		text. Msg &amp; data rates may apply. Reply HELP for help, STOP to opt out.”</em>
	</p>

	<h2>Help</h2>
	<p>
		Reply <strong>HELP</strong> to any message for help, or email the operator at
		<a href="mailto:help@practicepartner.app">help@practicepartner.app</a>. The HELP reply
		identifies the program and points to STOP for opting out.
	</p>

	<h2>Opting out</h2>
	<p>
		Reply <strong>STOP</strong> (or CANCEL, END, QUIT, UNSUBSCRIBE, OPTOUT, REVOKE,
		STOPALL) to any message to stop receiving texts from household-hub. After opting
		out you receive a single confirmation that no further messages will be sent. You
		can opt back in at any time by replying START or by completing the opt-in form
		again.
	</p>

	<h2>Carriers</h2>
	<p>
		Carriers are not liable for any delayed or undelivered messages.
	</p>

	<h2>Changes</h2>
	<p>
		These terms may be updated; the effective date above reflects the most recent
		change. Continued participation after a change constitutes acceptance of the
		updated terms.
	</p>

	<h2>Contact</h2>
	<p>
		Questions about the SMS program may be sent to
		<a href="mailto:help@practicepartner.app">help@practicepartner.app</a>.
	</p>
</main>

<style>
	:global(body) {
		margin: 0;
		background: var(--bg);
		font-family:
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		color: var(--text);
	}

	main {
		max-width: 680px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		background: var(--surface);
		line-height: 1.55;
	}

	.back {
		font-size: 0.85rem;
	}

	h1 {
		font-size: 1.4rem;
		margin: 0.5rem 0 0.25rem;
	}

	.effective {
		color: var(--dim);
		font-size: 0.85rem;
		margin-top: 0;
	}

	h2 {
		font-size: 1.05rem;
		margin: 1.6rem 0 0.4rem;
	}

	a {
		color: var(--accent);
	}
</style>
