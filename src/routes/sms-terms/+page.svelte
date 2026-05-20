<svelte:head>
	<title>SMS Terms of Service — household-hub</title>
</svelte:head>

<main>
	<p class="back"><a href="/">&larr; back to household-hub</a></p>

	<h1>
		<img class="brand-logo" src="/favicon.png" alt="" />household-hub — SMS Messaging Terms
		of Service
	</h1>
	<p class="effective">Effective date: May 20, 2026</p>

	<p>
		These Terms of Service govern the <strong>household-hub</strong> SMS messaging program.
		For how personal information is handled, see the separate
		<a href="/privacy">Privacy Policy</a>.
	</p>

	<h2>The program and the sender</h2>
	<p>
		household-hub is a private, household-scale communication relay operated by one
		individual for the members of a single household. The SMS program delivers, by text
		message, the messages that other members of the same household have sent through the
		relay, so that a member who prefers text can take part. It is not a public service,
		is not marketed to the general public, and sends no advertising, promotional, or
		marketing content. The brand identifying the SMS sender is <strong>household-hub</strong>;
		the operator can be reached at
		<a href="mailto:help@practicepartner.app">help@practicepartner.app</a>.
	</p>

	<h2>Message types</h2>
	<p>
		Messages are conversational household communications written by other members of the
		same household. They cover household coordination, reminders, plans, and logistics.
		The program also sends one welcome message after a member opts in, and one
		confirmation message after a member texts STOP or HELP. The program sends no
		marketing, promotional, or advertising content of any kind.
	</p>

	<h2>Sample messages</h2>
	<ul class="samples">
		<li>
			<em>household-hub: You're now set up to receive your household's messages by
			text. Msg &amp; data rates may apply. Reply HELP for help, STOP to opt out.</em>
		</li>
		<li><em>[Sarah]: I'll be home around 6, picking up dinner on the way.</em></li>
		<li>
			<em>[Dad]: Can someone walk the dog this afternoon? I'm stuck at work.</em>
		</li>
		<li>
			<em>[Mom]: Heads up — soccer practice is cancelled tomorrow because of the
			weather.</em>
		</li>
	</ul>

	<h2>Message frequency</h2>
	<p>
		Message frequency is recurring and varies with household activity. There is no fixed
		cadence; messages are sent only when another household member sends one through the
		relay.
	</p>

	<h2>Cost</h2>
	<p>
		household-hub does not charge a fee for the SMS program.
		<strong>Message and data rates may apply</strong> — these are charged by your mobile
		carrier, not by household-hub.
	</p>

	<h2>How to opt in</h2>
	<p>
		A household member opts in by completing the consent form at
		<a href="/sms-opt-in">household.practicepartner.app/sms-opt-in</a>. The form
		identifies the program, describes the messages, states the frequency, links these
		Terms and the Privacy Policy, and includes an unchecked consent box the member must
		tick to record an affirmative consent. Only members of the one household are eligible;
		there is no public sign-up, and no number is ever added without that member's express
		consent.
	</p>
	<p>
		After opting in, the member receives a one-time confirmation message:
		<em>“household-hub: You're now set up to receive your household's messages by text.
		Msg &amp; data rates may apply. Reply HELP for help, STOP to opt out.”</em>
	</p>

	<h2>Help</h2>
	<p>
		Reply <strong>HELP</strong> to any message for help, or email the operator at
		<a href="mailto:help@practicepartner.app">help@practicepartner.app</a>. A HELP reply
		identifies the program and points to STOP for opting out.
	</p>

	<h2>Opting out</h2>
	<p>
		Reply <strong>STOP</strong> (or CANCEL, END, QUIT, UNSUBSCRIBE, OPTOUT, REVOKE,
		STOPALL) to any message to stop receiving texts from household-hub. After opting out
		you receive a single confirmation that no further messages will be sent. You can opt
		back in at any time by replying <strong>START</strong> or by completing the opt-in
		form again.
	</p>

	<h2>Privacy of your mobile information</h2>
	<p class="emphasis">
		No mobile information — including your mobile phone number, SMS opt-in data, and
		consent — is sold, rented, or shared with any third party or affiliate for marketing
		or promotional purposes. SMS opt-in data and consent are not shared with any third
		party for any purpose. Information is processed only by the service providers
		required to deliver the relay, listed in the
		<a href="/privacy">Privacy Policy</a>.
	</p>

	<h2>Carriers</h2>
	<p>
		Carriers — including AT&amp;T, T-Mobile, Verizon Wireless, U.S. Cellular, Sprint, and
		Boost — are not liable for delayed or undelivered messages. Delivery is on a
		best-effort basis through your carrier; household-hub does not guarantee delivery.
	</p>

	<h2>Eligibility</h2>
	<p>
		You must be the account holder of the mobile number you opt in, or have the account
		holder's permission to opt that number in. The program is intended for adults; a
		minor's number may be added only with parental consent.
	</p>

	<h2>Changes</h2>
	<p>
		These terms may be updated; the effective date above reflects the most recent change.
		Continued participation after a change constitutes acceptance of the updated terms.
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

	.brand-logo {
		height: 1.5em;
		width: auto;
		vertical-align: -0.34em;
		margin-right: 0.4rem;
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

	.samples {
		margin: 0.4rem 0;
		padding-left: 1.1rem;
	}

	.samples li {
		margin: 0.3rem 0;
	}

	.emphasis {
		background: var(--raised);
		border-left: 3px solid var(--accent);
		padding: 0.6rem 0.8rem;
		font-weight: 500;
	}

	a {
		color: var(--accent);
	}
</style>
