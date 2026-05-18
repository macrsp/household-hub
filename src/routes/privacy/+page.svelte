<svelte:head>
	<title>Privacy Policy — household-hub</title>
</svelte:head>

<main>
	<p class="back"><a href="/">&larr; back to household-hub</a></p>

	<h1>household-hub — Privacy Policy</h1>
	<p class="effective">Effective date: May 17, 2026</p>
	<p>
		This Privacy Policy describes how household-hub handles personal information. The
		separate <a href="/sms-terms">SMS Terms of Service</a> describes the text-messaging
		program itself.
	</p>

	<h2>About household-hub</h2>
	<p>
		household-hub is a private, household-scale communication relay operated by an
		individual for the members of one household. It is not a public service and is not
		marketed or offered to the general public. It relays messages among a small, fixed
		group of household members across SMS, email, and a web application, so that each
		member can take part using whichever channel they prefer.
	</p>

	<h2>Information we collect</h2>
	<ul>
		<li>Household members' display names.</li>
		<li>Mobile phone numbers, for members who receive messages by SMS.</li>
		<li>Email addresses, for members who receive messages by email.</li>
		<li>The content and timestamps of messages sent through the relay.</li>
	</ul>
	<p>
		This information is provided by the household administrator when a member is added.
		household-hub has no public sign-up.
	</p>

	<h2>How we use information</h2>
	<p>
		Information is used solely to operate the relay: to attribute each message to the
		member who sent it and deliver a copy to the other members of the same household
		through their chosen channel. household-hub does not use any information for
		advertising or marketing, does not build advertising profiles, and does not track
		members across other sites or services.
	</p>

	<h2>SMS / text messaging</h2>
	<p>
		A household member consents to receive SMS messages by completing the opt-in form
		at <a href="/sms-opt-in">household.practicepartner.app/sms-opt-in</a>, where they provide
		their mobile number and explicitly agree to take part. SMS messages relay messages
		that other members of the same household have sent. Message frequency varies with
		household activity. Message and data rates may apply. Reply <strong>STOP</strong> to
		any message to stop receiving SMS messages; reply <strong>HELP</strong> for help.
		Full details are in the <a href="/sms-terms">SMS Terms of Service</a>.
	</p>
	<p class="emphasis">
		No mobile information — including mobile phone numbers and SMS opt-in or consent —
		is sold, rented, or shared with any third party or affiliate for marketing or
		promotional purposes. SMS opt-in data and consent are not shared with any third
		party for any purpose.
	</p>

	<h2>How information is shared</h2>
	<p>
		household-hub does not sell or rent personal information. Message data is processed
		only by the service providers required to operate the relay, each acting on
		household-hub's behalf and not permitted to use the data for their own purposes:
	</p>
	<ul>
		<li><strong>Cloudflare</strong> — application hosting and database.</li>
		<li><strong>Twilio</strong> — SMS delivery.</li>
		<li><strong>Resend</strong> — email delivery.</li>
	</ul>
	<p>
		These providers receive only what is needed to deliver a message. Mobile opt-in and
		consent data is not shared with any third party.
	</p>

	<h2>Data retention</h2>
	<p>
		Messages and member records are kept for as long as the household relay remains in
		use. A household member may ask for their information and message history to be
		removed by contacting the operator at the address below.
	</p>

	<h2>Opting out</h2>
	<p>
		Reply <strong>STOP</strong> to any SMS message to stop receiving texts from
		household-hub. Reply <strong>HELP</strong> for help. To be removed from the relay
		entirely, contact the operator.
	</p>

	<h2>Contact</h2>
	<p>
		Questions, or requests to remove information, may be sent to
		<a href="mailto:help@practicepartner.app">help@practicepartner.app</a>.
	</p>

	<hr />

	<p>
		The text-messaging program — message types, frequency, cost, HELP and STOP
		instructions, and how to opt in — is described in the separate
		<a href="/sms-terms">SMS Terms of Service</a>.
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

	.emphasis {
		background: var(--raised);
		border-left: 3px solid var(--accent);
		padding: 0.6rem 0.8rem;
		font-weight: 500;
	}

	hr {
		margin: 2rem 0;
		border: none;
		border-top: 1px solid var(--border);
	}

	a {
		color: var(--accent);
	}
</style>
