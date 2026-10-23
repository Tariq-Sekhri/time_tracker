/*
 * Real-looking export samples from other time trackers and from our own exporter.
 * Header names follow each tool's detailed report CSV export.
 */

/** Clockify → Reports → Detailed → Export CSV. US dates, 12h times, Duration (h) + Duration (decimal). */
export const CLOCKIFY_DETAILED = [
    `"Project","Client","Description","Task","User","Group","Email","Tags","Billable","Start Date","Start Time","End Date","End Time","Duration (h)","Duration (decimal)","Billable Rate (USD)","Billable Amount (USD)"`,
    `"Website Redesign","Acme Corp","Homepage wireframes","Design","Jane Doe","","jane@example.com","","Yes","03/04/2026","09:00:00 AM","03/04/2026","10:30:00 AM","01:30:00","1.50","50.00","75.00"`,
    `"Website Redesign","Acme Corp","Client call, follow-up","Meetings","Jane Doe","","jane@example.com","","Yes","03/04/2026","01:15:00 PM","03/04/2026","02:00:00 PM","00:45:00","0.75","50.00","37.50"`,
    `"Internal","","Late deploy","","Jane Doe","","jane@example.com","ops","No","03/13/2026","11:30:00 PM","03/14/2026","12:45:00 AM","01:15:00","1.25","0.00","0.00"`,
    ``,
].join("\r\n");

/** Clockify import template (what our Clockify layout writes): "Tag" singular, Start date + Start time + Duration. */
export const CLOCKIFY_TEMPLATE = [
    `Project,Client,Description,Task,Email,Tag,Billable,Start date,Start time,Duration`,
    `Planning,Work,Sprint planning,,jane@example.com,,No,03/04/2026,02:05 PM,01:00:00`,
].join("\n");

/** Toggl Track → Reports → Detailed → Export CSV. ISO dates, 24h times, HH:MM:SS duration. */
export const TOGGL_DETAILED = [
    `User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount (USD)`,
    `Jane Doe,jane@example.com,Acme Corp,Website Redesign,Design,Homepage wireframes,Yes,2026-03-04,09:00:00,2026-03-04,10:30:00,01:30:00,design,75.00`,
    `Jane Doe,jane@example.com,,Admin,,"Invoices, ""Q1"" batch",No,2026-03-04,22:15:00,2026-03-05,00:05:00,01:50:00,,0.00`,
    `Jane Doe,jane@example.com,,,,Reading,No,2026-03-05,07:00:00,2026-03-05,07:20:00,00:20:00,,0.00`,
].join("\n");

/** Harvest → Reports → Detailed time → Export CSV. Date + decimal Hours only, Notes is the description. */
export const HARVEST_DETAILED = [
    `Date,Client,Project,Project Code,Task,Notes,Hours,Hours Rounded,Billable?,Invoiced?,Approved?,First Name,Last Name,Roles,Employee?,Billable Rate,Billable Amount,Cost Rate,Cost Amount,Currency,External Reference URL`,
    `2026-03-04,Acme Corp,Website Redesign,ACME-01,Design,Homepage wireframes,1.5,1.5,Yes,No,No,Jane,Doe,Designer,Yes,100.0,150.0,50.0,75.0,United States Dollar - USD,`,
    `2026-03-04,Acme Corp,Website Redesign,ACME-01,Project Management,"Status call`,
    `with client",0.25,0.25,Yes,No,No,Jane,Doe,Designer,Yes,100.0,25.0,50.0,12.5,United States Dollar - USD,`,
    `2026-03-05,Internal,Admin,,Admin,Expenses,2.0,2.0,No,No,No,Jane,Doe,Designer,Yes,0.0,0.0,50.0,100.0,United States Dollar - USD,`,
].join("\n");

/** Our own CSV (manual entries), EU dates, semicolon delimiter, UTF-8 BOM, formula guard, quoted newline. */
export const NATIVE_EU_SEMICOLON = "﻿" + [
    `Date;Start;End;Duration;Title;Category;Parent category;Category path;Notes`,
    `13/03/2026;09:00:00;10:30:00;1:30:00;'=Budget review;Planning;Work;Work › Planning;"Line 1`,
    `Line 2 with ; semicolon"`,
    `14/03/2026;23:00:00;01:00:00;2:00:00;Night shift;Uncategorized;;Uncategorized;`,
    `;;;;;;;;`,
    `15/03/2026;25:99;10:00:00;1:00:00;Broken;Work;;Work;`,
    ``,
].join("\r\n");

/** Our own CSV with 12h times and ambiguous (US) dates. */
export const NATIVE_US_12H = [
    `Date,Start,End,Duration,Title,Category,Parent category,Category path,Notes`,
    `03/04/2026,2:05:00 PM,3:35:00 PM,1:30:00,Café meeting,Clients,,Clients,`,
    `03/05/2026,11:00:00 PM,1:30:00 AM,2:30:00,Overnight,Clients,,Clients,`,
].join("\n");
