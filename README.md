```
    ___       ___
   /   \     /   \    VESvault
   \__ /     \ __/    Encrypt Everything without fear of losing the Key
      \\     //                   https://vesvault.com  https://ves.host
       \\   //
 ___    \\_//
/   \   /   \         VESpost: e2ee Collaborative Sticky Notes
\__ /   \ __/         a libVES.subtle.js integration demo
   \\   //
    \\ //
     \_//
     /  \
     \__/
```

# VESpost — end-to-end encrypted collaborative sticky notes

[![Live demo](https://img.shields.io/badge/demo-live-2ea44f.svg)](https://vesvault.github.io/vespost/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Built on libVES.subtle.js](https://img.shields.io/badge/built%20on-libVES.subtle.js-6f42c1.svg)](https://ves.host/pub/libVES.js)

VESpost is a ~300-line, single-page web app that lets people keep shared notes
that are **encrypted in the browser before they ever leave the device**, share
each note with other people by email, and see an **authoritative history** of
every change — who changed what, when — with **no application server of your own
to run**.

It is a working reference for building collaborative, end-to-end encrypted apps
on [libVES.subtle.js](https://ves.host/pub/libVES.js). The "sticky notes" are
just a thin UI over a much more general primitive: a **shared, versioned,
end-to-end encrypted record store with live sync, per-record access control, and
an authoritative change log.**

## Why this is more than a notes toy

Most "E2EE" apps make you choose between security and usability. VES doesn't, and
VESpost demonstrates four things that are normally hard, each of which you get
essentially for free from `libVES.subtle`:

| Hard problem | How VESpost gets it for free |
|---|---|
| **Sharing encrypted data** with another person | `item.add(['user@acme.com'])` — VES does the end-to-end key exchange to that user's vault. No key servers, no fingerprint dance. |
| **Roles / access control** on encrypted data | Each share is `owner` / `admin` / plain reader; writers vs. read-only are distinguished by `item.writable()`. |
| **Losing your key ≠ losing your data** | VES's recovery & redundancy model — the "encrypt everything without fear of losing the key" promise — so non-technical users can actually use E2EE. |
| **Change log / attribution** | Every version records the author's vault, session id, remote IP, user-agent, and timestamp in an authoritative log kept by the VES repository. |

If you have ever wanted "shared notes/records that are genuinely end-to-end
encrypted, that a normal person can recover, with a real audit trail," this is
the smallest complete example of how to build it.

## How it works

```
  Browser (index.html + vespost.js)                     ves.host
  ┌───────────────────────────────┐                  ┌──────────────┐
  │ libVES.subtle('demo')         │  e2e-encrypted   │ VES          │
  │  · encrypt/decrypt in-browser │<───ciphertext───>│ Repository   │
  │  · key exchange for sharing   │   + live events  │  · items     │
  │  · VESpost UI (this repo)     │                  │  · sharing   │
  └───────────────────────────────┘                  │  · history   │
                                                     └──────────────┘
```

There is **no VESpost server**. The three static files are the entire app. All
storage, sync, sharing, and history live in the VES Repository at `ves.host`,
and all plaintext exists only inside the browser tab. `libVES.subtle('demo')`
runs the app on the **public shared `demo` VES domain** — great for trying it
out; use your own `x-*` domain (see [Concepts](#concepts)) for anything real.

## Quickstart

**Try it live:** [vesvault.github.io/vespost](https://vesvault.github.io/vespost/)
runs on the shared `demo` domain — no install, just click *Launch VESpost*.

To run it yourself you need nothing but a static file server (the app talks
directly to `ves.host`). From the repo root:

```sh
# any static server works; e.g. Python
python3 -m http.server 8080
# then open http://localhost:8080/  and click "Launch VESpost"
```

The first "Launch" opens the standard VES unlock popup so you can sign in to (or
create) a vault on the `demo` domain. After that:

- Type in the blank card to create a note (autosaves ~2s after you stop typing).
- Open a card's **≡** menu for **History Log**, **Delete**, or **Refuse**.
- Use **"add an email or vault id to the access list"** to share a note; tick
  **admin** to let that person re-share it too.
- Open the same note as a second user (share it to another email, sign in as
  that user in another browser) to watch live sync and the change log.

To ship your own version, copy the three files, swap the domain from `demo` to
your `x-yourapp` domain, and host them anywhere (S3, GitHub Pages, nginx…).

## A tour of the code

Everything is in [`vespost.js`](vespost.js). The whole integration surface is
small; here are the load-bearing lines.

**Bootstrap** — [`index.html`](index.html):

```js
var ves = libVES.subtle('demo');            // pick a VES domain
ves.unlocked().then((ok) => ok && demo_unlock());   // resume if already unlocked
// on launch:
ves.unlock().then((ves) => new VESpost(ves, demo_lock));
```

**Subscribe to everything, then render** — `VESpost` constructor:

```js
this.ves.onitemadd = this.ves.onitemremove = this.ves.onitemcreate =
this.ves.onitemdelete = this.ves.onitemchange = (ev) => this.event(ev);
this.ves.onauthexpire = (e) => this.done();     // vault about to auto-lock
this.ves.start(false)                            // replay the short history that
    .then(/* order the cards */);                //   yields the current state
```

`start(false)` replays just enough history to reconstruct current state and then
streams live events; `start(0)` would replay the entire history from the
beginning (used by the log view).

**Read / write a note** — one field, one call each:

```js
item.put(val)     // encrypt `val` in-browser, store a new version
item.get()        // fetch + decrypt the latest version
item.writable()   // is this vault allowed to overwrite? (drives read-only UI)
```

Saving is a 2s-debounced `put()` of the whole textarea (`oninput` →
`setTimeout`). See [Limitations](#limitations-and-non-goals) — this is
last-write-wins, not a merge.

**Share and set roles** — `createitem()`'s "newshare" form:

```js
let add = [input.value];                         // an email or vault id
if (admin.checked) {                             // optionally grant admin
    let ref = item.vault.vault(input.value);
    add.push(libVES.Vault.toUri({domain: '.admin', externalId: ref.externalId}));
}
item.add(add);                                   // e2e key exchange happens here
// ...
item.share()      // → Array of vaults, each with .owner/.admin/.current flags
item.remove(uri)  // revoke a share
item.refuse()     // decline a note someone shared with you
```

**The audit log** — `showlog()` replays the item's own history (`item.start(0)`)
and, per version, reads out `ev.detail.author`:

```js
ev.detail.at                 // Date of the change
ev.detail.item.version       // which version
ev.detail.author.vault.short()   // who
ev.detail.author.sessid          // which session
ev.detail.author.remote          // from what IP
ev.detail.author.userAgent       // on what device (parsed via UAParser)
ev.detail.item.get()             // the value at that version (still e2e)
```

That is the whole app. The full method reference for the library it sits on is
[`libVES.subtle.js`](https://github.com/vesvault/libVES.js/blob/master/doc/libVES.subtle.js).

## Concepts

- **VES domain** — the namespace your app runs in. `demo` is a public shared
  sandbox (fine for demos, *not* isolated). Create an `x-*` experimental domain
  for your own app so its items and users are separate.
- **Vault** — a user's set of keys. Unlocking a vault is what lets the browser
  decrypt; VES handles the recovery/redundancy so a lost passphrase isn't fatal.
- **Item** — one end-to-end encrypted, versioned record (`get`/`put`), addressed
  by an id (auto-assigned here). A note is one item.
- **Sharing** — `item.add(vaultIds)` performs the key exchange so those vaults
  can decrypt; `admin` shares can re-share; the item owner always retains
  control. Removing yourself from a non-owned item just drops your access.
- **Events & history** — VES stores an essential event history per object;
  `start()` both replays it and streams live changes. Author/session details are
  only visible to sessions with the same owner.

## Limitations and non-goals

Be honest about what this demo is and isn't:

- **Concurrent edits are last-write-wins.** A `put()` replaces the whole value.
  The UI flags a `changed` state when a remote version lands mid-edit, but does
  not merge. Real co-editing would need field-level merge or a CRDT on top.
- **Online-first.** There is no offline cache; the app expects to reach
  `ves.host`. That is by design for VES, but a production app should surface a
  clear "disconnected" state.
- **The `demo` domain is shared.** Don't put anything real on it. Use your own
  domain and consider your tenancy/branding needs before shipping.
- **It's a reference, not a product.** It demonstrates the integration; it isn't
  hardened, themed, or feature-complete.

## Files

| File | Purpose |
|---|---|
| [`index.html`](index.html) | Page shell, vault unlock/lock, launches `VESpost` |
| [`vespost.js`](vespost.js) | The whole app: the `VESpost` class |
| [`vespost.css`](vespost.css) | Styling for the card/share/log UI |

## License

VESpost is © 2025 - 2026 VESvault Corp, Jim Zubov &lt;jz@vesvault.com&gt;, released
under the **Apache License, Version 2.0** — see [`LICENSE`](LICENSE), [`NOTICE`](NOTICE),
and the SPDX header in each source file. The underlying `libVES.subtle.js` library
is also Apache-2.0.

Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
