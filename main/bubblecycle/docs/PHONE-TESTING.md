# Testing on real phones

The automated tests use Chrome with a **virtual** passkey authenticator, a **mocked** GPS position and a **fake** camera. They show
that the app and server behave correctly when those inputs behave. They do **not** show that Face ID, fingerprint sensors, real GPS,
real cameras, iOS Safari or Android keyboards work. This checklist is how you find out. Record the device, OS and browser for each
line; "not tested" is a fine answer.

Set up an HTTPS address first: [STAGING.md](STAGING.md), section 2. Use a fresh browser profile (or clear the site's data) for each
device so first-use behaviour is tested.

## Devices

Test at least: one recent iPhone (Safari), one recent Android phone (Chrome), and one older or low-end phone if you can.

## Checklist

**Install**
- [ ] The page opens over `https://`, no certificate warning.
- [ ] Add to Home screen / Install works; it opens full screen with the RECYCL IT! icon.
- [ ] After installing, the first screen loads without a "couldn't start" message.

**Account and confirming it's you** (live or demo-server staging)
- [ ] Profile › Sign in › *Create an account with a passkey* shows the phone's own prompt (Face ID, fingerprint or screen-lock PIN).
- [ ] Cancelling the prompt shows a clear message and nothing is created.
- [ ] Log recycling: fill the form, press *Confirm and log it*. The explanation appears the first time only. The phone prompts. Success shows points.
- [ ] Failing the prompt on purpose (wrong finger, cancel) keeps the form as typed and offers *Try again*.
- [ ] Redeem a reward: the prompt appears after tapping *Confirm and redeem*; cancelling keeps the reward selected.
- [ ] Double-tapping the submit button logs once.
- [ ] A phone with no screen lock shows the "no screen lock" message (and, on a demo server only, the labelled simulated step).
- [ ] The wording never claims the app verified that you recycled or that you are one person.

**Camera** (Scan, Check-in photo)
- [ ] The permission prompt appears when the camera is first needed, not on page load.
- [ ] Denying it shows the "camera is off" explanation and manual barcode entry still works.
- [ ] Scanning the real cans and bottles finds Red Bull (8-digit barcode), Focus Water Reload and Limonade Minze Bio; any other barcode says it is not in this pilot catalogue.
- [ ] The check-in photo preview appears; *Retake* and *Skip photo* work.

**Location** (Map, Check-in)
- [ ] The permission prompt appears only when you press the locate / check button.
- [ ] Standing at a station, the check-in says *near* and the accuracy figure looks plausible. Note the figure and the conditions.
- [ ] Indoors or far away, it says *far* or *too rough to check* and offers *Try again* or *Continue*.
- [ ] Denying location lets you continue as self-reported.

**Keyboard and layout** (the part desktop tests cannot cover)
- [ ] Opening the on-screen keyboard in *Log recycling* (item count, receipt code) keeps the focused field and the submit button reachable.
- [ ] The same in *Add a place*, the nickname field, and the appeal note.
- [ ] Rotating the phone doesn't lose the form.
- [ ] VoiceOver / TalkBack: a dialog announces its name, focus stays inside it, closing it returns focus to the button you used.

**Offline**
- [ ] Open the app once online, then enable airplane mode and close and reopen it: it opens.
- [ ] The "You're offline" notice appears; the map says tiles aren't available.
- [ ] Logging while offline says *Saved on this device, not counted yet* (server version) and appears under Activity › *Saved on this device*.
- [ ] Back online, *Confirm and send* sends it; the server accepts or refuses it with a reason.

**Updates**
- [ ] Deploy a small change. Reopen the installed app: *A new version is ready* appears and does not reload by itself.
- [ ] With a form open the *Update now* button is disabled with an explanation; after closing the form it works and the app reloads.

**Accessibility and comfort**
- [ ] Text is readable at the largest system font size; nothing is cut off.
- [ ] Dark mode / reduced motion settings don't break screens.
