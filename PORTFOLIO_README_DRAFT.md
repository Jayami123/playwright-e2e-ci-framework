# I test the places where web apps break for real users

QA engineer with 2.5 years in industry, open to remote roles and contract work.

This repository is the end-to-end UI testing part of my QA portfolio. Most automated UI suites click through the main path and confirm each page loads. That catches a broken button. It rarely catches the bug a customer reports in launch week, like an order that is canceled and fulfilled at the same time, or a login code that works twice. I write tests aimed at the spots where those bugs live. Two people acting at once. Security codes. Time zones and daylight saving. File imports. Screen readers, other languages and right-to-left layouts. How each page looks on a phone, a tablet and a desktop.

To prove the method carries over, I pointed the same approach at four open-source products that have nothing in common. Medusa is an online store, Cal.com is a booking tool, Documenso handles e-signatures and Twenty is a CRM. Across more than 150 browser tests I found 30 product bugs confirmed in repeat runs. If your product has sign-in, checkout, scheduling or shared records, I can test it the same way.

## What that looks like in practice

- **One-time login codes worked a second time.** This happened on three of the four products, which weakens the two-factor sign-in meant to stop account takeover.
- **An order ended up canceled and fulfilled at once.** On Medusa, a cancel and a fulfillment sent together both went through. I repeat the race on 10 fresh orders every run so one lucky timing can't hide it.
- **A new contact counted but never shown.** On Twenty, a record added by a teammate raised the list count to 2 while the list still showed one row, in 17 of 17 tries.
- **A login page that froze.** On Twenty, the sign-in form never appeared on about 1 in 100 page loads, and up to 4.5% when two browsers loaded it in parallel.
- **A signing page stuck on a spinner.** On Documenso, when the document request never answered, the signer saw a loading spinner for at least 60 seconds with no error message.
- **Booking times off by 15 minutes.** On Cal.com, a visitor in Kathmandu saw every slot shifted off the host's schedule.

## Why the numbers hold up

Every test runs on GitHub's servers on each change and every night, against fresh copies of the products in pinned containers, never on my laptop. A bug only counts once repeat runs reproduce it, and its test is written to expect the failure, so if the bug ever stops showing up the build turns red and the count can't go stale.

## Next step

- **To see how it works,** open the [public test report](https://jayami123.github.io/playwright-e2e-ci-framework/) or read the [bug write-ups](docs/observations/) with the evidence behind each number.
- **To talk about a role,** I'm open to remote QA roles.
- **To get your product tested,** I take contract work for startups before a launch or a major release.

**[LinkedIn](https://www.linkedin.com/in/jayamihettigoda/)** · **[Email](mailto:jayami2114@gmail.com)** · [GitHub](https://github.com/Jayami123)

<sub>Built with Playwright, TypeScript, Docker and GitHub Actions.</sub>
