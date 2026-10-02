# Lagmay Visit Hub

One place for the team bringing Dr. Mahar Lagmay (UP Resilience Institute and Project NOAH) to the Bay Area in November 2026: the DevEng 203 lecture and public dialogue at UC Berkeley on November 9, and a visit to Stanford on November 10. It tracks who is doing what, everyone we are talking to and whose move it is, where the money stands against the budget, meetings and their notes, and the shared Drive folder.

Built for Gregor, Noam, Veronica and Rapha. Same design and code base as the [Microbe Busters Hub](https://github.com/gregor-posadas/microbe-busters-hub).

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages. No build step.
- **Data:** the Google Sheet "Lagmay Visit Hub data" in the "Dr. Lagmay Visit (Nov 2026)" Drive folder. Nothing about the team or the people we're talking to is stored in this repository.
- **Backend:** a Google Apps Script web app attached to that Sheet. It reads and writes the Sheet, puts deadlines on a shared Google Calendar, emails reminders, lists files from the Drive folder, and summarizes the notes docs in its Meetings subfolder.
- **Font:** Atkinson Hyperlegible Next, under the SIL Open Font License (`fonts/OFL.txt`).

Until the backend is connected, the site runs on sample data from `data/demo.json`, so you can look around first. The sample uses first names and made-up organizations only.

## What's in the hub

| Page | What it's for |
| --- | --- |
| **Team** | Countdown to Nov 9, the next meeting, how many contacts are waiting on us, three pace meters (planning time gone by, assignments done, budget secured), the milestone line, and a card for each person. |
| **Your page** | Your assignments by due date, the contacts you own that aren't settled, the funding you're chasing, and your reminder email setting. |
| **Funding** | The money gauge (secured, waiting on a decision, gap), what still needs a funder, every funding source grouped by where it stands, the budget table, and our ground rules. |
| **Contacts** | Everyone outside the team, grouped by whose move it is: follow-up overdue, our move, waiting on them, not contacted yet, settled. Filter by workstream, owner or campus. Each contact has a **Log what happened** button that adds a dated line to their history and sets the next follow-up. |
| **Meetings** | The next meeting, what's coming up, and past meeting notes from the Meetings folder with a search box. |
| **Project view** | Every assignment by workstream with filters, and the list of workstreams. |
| **Files** | Everything in the Drive folder, grouped by subfolder, with search. |
| **About** | How to use it, what the symbols mean, and common questions. |

**Who can change what.** The team code lets anyone update their own assignment status, mark a workstream done, add and edit contacts, funding sources and meetings, and set their email preference. The project manager code is needed for assignments, workstreams, the budget, and deleting anything.

**Campus tags.** Berkeley items carry a filled **Berkeley** tag, Stanford items an outlined **Stanford** tag, and shared ones a grey **Both campuses** tag.

## Set up the backend (about 10 minutes, once)

1. Open the Sheet **Lagmay Visit Hub data** in the "Dr. Lagmay Visit (Nov 2026)" Drive folder. Its tabs are already filled in.
2. Go to **Extensions > Apps Script**. Delete whatever is in `Code.gs` and paste in the contents of `apps-script/Code.gs` from this repository.
3. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**. Back in the editor, open `appsscript.json` and replace it with `apps-script/appsscript.json`. Save.
4. In the function menu at the top, pick `setup` and click **Run**. Approve the permissions when Google asks (Sheets, Calendar, Drive, Docs, send email).
   - This creates a calendar called "Lagmay visit deadlines", a daily 8 AM reminder, and two access codes. It doesn't change any data already in the Sheet.
   - Open **Execution log** to see the codes. The **team code** is for the four of us. The **project manager code** is for Gregor only.
   - Lost them? They are under **Project Settings > Script properties** (`TEAM_CODE`, `PM_CODE`).
5. Still in **Script properties**, add `APP_URL` with the GitHub Pages address, `https://gregor-posadas.github.io/lagmay-visit-hub/`. Reminder emails and calendar events link back to it.
6. Pick `syncAllCalendarEvents` and **Run**. This puts every open assignment, workstream and funding deadline on the shared "Lagmay visit deadlines" calendar. No one is invited and no emails are sent.
7. Click **Deploy > New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Copy the URL that ends in `/exec`.
8. In this repository, open `assets/config.js` and paste that URL into `apiUrl`. Commit. The site switches from sample data to the Sheet.
9. Send the site link and the team code to Noam, Veronica and Rapha. Rapha's Stanford account works the same as everyone else's: the team code is all anyone needs.

When you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the `/exec` URL stays the same.

### If "Anyone" is not offered

Some university Google accounts only allow web apps for people signed in to that university. The GitHub Pages site can't use such a backend, because browsers don't send your Google sign-in from one site to another, and Rapha is at Stanford anyway. Stop at this step and ask for a change to serve the site from Apps Script, rather than choosing a narrower option.

## Using it

- **Everyone:** open the site, enter the team code once, and tap your name. Mark assignments **In progress** or **Done** as that becomes true.
- **After any email, call or meeting with someone outside the team:** open them on **Contacts**, click **Log what happened**, write one or two sentences, say whose move it is now, and pick a follow-up date (it defaults to a week out). The contact moves to the right group, and its owner gets a reminder on the follow-up date.
- **When a funder answers:** open them on **Funding** and change where it stands. Only **Secured** and **Waiting on decision** count in the money gauge. A budget line shows **Covered** only when the funding source linked to it is secured.
- **Meetings:** add a meeting with its call link and doc. Afterwards, put the notes doc in the Meetings folder of the Drive folder. Any Google Doc there shows up under Past meeting notes; a heading called **Key takeaway** (or failing that, the first point under **Decisions**) becomes its summary line. Start the file name with the date, for example `2026-10-08 Team check-in`, so it sorts right.
- **Project manager:** **Project view** for assignments and workstreams, the budget table on **Funding**, and **Send reminders now**. The first edit asks for the project manager code, which the browser then remembers until you choose **Forget the project manager code on this device**.
- **Sound and theme:** the header has a **Sound** switch for the key clicks (off by default for anyone whose device asks for reduced motion) and a **Light mode / Dark mode** switch. Both are remembered per device.

### Reminders

- Emails come from the hub at 8 AM Pacific, at most once a day per person, and only on days with something to say.
- Each email lists what's **overdue**, what's **due soon** (next 2 days), what's **new for you**, **people to follow up with** (contacts you own whose follow-up date is today, soon, or past), and **funding deadlines** you own in the next week. Every item links straight to its page.
- Overdue items and missed follow-ups come up the day after, then every third day, so nobody gets nagged daily.
- Each person chooses **Daily**, **Mondays only** or **Off** at the bottom of their own page.
- The project manager also gets a team summary: funding changes, funding deadlines this week, overdue work, follow-ups past their date, and what finished.

### Editing the Sheet directly

You can also edit the Sheet by hand. The columns are named in the first row of each tab.

- **Dates with times** look like `2026-10-06T17:00:00-07:00` (use `-08:00` after daylight saving time ends on Nov 1). **Contacts** use plain dates for `followUp` and `lastContact`, like `2026-10-06`.
- **Statuses:** assignments `todo`, `doing` or `done`. Workstreams empty or `done`. Contacts `ours`, `theirs`, `new` or `settled`. Funding `secured`, `pending` (waiting on a decision), `working`, `lead` (not started) or `declined`. Budget `status` is empty or `notneeded`, and `basis` is `estimate` or `quote`.
- **Campus** is `berkeley`, `stanford` or `both`.
- **Links between tabs** use ids: an assignment's `projectId` and `memberId`, a contact's `projectId` and `ownerId`, a funding source's `ownerId` and `contactId`, a budget line's `fundingId`, a milestone's `projectId`.
- **Text** uses one line per step, starting with `- `. For a link, paste the address or write `[link text](https://...)`. A line starting with `### ` becomes a small heading.
- **Rules** holds the ground rules shown at the bottom of the Funding page, one per row.
- After editing dates by hand, run `syncAllCalendarEvents` again to update the calendar.

## Files in this repository

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `assets/app.js` | All site behavior (views, routing, calls to the backend, click sounds) |
| `assets/styles.css` | Styles, including the dark theme |
| `assets/config.js` | The backend URL, Drive folder links, time zone and event dates |
| `apps-script/` | Backend code to paste into Apps Script |
| `data/demo.json` | Sample data used when no backend is connected |
| `fonts/` | Atkinson Hyperlegible Next and its license |

## Publishing changes

Before each commit, run `sh scripts/stamp-version.sh` from the repo root. It writes a new version number into `version.json`, `index.html` and `assets/app.js`. Browsers then fetch the new files instead of cached ones, and anyone with the hub already open gets a **Reload to get the new version** bar when they come back to the tab. If you edit a file directly on GitHub instead, also bump the number in `version.json` by hand so open copies notice the change.
