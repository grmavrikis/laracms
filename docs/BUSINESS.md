# The business

Why this is being built, what it sells for, what it costs to run, and how we
will know whether it works.

`TASKS.md` says what gets built and in what order. **This file says why that
order is right**, and it wins when the two disagree — the goal is revenue, not
a finished feature list.

Figures are working numbers, not research. They are here to be corrected by
reality, and every one of them should move once there is a real client.

---

## 1. The bet

> A one-person web agency can sell multilingual websites to small tourist
> accommodation businesses — apartments, small hotels, villas — using a CMS
> built and owned outright, and reach profitability faster than it would by
> assembling the same sites on WordPress.

**Why it is plausible.** Multilingual is native to this CMS: translations are
the data model, not a plugin. Greek tourist accommodation cannot function in
one language, and multilingual is exactly where cheap WordPress builds are
weakest — slow, half-translated, with URLs that break in the second language.
The product's one genuine strength is the market's one genuine pain.

**What would show the bet is lost.** Not "no sales" — see §7, where the
checkpoint is defined against the right measurement.

---

## 2. What is sold

**The package** — a multilingual accommodation website:

- 5 content areas: About, Rooms/Accommodation, Gallery, Blog, Contact
- Two languages, both complete
- Bought theme, adapted
- Admin panel the owner uses themselves
- Enquiry form, with submissions kept and emailed
- Booking hand-off to their channel manager
- Hosting, SSL, backups, core updates

**Extras**, priced separately:

