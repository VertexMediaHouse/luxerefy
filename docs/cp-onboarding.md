# The Universe — Channel Partner kit

Each channel partner (CP) gets two things: a tagged landing-page link and their own
copy of the lead sheet. Leads land in the CP's sheet and, through the existing
Apps Script webhook, in the Luxerefy CRM as referral leads credited to that CP.

## 1. Landing page link

The public project page is already live in the CRM:

    https://<crm-host>/p/the-universe

Add a `?cp=` tag per partner, URL-encoded:

    https://<crm-host>/p/the-universe?cp=Shree%20Realty

The tag does two things: the page shows "Presented by Shree Realty", and every
enquiry submitted from that link is captured as a `referral` lead with
`referral_detail = Shree Realty`. Filter leads by that value to see one CP's
pipeline. Without the tag the page behaves exactly as before.

## 2. CP lead sheet

Give each CP their own copy of the sheet, so ownership can be transferred:

1. Open the master sheet and use **File > Make a copy**, named for the CP.
2. Keep row 1 as the header row. The webhook matches these columns loosely
   (header text is normalised, so spacing and case do not matter):

   | Sheet column | CRM field |
   |---|---|
   | `Name` | contact name |
   | `Phone` | contact phone (required; dedupes against open leads) |
   | `Email` | contact email |
   | `Residence` / `Configuration` / `Project` | `property_interest` |
   | `Interest` | `lead_type` (investor / end-user) |
   | `City` / `Location` | `city` |
   | `CTA / Source section` | appended to the lead's message |
   | `Source` | `source`; see below |
   | `Remarks` / `Message` / `Notes` | message |
   | `Row ID` | `external_ref` |

   `Source` must be one of the CRM's own values (`99acres`, `social_media`,
   `website`, `property_page`, `print_ad`, `jbn`, `referral`, `walk_in`,
   `sales_form`, `other`). Any other text is taken as a channel partner name:
   the lead is captured as `referral` with that name in `referral_detail`. No
   `Source` column at all means `website`, which is right for a landing page.
   Every column, mapped or not, is also stored whole in `leads.raw_payload`.
3. In the copy: **Extensions > Apps Script**, paste `public/api/webhooks/sheets.gs`.
4. **Project Settings > Script properties**: set `CRM_URL` to
   `https://<crm-host>/api/webhooks/sheets.php` and `CRM_SECRET` to the same
   value as `WEBHOOK_SHEETS_SECRET` in `public/api/webhooks/config.php`.
5. **Triggers > Add trigger**: function `pushLead`, source *From spreadsheet*,
   event *On form submit* (or *On change* if no Google Form is attached).
6. Put the CP's name in the `Source` column default, so CRM credit matches the
   `?cp=` tag on their link.
7. Transfer ownership to the CP, then have them set sharing to **Restricted**
   and remove every other account under **Share**.

A failed push shows up in **Apps Script > Executions**; the sheet row is kept
either way, and `backfill()` re-pushes rows that already exist.

## What is deliberately not built

- No per-CP login or CP portal: the `?cp=` tag plus their own sheet covers the
  attribution and the data hand-off the launch needs.
- No automated sheet copying / ownership transfer: Google requires a Workspace
  admin or manual transfer, and this runs a handful of times per launch.
