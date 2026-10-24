# Sources for the #342 records

Checked 2026-10-24; port and health sources re-read 2026-10-23 Vancouver (see `evidence-r2/source-excerpts-2026-10-23.txt`). Page text was read, not only the status code. "Supports" lists the page text behind each claim.

## Port of entry (patch of 8a1d0045-58ac-4928-90be-5267edf196e1)

- IRCC, Confirmation of Permanent Residence document: https://www.canada.ca/en/immigration-refugees-citizenship/services/permanent-residents/status/copr.html
  - "You must travel to Canada and present your COPR at a Canadian port of entry before the validity date indicated on the COPR."
  - "you must show your COPR to the Canada Border Services Agency officer at the port of entry. The officer will examine the accuracy of the information on your COPR and documents ... signing and dating it."
  - "Check ... your information is correct and matches the information on your passport."
- IRCC, If your Express Entry application is approved: https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/application-approved.html
  - "we'll mail you a Confirmation of Permanent Residence (COPR); permanent resident visa (if you're from a country that needs a visa)".
- IRCC Help Centre: https://ircc.canada.ca/english/helpcentre/questions-answers-by-topic.asp?top=10
  - "An immigration officer at the port of entry or an IRCC office signs and dates this document when permanent residence is finally granted."
- CBSA, Moving or returning to Canada: https://cbsa-asfc.gc.ca/travel-voyage/mrc-drc-eng.html
  - "prepare two copies of a list of all the goods you intend to bring ... In the first section, list the goods you are bringing with you; in the second, list the goods to follow."
  - "Even if you have no goods with you on arrival, you must give your list of goods to the border services officer at your first point of entry."
- IRCC, Express Entry, arrival from outside Canada (read 2026-10-23, review fix F3): https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/application-approved/outside-canada.html
  - "Documents you'll need ... You must have: your valid passport or travel documents; your confirmation of permanent residence (COPR) and your permanent resident visa (if we gave you one); proof you have the funds to support yourself and your family after you arrive in Canada (unless you're exempt)".
  - Supports the document list in the port record, including proof of settlement funds with the exemption. The record keeps the exemption wording and names no program.
- IRCC, Express Entry, proof of funds: https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/proof-funds.html
  - Needed for the Federal Skilled Worker and Federal Skilled Trades programs. Not needed under the Canadian Experience Class, or with a valid job offer and work authorization. This is why the record says "unless you are exempt".
- Finding about the old copy: no IRCC or CBSA page read says a new PR holder must land at one specific port. Third-party pages say the port is not restricted, but they are not primary sources, so the new copy makes no port claim.

## Pet (new record 3b85715f-8c76-4086-ad66-92217b61a06d)

- CFIA, Bringing animals to Canada: Importing and travelling with pets (the link in the record): https://inspection.canada.ca/en/importing-food-plants-animals/pets
  - "you will need the right paperwork at the border ... If you don't, you risk experiencing delays at the border and your animal may not be allowed into Canada."
  - The page is a selector by animal, age, and country of origin. This supports "Rules depend on age and the country you travel from."
- CFIA, Import Reference Document: https://inspection.canada.ca/en/animal-health/terrestrial-animals/imports/import-policies/general/reference-document
  - Cats: "Domestic cats three (3) months of age or over may be imported if ... accompanied ... by a veterinarian's certificate, in English or French ... currently vaccinated against rabies" (or other listed options such as a rabies-free origin).
  - Dogs: "A dog that is less than three months of age ... does not require rabies vaccination"; older dogs need a valid rabies vaccination certificate in English or French or another listed option.
  - The record says "usually" because the other options exist.

## Refugee records

- IRCC, Find help to adjust as a refugee in Canada: https://www.canada.ca/en/immigration-refugees-citizenship/services/refugees/help-within-canada/government-assisted-refugee-program/providers.html
  - Resettlement Assistance Program (RAP): "greeting you at the airport; providing temporary housing; help with ... finding permanent housing; ... registering for essential federal and provincial programs".
  - "If you're being sponsored to come to Canada, your sponsoring group will provide you with these services."
  - "All refugees who are resettled to Canada can also access settlement program services. These include information and orientation; referral to community resources; translation and interpretation; language training; job-related services."
  - Supports the housing record (b35d1e3d) and the settlement record (36c70b31).
- IRCC, Confirmation of Permanent Residence document (same URL as above). Supports the documents record (67c02a10): COPR shown to the CBSA officer, information must match the passport, travel before the Valid to date.
- IRCC, Interim Federal Health Program policy: http://cic.gc.ca/english/department/laws-policy/ifhp.asp
  - The IFHP gives "limited and temporary coverage" to "resettled refugees" and covers some pre-departure medical services for refugees selected for resettlement.
- IRCC, IFHP eligibility and duration (read 2026-10-23, review fix F4): https://www.canada.ca/en/immigration-refugees-citizenship/services/refugees/help-within-canada/health-care/interim-federal-health-program/eligibility.html
  - Resettled refugees: "Basic coverage will last until you qualify for health insurance from your province or territory. Supplemental benefits and prescription medications are covered until you are no longer receiving income support from the Resettlement Assistance Program (or its equivalent in Quebec), and/or financial assistance through private sponsorship."
  - This is the controlling source for the health record. The record separates basic coverage from supplemental and prescription benefits. It does not use the Medavie "typically 3 months" or "12 months" figures as end dates.
- IRCC, Temporary health care coverage: what is covered: https://canada.ca/en/immigration-refugees-citizenship/services/refugees/help-within-canada/health-care/interim-federal-health-program/coverage-summary.html
  - "provides limited and temporary health care coverage until you're eligible for provincial or territorial insurance."
- IFHP administrator help centre (Medavie Blue Cross, run for IRCC): https://ifhp.medaviebc.ca/en/help-centre
  - "Interim Federal Health Certificate of Eligibility ... you get this certificate if you're a resettled refugee going to live in Canada."
  - "An officer from IRCC or the Canada Border Services Agency (CBSA) will give you your IFHP eligibility document."
  - Resettled refugees: coverage until provincial or territorial coverage, "typically ... within 3 months. During this time, you must apply for health insurance from the province or territory where you live." Show the eligibility document to the provider.
  - "Find a health care provider who is registered with Medavie Blue Cross." "Show your IFHP eligibility document to your health care provider before you receive treatment." This supports the "provider registered with the IFHP" wording.
  - Supports the health record (c74753ba). The "officer gives the certificate" claim rests on the Medavie page. The canada.ca eligibility page did not return that text to the fetch tool.

## Checks against the record text

- No record names a province, a territory, or a provincial plan. `validatePayload` checks this with a name list.
- No record has an em dash. `validatePayload` checks this.
- All records: `language` is `en`, `stage` is `not_arrived`, one `link_tab`, `Why:` description under 450 characters.
