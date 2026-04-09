# Talaria — Demo Script

> **Total runtime target:** ~10 minutes
> **Total cumulative MPP spend across everything you'll demo:** $0.1919 of a $1.00 cap
> **Pacing note:** read out loud, pause at the section breaks. Italics are stage directions for what to click.

---

## 1. Cold open

Hey. I'm going to walk you through Talaria — a personal financial intelligence dashboard I've been building on top of the Machine Payments Protocol, MPP. Tempo's per-call paid web for AI agents and software.

The premise was simple: I wanted to build something I'd actually use for my own life — basically, a data-driven version of Zillow tuned to how I think about housing — and use it as a proving ground for what the paid-per-call internet feels like in practice. Two birds, one stone: get a real product I keep using, and get an honest read on whether MPP is ready for real software.

---

## 2. Quick tour

*[open the dashboard]*

This is the home screen. Median Austin home price — five hundred and one K right now. Best 30-year mortgage rate. Fed cut and hike probabilities. My wallet balance up top, and today's spend right next to it.

*[click into Housing]*

This is the housing module — the centerpiece. On the right, Rate Watch with the best rates by term, the national 30-year average sparkline going back a year, the Fed forecast from Polymarket, and an Austin home value sparkline.

The middle is a live map of every active for-sale listing in Austin — about forty-eight hundred of them. I can filter by price, beds, baths, square footage, year built, days on market. There's a deal-scoring system that weights price-per-square-foot and time on market and surfaces the top matches in the right rail.

*[click on a pin to open the drawer]*

Click any pin, you get a listing detail drawer with the Street View photo, full specs, and the deal score. The address geocodes through OpenStreetMap, the photo comes from Google Street View paid per-call, and the listing itself came from RentCast paid per-call. We'll get to the costs in a second.

---

## 3. The data — paid and free

*[click the cost icon in the topbar]*

This is the cost catalog. Every action in the app is either paid or free, and they're all listed here.

The paid actions — the MPP-funded ones — are the small list at the top:

- **RentCast for the listings**, routed through Locus's MPP proxy. About 33 cents per refresh, which is ten paginated calls under the hood. I can re-pull the entire Austin metro for under a buck, and there's a server-enforced cooldown so I can't accidentally loop on it.
- **Google Street View for the listing photos**, routed through a proxy I built myself. One-tenth of a cent per listing, then cached on disk forever. Open a listing once — I pay. Open it again — free.

That's the whole paid surface. Two services. Everything else is free public data:

- **Bankrate** for the live mortgage rates
- **Polymarket** for the Fed cut/hike odds
- **FRED** — the Freddie Mac PMMS — for the historical 30-year average
- **Zillow's Home Value Index** for both the city-level price sparkline and the heat map I'll show you in a minute
- **Census ZCTA** polygons for the zip code boundaries
- **Stadia Maps** for the dark map tiles
- **Valhalla** for drive-time isochrones — if I want to know "where can I live and still be 30 minutes from downtown by car"
- **Nominatim** for address geocoding

The pattern that emerged across the project is interesting and I'll come back to it: the cheap MPP-paid data is the differentiator, but the free data is what makes the product actually useful around it.

---

## 4. The wallet and cost gating

*[open the wallet]*

Behind everything is a real EVM wallet. Not a mock — it's a viem-based wallet holding actual USDC.e on Tempo, plus visibility into balances on other chains. The signing key never lives in the app database; it's outside the project entirely. Talaria shells out to the agentcash CLI when it needs to sign a paid call, though for the photo path I've moved off that and onto the mppx client library directly — it's about three seconds faster per call because we're not paying for subprocess startup.

The other thing I built around the wallet is **spend gating.** Every single paid call has to be authorized — either by my explicit click or by a known-good auto-refresh schedule that I configured ahead of time. There's a hard one-dollar lifetime cap that's checked before every single call, and it's persisted to disk so it survives restarts and crashes. The cost pill in the topbar shows today's running spend.

