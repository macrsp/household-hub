<script lang="ts">
	// SMS opt-in consent form (M34). A household member records their explicit
	// agreement to receive the household's text messages — the documented,
	// verifiable consent A2P 10DLC requires. Submitting POSTs to
	// /api/sms-consent, which stores one row in `sms_consents`.
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
			program. household-hub is a private relay for one household: when a member
			sends a message it is relayed to the other members of that household. By
			opting in you agree to receive these messages by text.
		</p>

		<p class="disclosure">
			By submitting this form you agree to receive <strong>recurring SMS text
			messages</strong> from the household-hub relay (household coordination,
			reminders, plans, and logistics). Message frequency varies with household
			activity. <strong>Message and data rates may apply.</strong> Reply
			<strong>HELP</strong> for help and <strong>STOP</strong> to opt out at any
			time. See the <a href="/sms-terms">SMS Terms of Service</a> and
			<a href="/privacy">Privacy Policy</a>. Your mobile number and consent are
			never sold or shared with any third party for marketing.
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
					I agree to receive recurring SMS text messages from household-hub at the
					number above. Message frequency varies; message and data rates may apply.
					Reply HELP for help, STOP to opt out.
				</span>
			</label>

			{#if errorText}
				<p class="error" role="alert">{errorText}</p>
			{/if}

			<button type="submit" disabled={submitting}>
				{submitting ? 'Submitting…' : 'Give consent'}
			</button>
		</form>
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
		max-width: 560px;
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

	.disclosure {
		background: var(--raised);
		border-left: 3px solid var(--accent);
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
	}

	label.consent input {
		margin-top: 0.2rem;
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

	a {
		color: var(--accent);
	}
</style>