- Additional language beyond two
- The back office — bookings and invoicing (`TASKS.md` #63, #64)
- Content writing, photography, translation — these are not included and
  should never be quietly absorbed

**Not sold:** an online shop. See `TASKS.md` → To discuss.

---

## 3. Pricing

|  | First 10 clients | Then |
|---|---|---|
| Build | **€290** | €800 |
| Monthly | **€25** | €30 |
| Extra language | €150 setup, +€5/month | same |
| Back office (bookings + invoicing) | +€25/month | same |

**The launch discount falls entirely on the build, never on the monthly.** The
build fee is the barrier to the first "yes"; the monthly is the business, and
raising it later on an existing client costs goodwill that a one-off discount
never does.

Frame it as *"introductory price, first ten clients"*, not as a price. That
makes €800 later the normal price rather than an increase.

**What the monthly covers**, stated so it does not become unlimited support:
hosting, SSL, backups, core updates, and up to 30 minutes of changes a month.
Beyond that, hourly.

**€290 is deliberately below the €400–600 that a WordPress build costs.** That
is a real risk and it is accepted, because the discount is buying something
specific: the first ten reference sites and the testimonials that come with
them. Two guards make it safe rather than reckless:

- **The package is fixed** (§2). At €290 for one day's work, one round of
  unbudgeted scope wipes out the margin entirely. Extras are quoted, always.
- **The monthly stays at €25.** Price-sensitive buyers are exactly the ones who
  will test whether the recurring fee is negotiable. It is not.

All figures are gross. Tax on the additional profit is the accountant's
department, but do not read these numbers as take-home.

### When the introductory price ends

> **At the tenth signed client with the deposit received — or 31 March 2027,
> whichever comes first.**

A signature with money against it, not a verbal yes: the count has to mean
something.

**The date is not decoration.** A count-only trigger has no time bound, so if
the tenth client takes two years then €290 is the price for two years and €800
never arrives. An introductory price exists to buy early adopters *quickly*;
the deadline is what makes it introductory rather than permanent.

March is chosen to fall at the end of the first selling season (§6), so the
increase coincides with a new one — which is also the easiest version to say
out loud.

### Payment terms

| | |
|---|---|
| Build | **50% deposit at signature**, balance on delivery |
| Monthly | **Billed annually in advance** — €300, or €270 prepaid |

**Bill the recurring fee yearly, not monthly.** Three reasons, and they
compound:

- **Administration.** Forty clients billed monthly is 480 invoices a year
  against 40. That time comes out of the same budget as support, which is the
  ceiling on the whole business (§5).
- **Invoice count.** The annual levy is understood to vary with earnings and
  the number of invoices issued — confirm with the accountant, but the
  administrative argument stands on its own.
- **Cash and churn.** Forty clients prepaying is €12,000 in hand rather than a
  trickle, and a client decides to stay once a year instead of twelve times.

The €270 prepaid rate is a 10% discount that buys all three. Most will take it.

---

## 4. What it costs to run

Ordered by when the money actually starts leaving.

### Now — €0

Development is local (Laragon); private repositories are free. Nothing is owed
until something has to be reachable from outside.

### Within days — the demo has to be live (~€6/month, ~€15/year)

| Item | Cost | Note |
|---|---|---|
| VPS (EU) | ~€4–6/month | Hetzner or similar; holds 5–10 sites |
| Domain | ~€10–15/year | The agency's own, and the demo's |
| SSL | €0 | Let's Encrypt |
| Business email on the domain | €0 to start | Free tiers exist; matters for outreach |
| Staging | €0 | A subdomain on the same VPS |

### Per client, one-off

| Item | Cost | Note |
|---|---|---|
| Theme | €20–60 | **Passed through to the client** — not your cost |
| Client domain | — | Theirs |

### At 3+ live sites (~€12–15/month)

Server management (Forge, Ploi). Deploy by hand until it hurts; it will, and
that is the signal to buy rather than to build. Writing this tooling yourself
is not what differentiates the product.

### Being a business — already paid for

**The freelancer registration is already active.** Contributions and the
accountant are owed whether or not this project exists, so from this project's
point of view they are **sunk, not incremental**. That is the single largest
piece of good news in this document.

What this project actually adds:

| Item | Amount | Frequency |
|---|---|---|
| Annual business levy | ~€300 | Yearly |
| Everything above (VPS, domain) | ~€6 | Monthly |

The levy varies with earnings and invoice count and should be confirmed with
the accountant, who is already engaged.

**Incremental cost of this business: about €6/month plus roughly €300 a year.**

---

## 5. Unit economics

### Per site

| | First site | From the 5th |
|---|---|---|
| Build time | 3–5 days | **1 day, or two afternoons** |
| Build fee (launch price) | €290 | €290 |
| Effective day rate | ~€70 | **~€290** |
| Recurring | €25/month | €25/month |
| Marginal cost | ~€1–2/month server share | same |

The time is the cost, and it falls sharply once the template library exists —
which is exactly why the demo is built as client #0 (`TASKS.md` #62) rather
than as a throwaway.

### Break-even — settled

The registration is already active, so from this project's point of view the
incremental cost is **~€6/month plus ~€300/year**.

**The first client makes it profitable.** Everything after is margin.

### But contribution margin is not a living

The two must not be confused, and this is where the plan needs its second half.

**At €290 the build is close to a loss-leader; the annuity is the business.**
One day's work returns one day's pay and little more. What it actually buys is
€25 a month for as long as the client stays — €590 in year one, €300 a year
after, **€1,190 over three years.** Price the build to *win the client*, not to
pay the bills.

Recurring revenue alone, before any build fees:

| Clients | Per month |
|---|---|
| 10 | €250 |
| 20 | €500 |
| 40 | €1,000 |
| 60 | €1,500 |

Plus the extra language and the back-office tier on whatever share take them —
which is why both exist.

### The ceiling, which is not sales

The limit on this business is **support minutes**, not customers.

At 30 minutes per client per month, 40 clients is 20 hours a month. At 60
minutes it is 40 hours — half a working month gone before a single new site is
built. One person therefore tops out somewhere around **40–80 clients**, and
where in that range is decided entirely by how much hand-holding each one
needs.

That makes support minutes per client the most valuable number to measure from
the very first client (§7). It is also the real argument for #67 site settings
and for a rigidly defined package: **every avoidable phone call raises the
ceiling of the whole business.**

### The two revenue levers already decided, stated as levers

1. **Languages are charged.** Near-zero marginal cost, pure margin. It is an
   upsell, not a setting — which is why clients must not be able to add one
   themselves (`TASKS.md` #52, #49).
2. **The back office is the premium tier, not a feature.** #63 and #64 exist to
   make a more expensive package possible. That is the real argument for
   building them, and it is also why they come after the demo: they raise the
   price of a sale that has to happen first.

---

## 6. How clients arrive

**Method:** direct approach to small accommodation businesses — apartments,
small hotels, villas. Cold, starting locally.

**The pitch is not the CMS.** Show a prospect the finished site of a business
like theirs, in two languages, and let them ask the price. What is being sold
is *"your guests find you in their own language"*, not *"a content management
system"*. Nobody buys a CMS.

**The demo is the sales tool** — which is why `TASKS.md` Phase 2 is the last
step of the MVP rather than a nice-to-have.

### The selling season is the off-season

Greek tourist accommodation runs roughly **May to October**. During it, owners
are working and will not sit down to discuss a website. They think about next
season, have cash from the last one, and have time to talk **between November
and March**.

Two consequences:

- **The MVP finishing in autumn lands at the start of the buying window.** That
  is fortunate rather than planned, and it is a reason not to let the build
  drift: a month lost in autumn is not a month, it is a season.
- Approaching owners in July is not persistence, it is wasted effort. If the
  demo slips past spring, the sensible move is to keep selling into the tail of
  the season and accept a slower start rather than force it in August.

**Decision on record:** no client is being sought until the demo exists. The
cost of that decision is known and accepted — the first few conversations would
probably have changed what gets built, most likely by making it smaller.

---

## 7. Checkpoints

**Measure the intermediate step, not just the sale.** Cold outreach converts in
the low single digits, so 0 sales in 10 approaches is statistically
unremarkable and would lead to the wrong conclusion.

Track two numbers separately:

| Signal | What it means | What to change |
|---|---|---|
| Few agree to *look* at the demo | The opening is wrong | The approach, the channel, who is being approached |
| Many look, none buy | The offer is wrong | Price, package, what is included |

**At 10 approaches: change one variable, run 10 more.** A checkpoint, not a
verdict — and one variable at a time, or the result cannot be read.

**Worth watching from the first client:**

- Days to build a site — the whole model rests on this reaching ~1
- Support minutes per client per month — the number that quietly destroys
  margin in this business
- How many take the extra language and the back office — these validate or kill
  the pricing tiers

---

## 8. Questions

### Settled (2026-09-01)

- **The freelancer registration is active.** Contributions and the accountant
  are sunk; the incremental cost is ~€6/month plus ~€300/year of levy. The
  first client is profit. This was the largest unknown in the plan.
- **The levy is roughly €300 a year**, varying with earnings and invoice count.
  Confirm the exact figure with the accountant.
- **€290 for the first ten**, accepted below the WordPress floor, with the two
  guards in §3.
- **A full site is the minimum sellable unit.** There is no smaller product to
  sell first.
- **The introductory price ends at the tenth deposit or 31 March 2027**,
  whichever comes first (§3). The date was added because a count alone has no
  time bound.

### Open

1. **Support minutes per client per month.** The number that sets the ceiling
   of the entire business (§5), and it cannot be guessed — measure it on the
   first client and every one after.
2. **What share buy the extras?** The back-office tier and the extra language
   are the whole argument for building `TASKS.md` #63, #64 and #52. If nobody
   buys them, that is a wrong bet worth discovering early — ask the first three
   clients whether they would pay for them, even before they exist.
3. **Does €290 attract the wrong client?** The risk named in §3. Price-sensitive
   buyers consume the most support, and support is the ceiling. Watch it in the
   first three and raise the price early if the pattern appears.
4. **Will they accept annual billing?** The €270 prepaid rate assumes yes, and
   the whole administrative case for it (§3) collapses if most insist on paying
   monthly. Test it on the first three; if they resist, the discount is too
   small rather than the idea wrong.