*[click into Cost Analytics]*

And this is the full cost analytics page. Lifetime spend, this month, today, total calls, average cost per session. Daily spend chart. Cost-by-service donut. A complete transaction table with the rail icon, the service, the endpoint, the cost — searchable, date-filterable, exportable to CSV. This page has been load-bearing for me. I genuinely consult it.

A surprising side effect of building this: **knowing the per-call cost made me design differently.** When a call costs a tenth of a cent and you can see it in real time, you stop reaching for it casually. The cost meter becomes a forcing function for restraint, in a really healthy way. That's not a thing I expected going in.

---

## 5. The MPP latency story — and the reseller

OK, here's the structural problem I mentioned at the top, and the most interesting thing I learned across the whole project.

The first time I wired up Google Street View through Tempo's MPP proxy, calls were taking **15 to 35 seconds.** Completely unusable for any user-facing flow. And I had no idea where the slowness was. Was it Google? Was it MPP-on-Tempo as a whole? Was it specific to one proxy operator?

So I built a small latency harness and ran a wide sweep across six MPP services across three different proxy classes. The conclusion was sharp: **Locus-operated proxies were fast** — sub-second for things like OpenWeather, Mapbox, RentCast. **Direct integrations** like Alchemy were also fast. But **Tempo's own hosted proxies were 5 to 10 times slower than every other class.**

To rule out "maybe Google is just slow," I ran a controlled experiment. Same Alchemy upstream, called both directly and through Tempo's proxy. Same chain, same upstream API, same payment flow — only the proxy operator changed. Tempo's path was an order of magnitude slower. So it wasn't Google. It was the proxy.

Then I went one further and **built my own MPP reseller.** A small Hono server that handles the 402 challenge, accepts USDC.e on Tempo, and forwards the call to Google Maps using my own API key. End-to-end, my proxy is the fastest class I've measured. Not just faster than Tempo's — faster than Locus, faster than direct Alchemy. About **ten times faster and seven times cheaper per Street View call** than the original Tempo path.

Round 3 was wiring that proxy back into the live housing app, so the Street View photos you see in the drawer are flowing through it right now. Cached on disk after the first fetch, so opening a listing twice is free.

The big takeaway from this whole arc is: **the proxy operator is the bottleneck, not the protocol itself.** And building your own proxy is shockingly approachable. It took me a couple of hours. If MPP is going to be the substrate for user-facing software, the question of who runs the proxy matters more than the question of what's in the protocol.

---

## 6. Round 4 — the synthesis

*[back to Housing, click Price Trends in the left panel]*

The most recent thing I shipped is the best example of where I think MPP is going to live for the next year or two.

Watch this. I can pick any time period from one month to five years.

*[drag the slider, click a couple of presets]*

The map recolors in real time. Green is appreciation, red is decline. Westlake's holding value. East Austin is correcting hard from the 2022 peak. You can see the shape of the post-pandemic Austin housing story written across the city.

**This entire heat map costs zero dollars to render.** It's Zillow's free public Home Value Index for the per-zip price changes, plus Census zip code polygons. I download both with a script, filter to Austin, ship them as static files in the app. No MPP calls. No subscription. No API key.

But here's the thing — *[gesture to the pins]* — the listing pins on top of the heat map are the *one dollar* of MPP-paid RentCast data from Round 1. So the picture you're looking at right now is **the combination**: cheap MPP-paid live data layered on top of free public reference data, and the combination is more useful than either piece on its own.

If I tried to build this with paid data only, the cost would be prohibitive. If I tried to build it with free data only, I'd be missing the live listings. The combination is the story.

This is what I think MPP is genuinely good for, today: **small amounts of cheap, fresh, paid data layered on top of free public data, with the free data carrying the geographic and historical heavy lifting and the paid data providing the live edge.**

---

## 7. Honest pain points

