# Reference Analysis — Source Material for the Initial Configurations

This document records what was extracted from the two reference sources, how it was mapped into the
seeded configurations, and everything that could **not** be established and therefore needs
business confirmation. Nothing below is bank policy invented by the portal; where the source is silent
the portal makes the item configurable and flags it **"requires confirmation"** (amber dot in the
Stage Builder, `needsConfirmation = true` in the database).

| Source | Content | How it was read |
|---|---|---|
| `optimscreen.zip` | 287 PNG screenshots, file names `Screenshot 2026-08-06 HHMMSS.png` (one test case, 11:29–15:39 on 06-Aug-2026). 124 mobile-app captures (≈490×790) and 163 web-portal captures (≈1900 px wide). | Every image was extracted and reviewed in time order (the file-name timestamp gives the sequence). Mobile captures were reviewed six per sheet at native size; web captures two per sheet at 1560 px width. References below use `OPTIM #n` = position in the time-ordered list. |
| `ProHorizon_Tractor_Loan_End_to_End_User_Manual_v1.0.docx` | 43 sections, 163 embedded screenshots, ~150 screen-description tables (Platform / Role / Purpose / Fields / Actions / Validation / Status / Next step / Exception). | Full text and every table were extracted programmatically (python-docx) and read end to end. References use `Manual §n` / `Manual Fig n`. |

The two sources are **not** the same product: the screenshots are a **New Two Wheeler** case
(`LEAD0608008833`, scheme `TW-NIP`, dealer *SHRI SHAM AUTO MOTORS*, BAJAJ Freedom 125); the manual is a
**Tractor** case (`LEAD2108009401`, scheme *Kisan Vahan New Tractor (Lite)*). They share the OPTIM
platform (same mobile app, same web back office) but differ in the customer-facing journey — see §4.

> Confidentiality: the reference files contain KYC images (Aadhaar, PAN, live photo). They are kept
> in `reference/`, which is excluded from Git by `.gitignore`. No customer data is stored in the portal.

---

## 1. Platform, login and dashboard (common to both sources)

| Screen | Fields / controls | Validations observed | Source |
|---|---|---|---|
| Mobile login | Username, Password, Captcha (arithmetic, e.g. `4 + 0 =`), Enter captcha; Log In; Forgot password? | Captcha must match | OPTIM #1, Manual Fig 1 |
| Mobile 2FA | Enter 6 digit OTP; Resend OTP after countdown (≈58 s); OTP sent to masked number | OTP must match | OPTIM #2, Manual Fig 2 |
| Mobile dashboard | *Apply Loan* tiles: New Two Wheeler, New Car Loans, Used Car Loans, New Tractor Loans, Used Tractor Loans · *Shortcut*: My Task, Query, Recent Activity, System Tools · *FI / Valuation*: FI, Valuation (badges) | Tiles shown per products mapped to the SO | OPTIM #3–4, Manual Fig 3 |
| Web login / OTP | Login ID, Password, Captcha; Sign in; Verify Login OTP | Captcha, OTP | OPTIM #24, #68–69, #157–158; Manual Fig 12–13 |
| Web home | Tabs: All Leads, Queue, Credit Queue (All / CAM Preparation / Deviation Approvals / Credit Approvals), External Credit Evaluation, My Task, Duplicate Leads, Relook; Business Queue (All / Asm Recommendations / Business Approval); Rcu Queue; Self Assign; Re-Assign | — | OPTIM #26, #150, #159, #165, #214; Manual Fig 14, 80–81 |

Login and the dashboard are platform screens, not product configuration, so they are **not** modelled
as configurable stages. The product tiles on the dashboard correspond to the Product Catalogue.

The dashboard therefore confirms five product tiles; **New / Used Commercial Vehicle are not present in
any source** and are seeded as starter templates only.

## 2. Roles

From Manual §2 (the authoritative role table) plus the user names seen on screen:

