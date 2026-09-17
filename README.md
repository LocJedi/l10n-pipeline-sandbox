# l10n-pipeline-sandbox

A deliberately small website (five pages, one JSON locale file, ~40 strings)
built to exercise a full localization round-trip:

    GitHub repo → Crowdin → translation → back to GitHub → CI build passes (or fails)

It has no dependencies beyond Node 18+. There is no framework to fight.
The interesting part is not the site, it's what breaks between the two systems.

## Layout

    locales/en.json          source strings (ICU plurals + placeholders included on purpose)
    templates/*.html         pages using {{key}} placeholders
    scripts/build.js         renders dist/<locale>/ and FAILS on missing keys,
                             extra keys, empty values, broken placeholders, broken plurals
    crowdin.yml              Crowdin CLI / GitHub integration config
    .github/workflows/       CI: runs the build on every push and PR
    reference/fr.reference.json   a correct French translation, for comparison only.
                             Do NOT copy it into locales/ — the point is to let
                             Crowdin produce fr.json.

## Step 0 — prove the build works locally

    node scripts/build.js

Expected: `Built en → dist/`. Open `dist/en/index.html` in a browser.

## Step 1 — push to GitHub

Create an empty repo, then:

    git init && git add . && git commit -m "sandbox: source strings + build"
    git remote add origin git@github.com:<you>/l10n-pipeline-sandbox.git
    git push -u origin main

Check the Actions tab: the build should go green on `en` alone.

## Step 2 — connect Crowdin

Two routes. Do the CLI first; it makes the integration route legible.

**Route A — Crowdin CLI (manual, transparent)**

1. Create a project in Crowdin Enterprise, source language English, add French.
2. Create a personal access token (Account settings → API).
3. In the repo folder:

       export CROWDIN_PROJECT_ID=<id>
       export CROWDIN_PERSONAL_TOKEN=<token>
       crowdin upload sources --base-url https://<org>.api.crowdin.com
       # translate something in the Crowdin editor, then:
       crowdin download translations --base-url https://<org>.api.crowdin.com
       node scripts/build.js

4. Commit `locales/fr.json`. Watch CI.

**Route B — Crowdin GitHub integration (automated)**

Project → Integrations → GitHub → select this repo, `main`, and the `crowdin.yml`
in it. Crowdin will open a pull request (branch `l10n_main`) with translations.
Merge it. Watch CI.

## Step 3 — break things on purpose (this is the actual exercise)

Do these one at a time, after the happy path works. For each: what happens,
who notices, and at which stage — Crowdin, the PR, CI, or nobody?

1. **Untranslated key.** Leave `trails.card.viewMap` empty in Crowdin.
   Download. Does Crowdin export the source text, an empty string, or omit the key?
   Does the build catch it?
2. **Placeholder damaged in translation.** In Crowdin, translate
   `contact.success` as `Merci, {nom}.` Does Crowdin's QA flag it before export?
   Does the build?
3. **Source change mid-flight.** Rename `home.cta` → `home.browse` in `en.json`
   and push. What happens to the existing French translation of that key in Crowdin?
   What comes back on the next download?
4. **Plural with a missing case.** Translate `trails.duration` into a language
   that needs `few`/`many` (add Polish or Russian as a target). What does
   Crowdin show the translator, and what does the build do if a case is missing?
5. **Integration race.** With Route B active, push a source change and edit a
   translation in Crowdin within the same minute. Which side wins on the PR?

Write down what you found for each. That list — not the connection — is the
thing worth showing anyone.

## Notes

- `scripts/build.js` warns (does not fail) when a translation is identical to
  the source, because sometimes that's correct (brand names, "Message").
  Decide whether that should be a hard failure. Argue it both ways.
- `crowdin.yml` has a commented-out `content_segmentation` line and a
  commented-out `base_url`. Both are deliberate tripwires.

  ## Test addition
  Adding text for test branch commit