A few things specifically about MPP — not about software in general — that I want to flag for whoever's listening:

**One.** The proxy operator matters more than anything else. Pick the wrong class of operator and your latency budget evaporates. The protocol itself is fine.

**Two.** The metadata you'd want to trust is frequently wrong. For every service I integrated I had to manually probe the 402 challenge to verify the payment type — charge versus session — because some endpoints declared one intent and actually billed differently. Published per-call prices drifted from real prices in a few places by enough to matter. I ended up wrapping every new service in a preflight that captures the live cost and intent and aborts if the catalog and reality disagree by more than 1.5x. And there's no central, verified registry of MPP services to begin with — what exists is scattered across operator docs and isn't always accurate. A canonical, ground-truthed service registry would be a huge accelerant for adoption.

**Three.** Some early tooling rough edges. The agentcash CLI was adding around four seconds of subprocess startup overhead per call, which I initially mis-attributed to server latency. Switching to the mppx client library directly cut that. Future MPP integrations should default to the client library.

**Four.** The mental model takes a beat to internalize. USDC.e on Tempo, gas in ETH, signing key in a wallet outside the project, fail-closed spend caps, the 402-challenge / pay / retry flow. None of it is hard, but each piece is one more thing a developer has to load before they can ship anything. A higher-level "spend a tenth of a cent to call this URL" abstraction would lower the bar a lot.

---

## 8. What MPP is great for, today

Despite all that, here's what's genuinely working right now:

- **One-shot paid lookups** where the per-call cost is a fraction of a cent and the user benefit is obvious. The listing photos are the cleanest example.
- **Combined paid-and-free data sourcing**, where the cost meter makes the spend transparent and a small amount of paid data unlocks a much larger free dataset.
- **Spend gating built into the product surface.** The protocol forces good habits about cost transparency that a Stripe-billed monthly API just doesn't.

---

## 9. Total spend and close

After everything I just showed you — four rounds of building, a six-service latency sweep, a controlled comparison experiment, building my own proxy, shipping the heat map — the **total MPP spend across the entire project is nineteen cents.** Out of a one-dollar cap I set at the very start. The cap has been load-bearing the whole time. It forced me to think hard about each call before I made it, and there's plenty of headroom left for the next round of features.

So that's Talaria. It's a real tool I use, built on a real protocol that's still finding its feet. The product is good. The protocol is promising. The gap between the two right now is mostly proxy operator quality — and that's fixable, today, by anyone willing to spend an afternoon writing a Hono server.

Thanks for watching.

---

## Appendix — facts you might want to drop in or leave out

Use these only if a moment opens up. Don't force them.

- **The Austin market story:** Westlake home values are up about 34% over the last 5 years; east Austin is down about 2%. The post-2022 correction is real and visible.
- **Street View has only ~40% residential coverage in Austin.** Mansions and gated cul-de-sacs are excluded by Google. The 40% rate is honest and acceptable for a demo, but it's a limitation worth naming if anyone asks.
- **The reseller is localhost-only right now.** It expects 127.0.0.1:8787. Making it deployable to real infrastructure is its own task and a future round.
- **Listing photos are cached forever after the first fetch.** A user opening a hundred listings with a cold cache spends about 4 cents on photos. Re-opening them spends nothing.
- **The heat map specifically uses Zillow's middle-tier ZHVI** — the 33rd-to-67th-percentile band — which is designed to track "the typical mid-range home" and naturally avoids the "one mansion in a trailer park" outlier problem you'd get from a raw mean.
- **The Round 4 fetcher pulls *two* Zillow CSVs** — one for the per-zip heat map data and one for the canonical city-level Austin median. Zillow's published city ZHVI is a proprietary weighted aggregate; a naive median across zip values is about 11% off, which I learned the hard way.
- **There are 110 unit tests** covering the parsers, the scoring system, and the cost catalog. tsc is clean. Direct-to-master, no branches.