| Role (portal code) | Platform | Responsibility (Manual §2 / §39) | Logins observed |
|---|---|---|---|
| Sales Officer (`SALES_OFFICER`) | Mobile | Lead → Pre-disbursement documents, My Task / Query responses | TESTSO, LOKESH |
| Duplicate Check Reviewer (`DUPLICATE_REVIEWER`) | Web | Accept / reject flagged duplicates | CREDITL0 |
| Due Diligence User (`DUE_DILIGENCE`) | Web | KYC document validation | DueDeligence |
| CAM Preparation User (`CAM_USER`) | Web | CAM, income validation, FI/TVR initiation | CREDITL0 |
| RCU User (`RCU_USER`) | Web | Scheme-document validation, self or agency | RcuL0 |
| FI User / Agency (`FI_USER`), TVR User / Agency (`TVR_USER`) | Web / external | Questionnaires | CREDITL0 (self) |
| Credit Approval User (`CREDIT_APPROVER`) | Web | In-principle approval, credit decisioning | CreditL0, CreditL5 |
| Deviation User — Credit-L1 (`DEVIATION_APPROVER`) | Web | Approve / reject credit deviations | CREDIT L5 (queue Auth "CR L1 to L1") |
| Relook User (`RELOOK_USER`) | Web | Relook queue | — (screen not captured) |
| ASM (`ASM`) | Web | Recommends on deal-structure deviations (no final authority) | ASM (MAYANK SRIVASTAVA) |
| Business User (`BUSINESS_USER`) | Web | Final business-deviation decision | BusinessL5 (Auth "BS L0 to L6") |
| QC Maker (`QC_MAKER`), QC Checker (`QC_CHECKER`) | Web | Pre-disbursement document QC | MAKER L1, QCCHECKER |
| Disbursement User (`DISBURSEMENT_USER`) | Web | Disbursement amount update | DisbursementM01 |
| Auth User (`AUTH_USER`) | Web | Auth Done, Final Disbursement | MANAGERL2 |

Portal-only roles required by the brief: System Administrator, Configuration Administrator,
Configuration Approver, Read-only Auditor. A `SYSTEM_ENGINE` role represents automatic steps
(Duplicate engine, Bureau engine, auto-deviation).

**Not established:** the authority matrix behind the numeric levels ("CR L0 to L0", "CR L1 to L1",
"BS L0 to L6", Credit L0–L5). The portal keeps permissions and workflow roles fully configurable.

---

## 3. New Two Wheeler — journey from the OPTIM screenshots

