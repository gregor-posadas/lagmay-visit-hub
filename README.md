# Lagmay Visit Hub

One place for the team bringing Dr. Mahar Lagmay (UP Resilience Institute and Project NOAH) to the Bay Area in November 2026: the DevEng 203 lecture and public dialogue at UC Berkeley on November 9, and a visit to Stanford on November 10. It tracks who is doing what, everyone we are talking to and whose move it is, where the money stands against the budget, meetings and their notes, and the shared Drive folder.

Built for Gregor, Noam, Veronica and Rapha. Same design and code base as the [Microbe Busters Hub](https://github.com/gregor-posadas/microbe-busters-hub).

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages. No build step.
- **Data:** the Google Sheet "Lagmay Visit Hub data" in the "Dr. Lagmay Visit (Nov 2026)" Drive folder. Nothing about the team or the people we're talking to is stored in this repository.
- **Backend:** a Google Apps Script web app attached to that Sheet. It reads and writes the Sheet, puts deadlines on Gregor's "Lagmay visit deadlines" calendar, emails Gregor a daily summary, lists files from the Drive folder, and summarizes the notes docs in its Meetings subfolder.
- **Font:** Atkinson Hyperlegible Next, under the SIL Open Font License (`fonts/OFL.txt`).

Until the backend is connected, the site runs on sample data from `data/demo.json`, so you can look around first. The sample uses first names and made-up organizations only.

## What's in the hub

| Page | What it's for |
| --- | --- |
| **Team** | Countdown to Nov 9, the next meeting, how many contacts are waiting on us, three pace meters (planning time gone by, assignments done, budget secured), the milestone line, and a card for each person. |
| **Your page** | Your assignments by due date, the contacts you own that aren't settled, and the funding you're chasing. |
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
   - This creates a calendar called "Lagmay visit deadlines", your daily 8 AM summary email, and two access codes. It doesn't change any data already in the Sheet, and it doesn't email or invite anyone.
   - Open **Execution log** to see the codes. The **team code** is for the four of us. The **project manager code** is for Gregor only.
   - Lost them? They are under **Project Settings > Script properties** (`TEAM_CODE`, `PM_CODE`).
5. Still in **Script properties**, add `APP_URL` with the GitHub Pages address, `https://gregor-posadas.github.io/lagmay-visit-hub/`. Your summary email and the calendar events link back to it.
6. Pick `syncAllCalendarEvents` and **Run**. This puts every open assignment, workstream and funding deadline on the shared "Lagmay visit deadlines" calendar. No one is invited and no emails are sent.
7. Click **Deploy > New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Copy the URL that ends in `/exec`.
8. In this repository, open `assets/config.js` and paste that URL into `apiUrl`. Commit. The site switches from sample data to the Sheet.
9. Send the site link and the team code to Noam, Veronica and Rapha. Rapha's Stanford account works the same as everyone else's: the team code is all anyone needs.

When you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the `/exec` URL stays the same.

### If "Anyone" is not offered

Some university Google accounts only allow web apps for people signed in to that university. The GitHub Pages site can't use such a backend, because browsers don't send your Google sign-in from one site to another, and Rapha is at Stanford anyway. Stop at this step and ask for a change to serve the site from Apps Script, rather than choosing a narrower option.

## Using it

- **Everyone:** open the site, enter the team code once, and tap your name. Mark assignments **In progress** or **Done** as that becomes true.
- **After any email, call or meeting with someone outside the team:** open them on **Contacts**, click **Log what happened**, write one or two sentences, say whose move it is now, and pick a follow-up date (it defaults to a week out). The contact moves to the right group, and it shows up in Gregor's summary when the follow-up date comes.
- **When a funder answers:** open them on **Funding** and change where it stands. Only **Secured** and **Waiting on decision** count in the money gauge. A budget line shows **Covered** only when the funding source linked to it is secured.
- **Meetings:** add a meeting with its call link and doc. Afterwards, put the notes doc in the Meetings folder of the Drive folder. Any Google Doc there shows up under Past meeting notes; a heading called **Key takeaway** (or failing that, the first point under **Decisions**) becomes its summary line. Start the file name with the date, for example `2026-10-08 Team check-in`, so it sorts right.
- **Project manager:** **Project view** for assignments and workstreams, the budget table on **Funding**, and **Email me the summary now**. The first edit asks for the project manager code, which the browser then remembers until you choose **Forget the project manager code on this device**.
- **Sound and theme:** the header has a **Sound** switch for the key clicks (off by default for anyone whose device asks for reduced motion) and a **Light mode / Dark mode** switch. Both are remembered per device.

### Email and calendar

- **The team gets no email from the hub.** Nothing is added to anyone's personal calendar either. Teammates see their work by opening the hub.
- **Gregor gets one summary email** at 8 AM Pacific, only on days with something in it: funding changes, funding deadlines this week, overdue work, follow-ups due by tomorrow, what's due in the next 7 days, and what finished. **Email me the summary now** in Project view sends it on demand.
- **Every open deadline is on the "Lagmay visit deadlines" calendar** in Gregor's Google Calendar: assignments (titled with the person's name, for example "Due (Noam): ..."), workstreams, and funding deadlines. No one is invited. Each event has pop-up reminders a day and an hour before, which only Gregor sees. Turn the calendar's notifications off in Google Calendar if that's too much.
- Anyone can still put a single deadline on their own calendar with **Add to Google Calendar** on its page.
- To turn per-person reminder emails on later, add `TEAM_EMAILS` = `on` in **Script properties**. Each person's `emailPref` in the Members tab (`daily`, `weekly` or `off`) then decides how often they get one.

