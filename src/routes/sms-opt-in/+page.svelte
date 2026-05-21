<script lang="ts">
	// SMS opt-in consent form (M34, hardened for A2P resubmission). A household
	// member records their explicit agreement to receive the household's text
	// messages — the documented, verifiable consent A2P 10DLC requires.
	// Submitting POSTs to /api/sms-consent, which stores one row in
	// `sms_consents`.
	let name = $state('');
	let phone = $state('');
	let agreed = $state(false);
	let submitting = $state(false);
	let errorText = $state('');
	let done = $state(false);

	async function submit() {
		errorText = '';
		if (name.trim() === '') {
			errorText = 'Please enter your name.';
			return;
		}
		if (phone.replace(/\D/g, '').length < 10) {
			errorText = 'Please enter a valid mobile phone number.';
			return;
		}
		if (!agreed) {
			errorText = 'Please check the box to give your consent.';
			return;
		}
		submitting = true;
		try {
			const res = await fetch('/api/sms-consent', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), phone: phone.trim(), agreed })
			});
			if (!res.ok) {
				errorText = `Could not record your consent (HTTP ${res.status}). Please try again.`;
				return;
			}
			done = true;
		} catch {
			errorText = 'Could not record your consent — network error. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>SMS Opt-In — household-hub</title>
</svelte:head>

<main>
	<p class="back"><a href="/">&larr; back to household-hub</a></p>

	<h1><img class="brand-logo" src="/favicon.png" alt="" />household-hub — SMS Opt-In</h1>

	{#if done}
		<p class="success" role="status">
			Thank you — your consent has been recorded. You're set to receive your
			household's messages by text. You'll get a one-time confirmation message
			shortly. Reply <strong>HELP</strong> for help, <strong>STOP</strong> to opt out
			at any time.
		</p>
	{:else}
		<p>
			Use this form to opt in to the <strong>household-hub</strong> SMS messaging
			program. household-hub is a private relay for one household: when a member sends
			a message it is relayed to the other members of that household. By opting in you
			agree to receive these messages by text.
		</p>

		<p class="optional">
			<strong>SMS is optional.</strong> Opting in to SMS is not required to use
			household-hub. A member can take part through the web app or by email without
			ever opting in to SMS. SMS is one of three optional channels — choose whichever
			you prefer.
		</p>

		<h2>What you'll receive</h2>
		<p>
			Conversational household messages from the other members of your household —
			coordination, reminders, plans, and logistics. Examples of the messages you
			might receive:
		</p>
		<ul class="samples">
			<li>
				<em>household-hub: You're now set up to receive your household's messages by
				text. Msg &amp; data rates may apply. Reply HELP for help, STOP to opt out.</em>
				(one-time confirmation after opting in)
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
		<p>
			<strong>Message frequency varies</strong> with household activity — there is no
			fixed cadence. <strong>Message and data rates may apply</strong> (charged by your
			mobile carrier, not by household-hub). Reply <strong>HELP</strong> for help; reply
			<strong>STOP</strong> at any time to stop receiving texts. The program sends no
			marketing, promotional, or advertising content.
		</p>

		<p class="emphasis">
			<strong>Privacy:</strong> No mobile information — including your mobile phone
			number, SMS opt-in data, and consent — is sold, rented, or shared with any third
			party or affiliate for marketing or promotional purposes. SMS opt-in data and
			consent are not shared with any third party for any purpose. Full details are in
			the <a href="/sms-terms">SMS Terms of Service</a> and
			<a href="/privacy">Privacy Policy</a>.
		</p>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label>
				<span>Your name</span>
				<input type="text" bind:value={name} autocomplete="name" required />
			</label>

			<label>
				<span>Mobile phone number</span>
				<input type="tel" bind:value={phone} autocomplete="tel" required />
			</label>

			<label class="consent">
				<input type="checkbox" bind:checked={agreed} />
				<span>
					By checking this box and pressing <strong>Give consent</strong>, I expressly
					agree to receive recurring SMS text messages from household-hub at the
					mobile number above. These messages are conversational household
					communications relayed from other members of my household; message
					frequency varies with household activity.
					<strong>Msg &amp; data rates may apply.</strong> Reply
					<strong>HELP</strong> for help, or <strong>STOP</strong> to cancel at any
					time. I confirm I am the account holder of this mobile number (or have the
					account holder's permission) and I am at least 18 years old. I have read
					and agree to the <a href="/sms-terms">SMS Terms of Service</a> and the
					<a href="/privacy">Privacy Policy</a>. Consent is not required to use
					household-hub — the SMS program is one optional way to receive your
					household's messages.
				</span>
			</label>

			{#if errorText}
				<p class="error" role="alert">{errorText}</p>
			{/if}

			<button type="submit" disabled={submitting}>
				{submitting ? 'Submitting…' : 'Give consent'}
			</button>
		</form>

		<p class="carriers">
			Carriers — including AT&amp;T, T-Mobile, Verizon Wireless, U.S. Cellular, Sprint,
			and Boost — are not liable for delayed or undelivered messages.
		</p>
	{/if}
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
		max-width: 600px;
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
		margin: 0.5rem 0 0.75rem;
	}

	.brand-logo {
		height: 1.5em;
		width: auto;
		vertical-align: -0.34em;
		margin-right: 0.4rem;
	}

	h2 {
		font-size: 1rem;
		margin: 1.2rem 0 0.3rem;
	}

	.samples {
		margin: 0.4rem 0;
		padding-left: 1.1rem;
	}

	.samples li {
		margin: 0.3rem 0;
		font-size: 0.92rem;
	}

	.emphasis {
		background: var(--raised);
		border-left: 3px solid var(--accent);
		padding: 0.6rem 0.8rem;
		font-size: 0.92rem;
	}

	.optional {
		background: var(--raised);
		border: 1px solid var(--accent);
		border-radius: 0.5rem;
		padding: 0.6rem 0.8rem;
		font-size: 0.92rem;
	}

	.success {
		background: var(--raised);
		border-left: 3px solid var(--accent);
		padding: 0.8rem 1rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.9rem;
		font-weight: 600;
	}

	input[type='text'],
	input[type='tel'] {
		font: inherit;
		padding: 0.5rem;
		border: 1px solid var(--border-strong);
		border-radius: 0.4rem;
		background: var(--surface);
		color: var(--text);
	}

	label.consent {
		flex-direction: row;
		align-items: flex-start;
		gap: 0.5rem;
		font-weight: 400;
		font-size: 0.88rem;
		line-height: 1.5;
	}

	label.consent input {
		margin-top: 0.25rem;
		flex: none;
	}

	button {
		font: inherit;
		padding: 0.6rem 1rem;
		border: 1px solid var(--accent);
		border-radius: 0.4rem;
		background: var(--accent);
		color: var(--on-accent);
		cursor: pointer;
		align-self: flex-start;
	}

	button:disabled {
		background: var(--faint);
		border-color: var(--faint);
		cursor: not-allowed;
	}

	.error {
		margin: 0;
		color: var(--danger);
		font-size: 0.88rem;
	}

	.carriers {
		margin-top: 1.2rem;
		font-size: 0.82rem;
		color: var(--dim);
	}

	a {
		color: var(--accent);
	}
</style>