The mobile **Lead Journey** stepper (OPTIM #32, #45, #50, #55, #66, #180, #184, #224, #233, #236) is the
authoritative order for Two Wheeler:

`Mobile Verification → Bureau → Loan Details → Score Card → Document Upload → Application Form`
then, after credit sanction,
`Repayment → Deal Structure → Sanction Letter → Enach → Disbursement Details → Nominee Details → Pre Disbursement Document`.

**There is no FVR and no Personal Discussion in the Two Wheeler journey**; instead there is a
**Score Card** step whose Profile tab holds the customer-profile questions.

### 3.1 Customer-facing (mobile) screens

| Sub-stage | Sections / fields (labels as on screen) | Dropdown values seen | Validations / behaviour | Source |
|---|---|---|---|---|
| Create Lead | Channel Partner, Application Type; Submit | Channel: DIRECT, DSA, DDSA, CORPORATE DSA, BC WITH FLDG, BC WITHOUT FLDG, BRANCH · Application Type: Individual | — | #5–7 |
| Mobile Verification | Mobile Number (+91, "Linked with the customer's PAN or Aadhaar"), consent checkbox, Get OTP, Enter OTP, Wrong Number?, Resend OTP | — | Get OTP enabled only after consent | #8–10 |
| KYC method | Aadhaar E-Kyc / Other Document | — | — | #11 |
| Applicant (KYC) | Personal: Mobile Number (RO), POI Type, POI Number (masked), First/Middle/Last Name, DOB (DD-MM-YYYY), Gender, Father Name · Address: POA Type, POA Number (masked), Address Line 1–3, Pincode, District (RO), State (RO) · Capture Live Photo, Capture Pancard, Pan Number, Loan Amount; Continue | POI/POA: AADHAAR CARD (web) | Document View confirmations: "I confirm the image is clear and visible", "I agree and confirm that the document is masked"; District/State auto from pincode | #12–17 |
| Lead List card | Product, Reference No, Customer, Mobile, Case Type, Application Type, FI Status, RCU Status, Scheme, Applied Loan Amount, Channel Type, Created Date, Case Status, Score, Remarks; Member / Document / E-Kyc / Notepad / Journey / View | Case types: Applicant, Co-Applicant, Co-Applicant with Guarantor; Add Member: Co-Applicant, Gaurantor | — | #18–19, #27 |
| Loan Details — Sourcing | Lead Reference No, Product, Channel (RO); Scheme (info icon), Dealer, Dealer Outlet, Disbursement Branch | Scheme TW-NIP | — | #33–34 |
| Loan Details — Asset | Make And Model: Manufacturer, Model, Variant (derived), Fuel Type | BAJAJ, Freedom 125 Drum NG04, Plus, Petrol | — | #35 |
| Loan Details — Loan | Scheme (RO), Asset Cost, Discount, Ex Show Room Price, Road Tax, Insurance Amount, Registration Charges, Other Charges, On Road Price, Accessories Cost, Extended Warranty Charges, Total Asset Cost, Applied Loan Amount, Margin Money, Tenure, Offered ROI | Tenure 36 | ROI shows *ACTUAL BANK POLICY MLR 16.00 %*, *MIN 12.25 %*, *MAX 25.00 %*. Calculations proven by screen values: Ex Show Room = Asset Cost − Discount (1,50,000 − 1,000 = 1,49,000); On Road = Ex Show Room + Road Tax + Insurance + Registration + Other (1,54,700); Total Asset Cost = On Road + Accessories + Ext. Warranty (1,57,700); Margin = Total Asset Cost − Applied Loan (57,700) | #36–38 |
| Loan Details — Charges | Applied Loan Amount, Tenure, Document Charges, Scheme (header); PF % As Per Policy, PF Amount; Funded/Non Funded, Offered Processing Fee (calculator), Total Processing Fee (Included GST); CLI, CLI Coverage Amount (Max), Tenure, Funded/Non Funded, Actual Premium, CLI Premium; Hospi Taken, Funded/Non Funded, Tenure, Hospi Premium | Funded, Non Funded · CLI: Taken · Hospi: Taken | PF incl. GST = PF × 1.18 (2,000→2,360; 1,000→1,180; 1,800→2,124) | #39–42, #187, #208 |
| Loan Details — Deal Summary | Tenure, LTV% Total Cost, LTV% On Road Price, Actual Bank Policy MLR, Offered ROI, charges list, Total Funded / Non Funded / Total Charges, Emi Amount (calculator) | — | EMI computed on demand | #43–44 |
| Score Card | Tabs Score Card / Profile; SCORE TYPE; Continue · Profile: Marital Status, Education, Accomadation, Residence, Standard Of Living, Occupation, Sector, Profession, Year And Month Current office, Year And Month Experience, Year In Current Profession, Alternative Business, Alternative Source Income, Applicant Asset Value, Applicant Income | not visible | — | #46–49 |
| Upload Document | BANK STATEMENT, INSURANCE POLICY, REGISTRATION CERTIFICATE (RC) OF THE VEHICLE (Capture Image each); Select Additional Document | Additional: AADHAAR CARD, BANK ACCOUNT STATEMENT / PASSBOOK, BLANK SIGNED CHEQUE, BUSINESS ADDRESS PROOF, DRIVING LICENCE, ECS MANDATE FOR EMI PAYMENT, GST REGISTRATION (list scrolls) | "Document Uploaded Successfully." | #51–54 |
| Application Form — Personal | Lead Ref, Member Type, Name, DOB, Father Name, Mobile (RO); Mother / Maiden Name, Email Id, Religion, Cast, Nationality / Citizenship, No Of Dependents | Hindu, General, Indian Resident | — | #56–57 |
| Application Form — Address | Current Address (RO); Year And Month Current Address; Year And Month Current City; Permanent Address: *Same As Current Address*, Address Line 1–3, Pincode, District, State, Accomadation, Residence | Living With Family; Bungalow (web: FLAT) | Same As Current Address hides the permanent block | #58–61 |
| Application Form — Office | Udhyam Certificate, Office Name, Designation, *Same As Current Address*, *Same As Current Permanent*, Address Line 1–3, Pincode, District, State, Office Mobile Number | Udhyam: No | — | #62–63 |
| Application Form — Reference | Reference 1 & 2: Name, Relationship, Mobile Number, Address Line 1–3, Pincode, District, State | Brother | — | #64–65 |
| Repayment (Bank Account Verification) | Re-Payment Account, Customer Name (RO), IFSC Code (lookup shows Bank Name, Branch Name, Address), Account Number; Authenticate | Applicant | Status "REPAYMENT ACCOUNT VERIFIED" | #181–183 |
| Deal Structure | Header: Sanction On Asset, Sanction Tenure, Funded Charges, Total Charges, Total Sanction Amount, Scheme, Actual Bank Policy MLR, Applied ROI, Document Charges, Repayment Frequency · Loan Availed (Max) · Document Charges Funded/Non Funded · PF: Funded/Non Funded, Offered PF (Policy Amount), Total Offered PF (Incl GST), Justification If Any (PF) · CLI: CLI, CLI Coverage Amount (Max), Funded/Non Funded, Tenure, CLI Premium, Justification If Any (CLI) · Hospi: Hospi Taken, Funded/Non Funded, Tenure, Hospi Premium · Total Availed Amount · Offered ROI (MLR/MIN/MAX) · Justification If Any (ROI) · Emi Amount · Summary: PF, CLI, Hospi, Margin Money | — | Statuses ASM APPROVAL PENDING → BUSINESS APPROVAL PENDING; on Business rejection RATE NEGOTIATION and the SO resubmits | #185–212 |
| Sanction Letter | Ekyc Required (Go Home / Do E-kyc); Member E-Kyc List; Aadhaar Consent (checkbox, preferred language, Aadhaar-linked mobile); Aadhaar E-Kyc (Aadhaar number, Genrate OTP); Loan Summary (Sanction Date, Tenure, ROI, Total Availed Amount, 1st Emi Date, Emi Amount) | ENGLISH | Hard stop text (see §5) | #225–229 |
| Update Nach | Loan Amount, Tenure, Repayment Account, Account Name, IFSC, First EMI Date; Nach Type | E-NACH, SI, PHYSICAL NACH | — | #230–231 |
| Disbursement Details | Dealer Account Name, Dealer Account No, IFSC, Disbursement Amount; New Dealer toggle | — | — | #232 |
| Nominee Details | Name, Relationship, DOB (DD-MM-YYYY), Gender, Address Line 1–3, Pincode, District, State | Brother, Male | — | #234–235 |
| Upload Pre Disbursement Document | "SCHEME" documents: BANK STATEMENT, HYPOTHECATION AGREEMENT, INSURANCE POLICY, LOAN AGREEMENT, POST-DATED CHEQUE, QUOTATION, SANCTION LETTER, TAX INVOICE, UDYAM CERTIFICATE; SIGNATURE - APPLICANT; Select Additional Document | — | Status DISBURSEMENT DOCUMENT UPLOADED; on QC rejection QC INITIATED DOCUMENT REQUESTED | #237–240, #249–253 |
| My Task / Lead Task List / Task Document Upload / Query List / Task Query | Stage tags COMPLIANCE, CREDIT, DISBURSEMENT; task types DOCUMENT REQUEST, ADDITIONAL DOCUMENT REQUEST, FI, QUERY; rejection remark shown under the capture control | — | Rework loops | #82–88, #131–136, #251–253 |
| FI Tasks List / FI - INITIATION (mobile) | Task Reference No, Task Type (PERMANENT ADDRESS FI, CURRENT ADDRESS FI), Address; Agency Assign / Self Assign; Document Image, Remarks, map | — | — | #118, #148 |

### 3.2 Back-office (web) screens — Two Wheeler

| Sub-stage | Content | Source |
|---|---|---|
| Duplicate Leads / Case Details | Lead Created Date, Source Type, Source Name, SO, Product Name, Sourcing Branch, Member Name, Case Type, Disbursement Branch; Reference Lead List with Mobile No / Aadhaar / POI / POI 2 / POA / PAN match ticks; Application Accepted / Application Rejected | #26–27 |
| Due Diligence | Legend PENDING / VERIFIED / IMAGE DISTORTED / COMPLIANCE REJECT; documents Aadhaar (POI), Aadhaar (POA), Live Photo, PAN; questionnaires (name/DOB match, Aadhaar masked, image clear, photo match; live photo cleared/matched; PAN name/DOB, PAN valid & visible, image clear, format 5 letters + 4 digits + 1 letter, verified via NSDL/ITD); Status; Remarks (200 characters); Archive this image!; Final Due Diligence Task Summary | #70–81 |
| CAM Preparation | Status strip (Due Diligence, TVR, FI, RCU, Income Validate, Deviations); tabs Case Details, Asset Details, Asset Cost Details, Applied Loan Details, All Charges, Collateral Details, Credit Sanction, Availed Loan Details, Charges Breakup, Disbursement Details; Prohorizon Score Details (Profile Credit Endurance / Total Income / Asset Risk / Prohorizon Score, Profile Score QUALIFIED); CAM Activities menu (Memo, Application Details, Income Validation, Deviation, Document); Dedupe report (CBS / LOS / Address); Initiate TVR / FI; Request / Upload Additional Document; Query with SO; Case Modify | #89–113, #143 |
| Income Validation (TW) | Tabs Income / Banking. Monthly income (Member Type, Member Name, Primary Income, Alternate Income, Loan to Income by SO, Validated Income); Obligation (Bureau, Current Loan, Monthly Credit Card, Miscellaneous, Rent, Additional, Excluded) and FOIR; Asset vs Liability / Net Worth; Risk & Mitigants; Exposure; Banking (Member, IFSC, Account No, 10th/20th/30th balances, average) | #96–103 |
| Deviation | Add Deviation master (code / description / department / authority, e.g. AGE L2/L3, CAUTION FI L3, CIBIL L4, CIBILSMA2 L4, CIBIL Score<650 L1, DOCNORM, EMI, IDV_5, IDV_10, WAIVER, WRITE OFF); No Deviation tick → NODEVIATION row (Credit - L1); tabs Credit / Business / Deferral Deviation; credit deviation lines TVR, FI **and RCU** "System auto deviations!"; Update Status (Pending / Approve / Reject), Auth Remarks | #105–107, #156, #168–171 |
| In-Principle Approval | Asset Cost, Finance Amount, Loan Tenure, Previous Repayment Frequency (RO); Sanction Amount*, Repayment Fequency* (Monthly, Quaterly, Half Yearly), Sanction Tenure* (months), Remark*, Sanction Conditions (Add); live LTV / FOIR / EMI | #144–147 |
| External Credit Evaluation (FI) | FI submitted report; questionnaire (10 questions — office/business address verified, occupancy status observed, overall environment observed, adverse findings, branch sign & stamp …); Status* (Positive, Negative, Re-Initiate to same, Assign to other agency); Remarks* | #149–154 |
| RCU | Legend PENDING / SAMPLE / SCREENING / RCU HOLD / NEGATIVE / FRAUD; per document RCU Status, RCU Remarks, Evaluation Status, Evaluation Remarks, Assign To; Self Assign / Assign to agency; Final RCU Task Summary (Remark*, 200 chars) | #159–162 |
| Credit Decisioning | In-principle details; Sanction Amount* (Max Limit), Repayment Fequency*, Sanction Tenure*, Repayer, Repayer Bank Account (+Verify), Registration In Favor Of, Add Special Conditions (type / condition), Sanction Conditions, Credit Approval Remark*, CREDIT APPROVE, LOAN DECLINE | #172–178 |
| ASM / Business | Business Queue; ASM Approval Pending; Business Approval Pending (Auth BS L0 to L6); approve / reject with remark | #191–222 |
| QC Maker / QC Checker | Disbursement Documents / All Documents tabs; document cards PENDING → VERIFIED; Validate / Re-Validate; Mark As Complete; status QC INITIATED DOCUMENT RE-SUBMITTED after rework | #241–266 |
| Disbursement Update | Disbursement Update Action: Enter Disbursement Amount*, Remark* | #267–271 |
| Auth Done | Auth Action: Disbursement Update Amount (RO), Enter Auth Disbursement Amount*, Remark*; Memo (Credit Memo / Disbursement Memo sections); All Documents (OVD, Scheme, Additional Document, FI …) with DD / QC statuses | #272–287 |

**Not captured for Two Wheeler:** the Final Disbursement CIF / Loan Account / GL screens, the Relook
screen and the TVR questionnaire. Those sub-stages are seeded from the Tractor manual and flagged.

---

## 4. New / Used Tractor — journey from the manual

Canonical mobile order (Manual Fig 19, 54, 66, 128, 147):
`Mobile Verification → Bureau → FVR → Personal Discussion → Loan Details → Document Upload → Application Form`.

| Sub-stage | Sections / fields | Validations / rules stated | Source |
|---|---|---|---|
| Create Lead / Mobile Verification / KYC | as Two Wheeler (Channel Partner, Application Type; Mobile Number, consent; KYC method; POI/POA, names, DOB DD-MM-YYYY, Gender, Father Name, Address Line 1–2, District/State auto, PAN, Loan Amount, Live Photo, Pancard) | Channel Partner and Application Type required; consent required for Get OTP; DOB format; District/State auto-derived | §6, Fig 4–9 |
| Duplicate Check | six match indicators (Mobile, Aadhaar, POI, POI 2, POA, PAN); Application Accepted / Rejected / Cancel Application | Reject stops the case | §7, Fig 14–16 |
| Bureau | automatic; Bureau Approved / Rejected / Expired ("Lead Expired - Validity Period Exceeded") | Reject blocks the journey | §8 |
| FVR | Land & Crop (Land Holding: Name of Village, Survey No, Sub Survey No, Distance of Branch Agri Land (Kms), Title, Area (Acre), Type of Land, Relationship With Applicant, Encumbrance If Any; Crop Details: Area (Hectare/Acre), Name of Crop, Season, Yield Per Acre Per Quintal, Market Price Per Quintal, Total) · Other Income · Obligation (Nature of Loan, Name of Institution, Date of Sanction, Loan Amount, Outstanding Amount, Equated Installment Interest, Repayment By) · Agri & Allied (Total Agriculture Income, Owned Agriculture Land, Family Land, Is Agri & Allied, No. of Buffalo/Cows/Exotic Animal/Goat, Is Other & Allied Activity, Other Allied Activity Name/Income 1–2, Allied Income, Total Agri & Allied Income) · Tractor Income (Tractor HP, Age, Tractor Income, No. of Harvester, No. of Excavation (JCB), Total Machinery Income) · Document Income (Is Document Income, ITR Gross-Tax / Salaried / Rental / Other In Annual, Document Income In Annual) · Info (Distance of Branch to Residence, Source of Irrigation, Purpose, Agri Experience, FI Status) | Crop Total = yield × price × area; Document Income = sum of the four; Allied / Tractor / Machinery income auto-calculated (formula **not** stated) | §9, Fig 20–38 |
| Personal Discussion | Customer Profile (Profile; Asset — moveable rows with No. & Approx. Value, immovable rows, totals; Family members; Current / Permanent address blocks; Staff Details) + business interview (Is Any Business; business detail; trailing 3-month sales / purchase / electricity; office & staffing; field-verification checklist; signboard, registration, two prominent customers, neighbour, Major Observations) | Staff employer fields only when Is Staff = Yes; business detail only when Is Any Business = Yes; asset totals auto-sum | §10, Fig 39–54 |
| Loan Details | Sourcing (Lead Ref, Product, Channel, Vehicle Status, Scheme, Dealer, Dealer Outlet, Disbursement Branch) · Asset (Manufacturer, Model, HP, Variant, Date of Delivery, Engine Number, Chassis Number, Hour Meter Reading) · Loan (Bank Price, Dealer Proforma Invoice Amount, Total Asset Cost, Applied Loan Amount, Margin Money, PSL Detail, Offered ROI, Repayment Frequency, Tenure) · Charges (Funded/Non Funded, PF % As Per Policy, PF Amount, Offered Processing Fee, Total PF incl. GST, CLI, CLI Coverage Amount, Actual Premium, CLI Premium, Tenure) · Summary (income / obligation breakup, LTV, MLR, ROI, charges, EMI) | Applied Loan capped by LTV %; Offered ROI bounded by policy min/max (example 9.45 %–15.75 %); Date of Delivery DD-MM-YYYY | §11, Fig 55–59 |
| Document Upload | dealer Quotation image; Select Additional Document | — | §12 |
| Application Form | Personal (Mother/Maiden Name, Email, Religion, Cast, Nationality, Dependents) · Address (current RO, years/months at address and city, Same As Current Address, permanent block) · Office (Is Office Details, Udhyam Certificate, Office Name, Designation, Address Line 1–3, Pincode, District, State, Office Mobile) · Reference 1 & 2 | Permanent block hidden when Same As Current; office fields only when Is Office Details = Yes; **submission locks the journey** (§13.1) | §13, Fig 62–67 |
| Due Diligence → Final Disbursement | as described in Manual §14–35 (questionnaires, CAM, Income Validation five tabs, RCU, FI Q1–Q8, TVR Q1–Q6, In-Principle Approval, Deviation, Credit Decisioning, Repayment + Penny Drop, Deal Structure incl. Stamp Duty, ASM, Business, Sanction Letter + e-KYC, NACH, Disbursement Details, Nominee, Pre-Disbursement Documents (DPN, DPN Delivery Cum Waiver Letter, Security PDC, Signature — Applicant), QC Maker / Checker, Disbursement Update, Auth Done, Final Disbursement: CIF / Loan Account / GL with Base, IGST, CGST, SGST, Final Amount) | Remark mandatory on every completion modal; In-Principle Sanction Amount / Frequency / Tenure / Remark mandatory; e-KYC gate | §14–35 |

### 4.1 Two Wheeler vs Tractor — differences honoured in the seed

| Area | Two Wheeler (OPTIM) | Tractor (manual) |
|---|---|---|
| Pre-application steps | Loan Details → **Score Card** | **FVR → Personal Discussion** → Loan Details |
| Asset | Manufacturer / Model / Variant / Fuel Type | + HP, Date of Delivery, Engine / Chassis No., Hour Meter |
| Loan pricing | Asset Cost, Discount, Ex-showroom, Road Tax, Insurance, Registration, Other, On-road, Accessories, Ext. Warranty (formulas proven) | Bank Price, Dealer Proforma, Total Asset Cost, PSL Detail |
| Charges | PF + CLI + **Hospi premium**, Document Charges | PF + CLI, **Stamp Duty** in Deal Structure |
| Document Upload | Bank Statement, Insurance Policy, RC | Dealer Quotation |
| Pre-disbursement documents | 9 scheme documents + Signature | DPN, DPN Delivery Cum Waiver, Security PDC, Signature |
| Income validation | Income / Banking, FOIR | 5 tabs, NFCF:AI |
| Credit deviations | TVR, FI **and RCU** observed | FI / TVR |
| NACH types | E-NACH, SI, PHYSICAL NACH | Physical NACH (+ eNACH per process) |
| Office details | Same As Current / Permanent ticks | Is Office Details toggle |

---

## 5. Workflow, statuses and business rules (both sources)

**Happy-path statuses** (Manual §36): Lead Created → Duplicate Approved → Bureau Approved →
(FVR/PD)/Loan Details/Documents/Application Form Completed → Due Diligence Pending → Cam Pending →
FI/TVR/RCU Initiated → In-Principle Approval Pending → In-Principle Approved → (Deviation Approved) →
Credit Approval Pending → Credit Sanctioned → Repayment Account Verified → Deal Structure Submitted →
ASM Approval Pending → Business Approval Pending → Loan Sanctioned → NACH → Disbursement Document Uploaded →
QC Verified → QC Audited → Disbursement Updated → Auth Done → Final Disbursement.

**Alternate statuses** (Manual §36.1, OPTIM): Duplicate Lead / Duplicate Rejected, Bureau Rejected / Expired,
Document Requested, Compliance Rejected, Deviation Pending / Initiated, Loan Declined, Relook,
Case Modified, Additional Document Request, Rate Negotiation (TW), QC Initiated Document Requested /
Re-Submitted (TW).

**FI / TVR / RCU statuses** (Manual §16.3): Pending, Initiated, Waived Off, Positive, Negative
(plus DEV. APPROVED badges once a deviation is approved).

**Rules seeded as workflow transitions** (Workflow Configuration page, source column on every row):

1. Duplicate rejection stops the case (terminal).
2. Bureau rejection / expiry blocks the journey (terminal).
3. Application Form submission locks the journey (`requireAllMandatoryFields`, exception note).
4. Due Diligence: Mark As Complete (remark required) → CAM; *Image Distorted* → Document Request to SO (Loop 1); *Compliance Reject* → fresh lead (terminal, "business rule described in process documentation").
5. CAM: Prepare CAM → In-Principle Approval; Modify (Loop 3); Request Additional Document (Loop 2); Query; CAM Hold; Initiate FI / TVR; Reject CAM (destination not stated — flagged).
6. FI / TVR Negative → automatic credit deviation; Positive → no deviation.
7. Deviation Approve → Credit Approval; Reject → Loan Declined → Relook (Loop 4).
8. Credit Approve → Repayment; Loan Decline → Relook.
9. Deal Structure with deviation (PF / CLI / CLI tenure / MLR discount) → ASM (recommendation only) → Business; without deviation → Sanction Letter.
10. Business Reject → SO resubmits Deal Structure, deviation re-checked (Loop 5).
11. **e-KYC hard stop** before Sanction Letter: *"Please complete your E-KYC to continue. The sanction letter can be issued only after E-KYC verification."*
12. QC Maker discrepancy → SO → QC Maker (Loop 6); QC Checker rejection → SO → QC Maker → QC Checker (Loop 7).
13. Final Disbursement creates only CIF, Loan Account and GL Account (no other accounting process is documented).

**Messages reproduced verbatim** (Manual §41): "live photo not matching to customer please capture
customer live photo"; "undefined Unable to verify bank account. Please try again."; the e-KYC hard stop;
"No Record Found." / "No records found!"; "Document Uploaded Successfully."; "Note: If the requested
document is not available in the dropdown list above, please contact the administrator for assistance."

---

## 6. How the sources were mapped into the portal

| Product | Seeded as | Basis |
|---|---|---|
| New Two Wheeler | **v1 PUBLISHED** — "Source baseline (seeded) — pending business confirmation" | OPTIM screenshots |
| New Tractor | **v1 PUBLISHED** — same label | Tractor manual |
| Used Tractor | **v1 PUBLISHED** — same label; Loan Details → Asset section flagged | Tractor manual; used-asset specifics not documented separately |
| New Car, Used Car | **v1 DRAFT** starter template | Only the product tiles and schemes NC-NIP / UC-NIP were observed |
| New / Used Commercial Vehicle | **v1 DRAFT** starter template | No source material |

Starter templates contain the OPTIM stage skeleton (all flagged) and the product-independent Lead
Creation / Mobile Verification / KYC screens (flagged "common OPTIM screen — confirm for this product").
**No Tractor fields are copied into other products.**

Seeded counts: Two Wheeler 7 stages / 33 sub-stages / 454 fields / 23 documents / 54 transitions;
New and Used Tractor 7 / 34 / 630 / 19 / 55; each starter 6 / 26 / 25 / 4 / 2.

Mapping conventions:

* A screen = a **sub-stage**; a tab or block on that screen = a **section (module)**; "+ Add" lists = **repeatable sections**.
* Buttons that move a case (Submit, Approve, Reject, Mark As Complete, Query…) are **workflow transitions**, not fields.
* Image captures that represent documents are **document requirements** (with the validating role), not fields.
* Field requirement is **Mandatory only where the source shows an asterisk or says so**; everything else is Optional until confirmed.
* Every seeded item carries a `sourceRef` (e.g. `OPTIM #36`, `Manual Fig 57`), visible in the field editor's *Source* tab.

---

## 7. Items requiring confirmation

These are flagged in the portal (Dashboard → "To confirm" column, Field Builder → "Requires confirmation only").

1. Complete dropdown lists for every master that was only partially visible: Gender, POI / POA types, Application Type, Religion, Cast, Nationality, Relationship, Accommodation / Residence, Fuel Type, CLI / Hospi options, Consent Language, Document Master, and every dropdown in FVR / PD / Score Card whose values were not shown.
2. Mandatory / optional status of every field without a visible asterisk.
3. Score-card questions, answer types and weights (only the "Score Type" selector was visible).
4. Formulas for Allied Income, Total Agri & Allied Income, Tractor Income, Total Machinery Income, LTV, FOIR, NFCF, EMI, broken-period interest.
5. Scheme policy values: LTV %, ROI min/max per scheme (observed examples: TW-NIP 12.25–25 % with MLR 16 %; Kisan Vahan New Tractor (Lite) 9.45–15.75 %), PF %, GST rate (18 % inferred from values), CLI maximum coverage.
6. Credit / Business authority matrix (CR L0–L5, BS L0–L6) and which deviation codes need which level.
7. Destination after *Reject CAM* and after an ASM *Reject* recommendation; CAM Hold behaviour; Relook screen fields.
8. Used Tractor asset fields (registration, valuation, year of manufacture, etc.) — not documented separately.
9. Two Wheeler TVR questionnaire, Final Disbursement (CIF / Loan / GL) screens and Relook — not captured.
10. Whether RCU negatives generate a credit deviation for Tractor (observed for Two Wheeler only).
11. Mandatory status of each of the nine Two Wheeler pre-disbursement scheme documents.
12. Mobile (10-digit), Pincode (6-digit) and Aadhaar (12-digit) format checks — inferred from observed values and field masks.
13. Everything for New / Used Car and New / Used Commercial Vehicle.

---

## 8. Phase-1 implementation checklist

- [x] Inspect project folder and Git state (empty folder with the two reference files; remote repository empty).
- [x] Extract the OPTIM ZIP (287 screenshots) and review every screenshot in timestamp order.
- [x] Extract the full manual text and tables (43 sections, 163 figures).
- [x] Record stages, sub-stages, sections, fields, dropdown values, validations, roles, statuses and rules (this document).
- [x] Separate Two Wheeler and Tractor journeys; do not copy Tractor fields to other products.
- [x] List uncertainties and flag them in data (`needsConfirmation`).
- [x] Seed products, schemes, roles and source-based configurations with source references.