### Editing the Sheet directly

You can also edit the Sheet by hand. The columns are named in the first row of each tab.

- **Dates with times** look like `2026-10-06T17:00:00-07:00` (use `-08:00` after daylight saving time ends on Nov 1). **Contacts** use plain dates for `followUp` and `lastContact`, like `2026-10-06`.
- **Statuses:** assignments `todo`, `doing` or `done`. Workstreams empty or `done`. Contacts `ours`, `theirs`, `new` or `settled`. Funding `secured`, `pending` (waiting on a decision), `working`, `lead` (not started) or `declined`. Budget `status` is empty or `notneeded`, and `basis` is `estimate` or `quote`.
- **Campus** is `berkeley`, `stanford` or `both`.
- **Links between tabs** use ids: an assignment's `projectId` and `memberId`, a contact's `projectId` and `ownerId`, a funding source's `ownerId` and `contactId`, a budget line's `fundingId`, a milestone's `projectId`.
- **Text** uses one line per step, starting with `- `. For a link, paste the address or write `[link text](https://...)`. A line starting with `### ` becomes a small heading.
- **Rules** holds the ground rules shown at the bottom of the Funding page, one per row.
- After editing dates by hand, run `syncAllCalendarEvents` again to update the calendar.

## The event page and the RSVP map

`event/` is the public page for the Nov 9 dialogue: gregor-posadas.github.io/lagmay-visit-hub/event/. It has the event details, an **RSVP** button that opens a Google Form, and a live map of who is coming. The map shows the Bay Area and the Philippines with a person figure for each RSVP, placed in their Bay Area county and, if they chose one, the Philippine province they have ties to. One line per province crosses the Pacific from the Golden Gate, thicker when more people are tied to it.

- **Inclusive by design.** Everyone appears on the Bay Area side, including people born here and people with no ties to the Philippines. Places come from dropdowns (nine Bay Area counties; 82 provinces plus Metro Manila), so every answer matches a shape on the map.
- **Private by design.** The public page gets only counts (`action=map`). Names, emails, access needs and questions stay in the Sheet and the hub. A story appears only if the person said yes to sharing it without their name **and** a teammate ticked it on the hub's **RSVPs** page.
- **The opening on Nov 9:** open `event/?present` on the projector and press the right arrow (or Next). Steps: the room on the map, the lines home, the floods (provinces named in BahaWatch's flood history are shaded), up to four "if your family is from…" moments, a hands-up moment, the ticked stories, and a closing line. Press R to refresh the counts, Esc to leave.
- **Rehearse any time** with made-up people: `event/?sample&present`. Every view says "Sample data".
- **Flood data:** provinces come from `event/data/storms.json` (the floods on BahaWatch's Flood history tab). When UPRI shares province-level NOAH exposure figures, they can replace or join this layer.
- **Map files:** `event/data/ph-provinces.json` (PSA PSGC 2023 boundaries via faeldon/philippines-json-maps, MIT) and `event/data/bay-counties.json` (click_that_hood), built by `tools/build_map_data.py`.

### Making the RSVP form (once)

1. In Apps Script, replace `Code.gs` and `appsscript.json` with the versions in this repo and save. The new manifest adds permission to make Google Forms.
2. **Deploy > Manage deployments >** pencil icon **> Version: New version > Deploy.** The `/exec` link stays the same.
3. Pick `createRsvpForm` and click **Run**. Approve the Forms permission. The log shows the form's share link. Its answers go to a new **RSVP responses** tab in the Sheet.
4. Put the share link in `event/config.js` as `rsvpUrl`, then commit.
5. RSVP once yourself, then check the hub's **RSVPs** page and the event map. Delete the test row from the RSVP responses tab afterwards.

The form never emails anyone. Tests for the backend's RSVP code: `node tests/rsvp_backend.test.js`.

## Files in this repository

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `assets/app.js` | All site behavior (views, routing, calls to the backend, click sounds) |
| `assets/styles.css` | Styles, including the dark theme |
| `assets/config.js` | The backend URL, Drive folder links, time zone and event dates |
| `apps-script/` | Backend code to paste into Apps Script |
| `data/demo.json` | Sample data used when no backend is connected |
| `event/` | The public event page, RSVP map and the Nov 9 opening (`?present`) |
| `tools/build_map_data.py` | Builds the event map's boundary files |
| `tests/` | Backend tests (run with Node) |
| `fonts/` | Atkinson Hyperlegible Next and its license |

## Publishing changes

Before each commit, run `sh scripts/stamp-version.sh` from the repo root. It writes a new version number into `version.json`, `index.html` and `assets/app.js`. Browsers then fetch the new files instead of cached ones, and anyone with the hub already open gets a **Reload to get the new version** bar when they come back to the tab. If you edit a file directly on GitHub instead, also bump the number in `version.json` by hand so open copies notice the change.
