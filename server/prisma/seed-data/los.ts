/**
 * Source-derived starting configurations.
 *
 *  - Two Wheeler: OPTIM screenshots (optimscreen.zip, 287 images, 06-Aug-2026 test case
 *    LEAD0608008833, scheme TW-NIP). References look like "OPTIM #36".
 *  - New / Used Tractor: "ProHorizon Tractor Loan End-to-End User Manual v1.0".
 *    References look like "Manual Fig 57" or "Manual §13.1".
 *
 * Rules used when writing this file (see docs/reference-analysis.md):
 *  - Fields, labels, dropdown values and validations are only included when visible
 *    in the source. Dropdowns whose values were not visible have no options and are
 *    flagged needsConfirmation (nc).
 *  - "Mandatory" is only set where the source shows a red asterisk or states it.
 *    Everything else is Optional until the business confirms.
 *  - Formulas are only configured where the source states them or the screenshot
 *    numbers prove them; other auto-calculated values are READONLY + nc.
 *  - Display order (stage sequence) is separate from routing (transitions).
 */
import {
  area, buildSnapshot, calc, check, cur, date, dd, dec, eq, file, int, neq, radio, ro, text, yn,
  type DocSpec, type FieldSpec, type ModuleSpec, type StageSpec, type SubSpec, type TransSpec,
} from './dsl';

export type Variant = 'TW' | 'NEW_TRACTOR' | 'USED_TRACTOR';
const isTractor = (v: Variant) => v !== 'TW';

const FUNDED = ['Funded', 'Non Funded'];
const REPAY_FREQ = ['Monthly', 'Quarterly', 'Half Yearly'];
const YES_NO = ['Yes', 'No'];
const ADDITIONAL_DOCS = [
  'AADHAAR CARD', 'BANK ACCOUNT STATEMENT / PASSBOOK', 'BLANK SIGNED CHEQUE', 'BUSINESS ADDRESS PROOF',
  'DRIVING LICENCE', 'ECS MANDATE FOR EMI PAYMENT', 'GST REGISTRATION', 'LEASE AGREEMENT',
];
const ADDITIONAL_DOC_NOTE = 'Values observed on OPTIM #52/#53/#111/#284; the full Document Master list was not visible (list scrolls) — confirm.';

function addressBlock(prefix: string, labelPrefix: string, src: string, lines = 3): FieldSpec[] {
  const out: FieldSpec[] = [];
  for (let i = 1; i <= lines; i++) out.push(text(`${labelPrefix}Address Line ${i}`, { key: `${prefix}AddressLine${i}`, src }));
  out.push(text(`${labelPrefix}Pincode`, { key: `${prefix}Pincode`, src, minLen: 6, maxLen: 6, pattern: '^[0-9]{6}$', patternMsg: 'Pincode must be 6 digits.', nc: true, notes: '6-digit format inferred from observed values (e.g. 110055) — confirm.' }));
  out.push(ro(`${labelPrefix}District`, { key: `${prefix}District`, src, map: 'Auto-populated from Pincode', help: 'Auto-derived from Pincode (read-only).' }));
  out.push(ro(`${labelPrefix}State`, { key: `${prefix}State`, src, map: 'Auto-populated from Pincode', help: 'Auto-derived from Pincode (read-only).' }));
  return out;
}

// ─────────────────────────── LOGIN stage (customer-facing, mobile) ───────────────────────────

function leadCreation(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual Fig 4; channel values from OPTIM #6' : 'OPTIM #5–#7';
  return {
    key: 'leadCreation', name: 'Lead Creation', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    desc: 'Minimum selection to open a lead. Lead reference format LEAD + 10 digits (Manual §6).',
    fields: [
      dd('Channel Partner', ['DIRECT', 'DSA', 'DDSA', 'CORPORATE DSA', 'BC WITH FLDG', 'BC WITHOUT FLDG', 'BRANCH'], { req: 'M', src, nc: false, notes: isTractor(v) ? 'Option list observed on the Two Wheeler screen (OPTIM #6); assumed to be the same app master — confirm for Tractor.' : undefined }),
      dd('Application Type', ['Individual'], { req: 'M', src, nc: true, notes: 'Only "Individual" was observed; other application types (if any) need confirmation.' }),
    ],
  };
}

function mobileVerification(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual Fig 5' : 'OPTIM #8–#10';
  return {
    key: 'mobileVerification', name: 'Mobile Verification', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    fields: [
      text('Mobile Number', { req: 'M', src, help: 'Linked with the customer\'s PAN or Aadhaar (+91).', minLen: 10, maxLen: 10, pattern: '^[0-9]{10}$', patternMsg: 'Enter a 10-digit mobile number.', nc: true, notes: '10-digit format inferred from the +91 prefix and observed value — confirm.', sensitive: true, mask: 'SHOW_LAST_4' }),
      check('I do hereby confirm that I have taken customer consent to use the given number for processing loan application.', { key: 'customerConsent', req: 'M', src, help: 'Get OTP stays disabled until consent is ticked (Manual Fig 5).' }),
      text('Enter OTP', { key: 'mobileOtp', req: 'M', src: 'OPTIM #10', minLen: 6, maxLen: 6, pattern: '^[0-9]{6}$', patternMsg: 'Enter the 6-digit OTP.', help: '6-digit OTP with resend countdown; "Wrong Number?" returns to number entry.' }),
    ],
  };
}

function kyc(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual Fig 6–9' : 'OPTIM #11–#17';
  return {
    key: 'kyc', name: 'KYC', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    desc: 'Aadhaar e-KYC or Other (OVD) document; completing KYC creates the lead and triggers the Duplicate Check.',
    modules: [
      { key: 'kycMethod', name: 'KYC Method', src, fields: [radio('KYC Method', ['Aadhaar E-Kyc', 'Other Document'], { req: 'M', src })] },
      {
        key: 'personalDetails', name: 'Personal Details', src, fields: [
          ro('Mobile Number', { key: 'verifiedMobileNumber', src, help: 'Verified number from Mobile Verification (read-only).' }),
          dd('POI Type', ['AADHAAR CARD'], { req: 'O', src, nc: true, notes: 'Only "AADHAAR CARD" observed (web case view) — confirm the OVD list.' }),
          text('POI Number', { src, sensitive: true, mask: 'MASK_ALL_BUT_LAST_4' }),
          text('First Name', { src }),
          text('Middle Name', { src }),
          text('Last Name', { src }),
          date('DOB', { src, help: 'Format DD-MM-YYYY (enforced on screen).' }),
          dd('Gender', ['Male'], { src: isTractor(v) ? 'Manual Fig 8' : 'OPTIM #13', nc: true, notes: 'Only "Male" was visible in the source; complete the list.' }),
          text('Father Name', { src }),
        ],
      },
      {
        key: 'addressDetails', name: 'Address Details', src, fields: [
          dd('POA Type', ['AADHAAR CARD'], { src, nc: true, notes: 'Only "AADHAAR CARD" observed — confirm.' }),
          text('POA Number', { src, sensitive: true, mask: 'MASK_ALL_BUT_LAST_4' }),
          ...addressBlock('kyc', '', src, isTractor(v) ? 2 : 3),
        ],
      },
      {
        key: 'panAndLoan', name: 'PAN & Loan Amount', src, fields: [
          text('PAN Number', { src, sensitive: true, mask: 'MASK_MIDDLE', pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', patternMsg: 'PAN must be 5 letters, 4 digits and 1 letter.', notes: 'Format from the Due Diligence PAN questionnaire ("5 letters + 4 digits + 1 letter").' }),
          cur('Loan Amount', { src }),
        ],
      },
    ],
  };
}

function duplicateCheck(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual Fig 14–16, §7' : 'OPTIM #26–#27';
  return {
    key: 'duplicateCheck', name: 'Duplicate Check', platform: 'WEB', role: 'DUPLICATE_REVIEWER', src,
    desc: 'System screens the new lead against prior leads; flagged cases go to the Duplicate Leads queue. Decision buttons are workflow actions.',
    modules: [
      {
        key: 'duplicateLeadDetails', name: 'Duplicate Lead Details', src, fields: [
          ro('Lead Created Date', { src }), ro('Source Type', { src }), ro('Source Name', { src }), ro('SO', { key: 'soName', src }),
          ro('Product Name', { src }), ro('Sourcing Branch', { src }), ro('Member Name', { src }), ro('Case Type', { src }), ro('Disbursement Branch', { src }),
        ],
      },
      {
        key: 'matchIndicators', name: 'Reference Lead List — Match Indicators', repeatable: true, src, fields: [
          ro('Application No', { src }), ro('Stage', { key: 'priorStage', src }), ro('Status', { key: 'priorStatus', src }),
          ro('Mobile No Match', { src }), ro('Aadhaar Match', { src }), ro('POI Match', { src }), ro('POI 2 Match', { key: 'poi2Match', src }),
          ro('POA Match', { src }), ro('PAN Match', { src }),
        ],
      },
    ],
  };
}

function bureau(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual Fig 18–19, §8' : 'OPTIM #31–#32, #143';
  const fields: FieldSpec[] = [
    ro('Bureau Status', { src, help: 'Bureau Approved / Bureau Rejected / Bureau Expired.' }),
    ro('Score', { key: 'bureauScore', src, help: 'Bureau risk grade shown on the lead card (e.g. EB6).' }),
    ro('Remarks', { key: 'bureauRemarks', src }),
  ];
  if (v === 'TW')
    fields.push(
      ro('Profile Credit Endurance Score', { src: 'OPTIM #143' }), ro('Profile Total Income Score', { src: 'OPTIM #143' }),
      ro('Profile Asset Risk Score', { src: 'OPTIM #143' }), ro('Profile Prohorizon Score', { src: 'OPTIM #143' }),
      ro('Prohorizon Profile Score', { src: 'OPTIM #143', help: 'e.g. QUALIFIED' }),
    );
  return { key: 'bureau', name: 'Bureau', platform: 'SYSTEM', role: 'SYSTEM_ENGINE', src, desc: 'Runs automatically after Duplicate Check clears.', fields };
}

function fvr(): SubSpec {
  const s = (n: number | string) => `Manual Fig ${n}`;
  return {
    key: 'fvr', name: 'FVR — Field Verification Report', platform: 'MOBILE', role: 'SALES_OFFICER', src: 'Manual §9, Fig 20–38',
    desc: 'Sub-tabs in order: Land & Crop, Other Income, Obligation, Agri & Allied, Tractor Income, Document Income, Info.',
    modules: [
      {
        key: 'landHolding', name: 'Land & Crop — Land Holding', repeatable: true, src: s('21–23'), fields: [
          ro('Lead Reference No', { key: 'fvrLeadReferenceNo', src: s(21) }), ro('Product', { key: 'fvrProduct', src: s(21) }),
          ro('Total Land Holding of Applicant', { src: s(21) }),
          text('Name of Village', { src: s(22) }), text('Survey No', { src: s(22) }), text('Sub Survey No', { src: s(22) }),
          dec('Distance of Branch Agri Land (Kms)', { key: 'distanceBranchAgriLand', src: s(22) }),
          dd('Title', [], { key: 'landTitle', src: s(22) }), dec('Area (Acre)', { key: 'landAreaAcre', src: s(22) }),
          dd('Type of Land', [], { src: s(22) }), dd('Relationship With Applicant', [], { key: 'landRelationship', src: s(22) }),
          text('Encumbrance If Any', { src: s(22), nc: true, notes: 'Control type not visible — confirm.' }),
        ],
      },
      {
        key: 'cropDetails', name: 'Land & Crop — Crop Details', repeatable: true, src: s('24–26'), fields: [
          dec('Area (Hectare)', { key: 'cropAreaHectare', src: s(25) }), dec('Area (Acre)', { key: 'cropAreaAcre', src: s(25) }),
          dd('Name of Crop to be Grown', [], { key: 'cropName', src: s(25) }), dd('Season', [], { src: s(25) }),
          dec('Yield Per Acre Per Quintal', { key: 'yieldPerAcreQuintal', src: s(25) }),
          cur('Market Price Per Quintal (Selling Price)', { key: 'marketPricePerQuintal', src: s(25) }),
          calc('Total', 'yieldPerAcreQuintal * marketPricePerQuintal * cropAreaAcre', { key: 'cropTotal', src: s(25), notes: 'Manual: "Total auto-computes from yield × price × area".' }),
        ],
      },
      {
        key: 'otherIncome', name: 'Other Income', src: s(27), fields: [
          yn('Is Other Income', { key: 'isOtherIncome', src: s(27) }), dd('Source of Other Income', [], { src: s(27) }),
          dd('Proof of Other Income', [], { src: s(27) }), text('How Long Applicant is Receiving Other Income', { key: 'otherIncomeDuration', src: s(27), nc: true }),
        ],
      },
      {
        key: 'obligation', name: 'Obligation', repeatable: true, src: s('28–30'), fields: [
          ro('Total Obligation', { key: 'fvrTotalObligation', src: s(28) }),
          dd('Nature of Loan', [], { key: 'obligationNatureOfLoan', src: s(29) }), text('Name of Institution', { key: 'obligationInstitution', src: s(29) }),
          date('Date of Sanction', { key: 'obligationSanctionDate', src: s(29) }), cur('Loan Amount', { key: 'obligationLoanAmount', src: s(29) }),
          cur('Outstanding Amount', { key: 'obligationOutstanding', src: s(29) }), cur('Equated Installment Interest', { key: 'obligationEmi', src: s(29) }),
          dd('Repayment By', [], { key: 'obligationRepaymentBy', src: s(29) }),
        ],
      },
      {
        key: 'agriAllied', name: 'Agri & Allied', src: s('31–32'), fields: [
          ro('Total Agriculture Income', { src: s(31) }), dec('Owned Agriculture Land', { src: s(31) }), dec('Family Land', { src: s(31) }),
          yn('Is Agri & Allied', { key: 'isAgriAllied', src: s(31) }), int('No. of Buffalo', { key: 'noOfBuffalo', src: s(31), min: 0 }),
          int('No. of Cows', { key: 'noOfCows', src: s(31), min: 0 }), int('No. of Exotic Animal', { key: 'noOfExoticAnimal', src: s(31), min: 0 }),
          int('No. of Goat', { key: 'noOfGoat', src: s(31), min: 0 }), yn('Is Other & Allied Activity', { key: 'isOtherAlliedActivity', src: s(31) }),
          text('Other Allied Activity Name-1', { key: 'otherAlliedActivityName1', src: s(32), help: 'e.g. dairy farm, poultry farm' }),
          cur('Other Allied Activity Income-1 (Monthly)', { key: 'otherAlliedActivityIncome1', src: s(32) }),
          text('Other Allied Activity Name-2', { key: 'otherAlliedActivityName2', src: s(32) }),
          cur('Other Allied Activity Income-2 (Monthly)', { key: 'otherAlliedActivityIncome2', src: s(32) }),
          ro('Allied Income', { src: s(32), nc: true, notes: 'Auto-calculated in OPTIM; the formula is not stated in the source.' }),
          ro('Total Agri & Allied Income', { src: s(32), nc: true, notes: 'Auto-calculated in OPTIM; the formula is not stated in the source.' }),
        ],
      },
      {
        key: 'tractorIncome', name: 'Tractor Income', repeatable: true, src: s('33–35'), fields: [
          ro('Total Tractor Income', { src: s(33) }), yn('Is Other Income', { key: 'tractorIsOtherIncome', src: s(33) }),
          dec('Tractor HP', { src: s(34) }), int('Tractor Age', { src: s(34), min: 0 }),
          ro('Tractor Income', { key: 'tractorIncomeAuto', src: s(34), nc: true, notes: 'Auto-calculated from HP and Age; formula not stated.' }),
          int('No. of Harvester', { key: 'noOfHarvester', src: s(35), min: 0 }), int('No. of Excavation (JCB)', { key: 'noOfExcavationJcb', src: s(35), min: 0 }),
          ro('Total Machinery Income', { src: s(35), nc: true, notes: 'Auto-calculated; formula not stated.' }),
        ],
      },
      {
        key: 'documentIncome', name: 'Document Income', src: s(36), fields: [
          yn('Is Document Income', { key: 'isDocumentIncome', src: s(36) }), cur('ITR Gross-Tax In Annual', { key: 'itrGrossTaxAnnual', src: s(36) }),
          cur('Salaried In Annual', { key: 'salariedAnnual', src: s(36) }), cur('Rental In Annual', { key: 'rentalAnnual', src: s(36) }),
          cur('Other In Annual', { key: 'otherAnnual', src: s(36) }),
          calc('Document Income In Annual', 'itrGrossTaxAnnual + salariedAnnual + rentalAnnual + otherAnnual', { key: 'documentIncomeAnnual', src: s(36), notes: 'Manual: "auto-sums the four sub-fields".' }),
        ],
      },
      {
        key: 'fvrInfo', name: 'Info', src: s(37), fields: [
          dec('Distance of Branch to Residence (Kms)', { key: 'distanceBranchToResidence', src: s(37) }), dd('Source of Irrigation', [], { src: s(37) }),
          dd('Purpose', [], { key: 'fvrPurpose', src: s(37) }), text('Agri Experience', { src: s(37), nc: true }), dd('FI Status', [], { key: 'fvrFiStatus', src: s(37) }),
        ],
      },
    ],
  };
}

function customerProfileModules(src: string, withApplicantIncome: boolean): ModuleSpec[] {
  return [
    {
      key: 'profile', name: 'Customer Profile — Profile', src, fields: [
        dd('Marital Status', [], { src }), dd('Education', [], { src }), dd('Accommodation', [], { key: 'profileAccommodation', src }),
        dd('Residence', [], { key: 'profileResidence', src }), dd('Standard of Living', [], { src }), dd('Occupation', [], { src }),
        dd('Sector', [], { key: 'profileSector', src }), dd('Profession', [], { src }),
        int('Current Office — Years', { key: 'currentOfficeYears', src, min: 0 }), int('Current Office — Months', { key: 'currentOfficeMonths', src, min: 0, max: 11 }),
        int('Experience — Years', { key: 'experienceYears', src, min: 0 }), int('Experience — Months', { key: 'experienceMonths', src, min: 0, max: 11 }),
        int('Year in Current Profession', { src, min: 0 }), text('Alternative Business', { src }), text('Alternative Source Income', { src }),
        cur('Applicant Asset Value', { src }),
        ...(withApplicantIncome ? [cur('Applicant Income', { src: 'OPTIM #49' })] : []),
      ],
    },
  ];
}

function personalDiscussion(): SubSpec {
  const s = (n: number | string) => `Manual Fig ${n}`;
  const business = [eq('isAnyBusiness', 'Yes')];
  const moveable = ['Tractor', 'Poultry Birds', 'Cattle', 'Combine Harvester/JCB', 'Value of Gold Owned', 'Four/Two-Wheeler', 'Other Assets'];
  const immovable = ['House/Building', 'Fishing Ponds/Tanks', 'Agri Land(s)', 'Non-Agricultural Property', 'Farm Shed', 'Other Immovable Assets', 'Farm Implements'];
  const k = (l: string) => l.replace(/[^A-Za-z0-9]/g, '');
  const moveFields: FieldSpec[] = moveable.flatMap((m) => [
    int(`${m} — No.`, { key: `asset${k(m)}No`, src: s(42), min: 0 }),
    cur(`${m} — Approx. Value`, { key: `asset${k(m)}Value`, src: s(42) }),
  ]);
  const immFields: FieldSpec[] = immovable.map((m) => cur(`${m} — Approx. Value`, { key: `asset${k(m)}Value`, src: s(43), nc: true, notes: 'Manual lists the rows; whether a "No." column exists for immovable assets is not stated.' }));
  const pdAddress = (prefix: string, label: string): FieldSpec[] => [
    text(`${label} House No`, { key: `${prefix}HouseNo`, src: s(46) }), text(`${label} Street House No`, { key: `${prefix}StreetHouseNo`, src: s(46) }),
    text(`${label} Village`, { key: `${prefix}Village`, src: s(46) }), text(`${label} Post Office`, { key: `${prefix}PostOffice`, src: s(46) }),
    text(`${label} Taluka/Mandal`, { key: `${prefix}TalukaMandal`, src: s(46) }),
    text(`${label} Pincode`, { key: `${prefix}Pincode`, src: s(46) }),
    ro(`${label} District`, { key: `${prefix}District`, src: s(46), map: 'Auto-populated from Pincode' }), ro(`${label} State`, { key: `${prefix}State`, src: s(46), map: 'Auto-populated from Pincode' }),
    text(`${label} Telephone/Mobile No`, { key: `${prefix}Telephone`, src: s(46) }), text(`${label} Residing Since`, { key: `${prefix}ResidingSince`, src: s(46), nc: true }),
    dd(`${label} Residence`, [], { key: `${prefix}Residence`, src: s(46) }), dd(`${label} Type`, [], { key: `${prefix}Type`, src: s(46) }),
    dd(`${label} Proof of Address Type`, [], { key: `${prefix}PoaType`, src: s(46) }), text(`${label} Address Proof Number`, { key: `${prefix}PoaNumber`, src: s(46), sensitive: true, mask: 'MASK_ALL_BUT_LAST_4' }),
  ];
  return {
    key: 'personalDiscussion', name: 'Personal Discussion', platform: 'MOBILE', role: 'SALES_OFFICER', src: 'Manual §10, Fig 39–54',
    desc: 'Customer Profile (Profile / Asset / Family / Staff) plus the business-verification interview. Manual names the role "PD User" for some screens.',
    modules: [
      ...customerProfileModules(s('39–40'), false),
      {
        key: 'assets', name: 'Customer Profile — Asset', src: s('42–43'), fields: [
          ...moveFields,
          calc('Total Moveable Assets', moveable.map((m) => `asset${k(m)}Value`).join(' + '), { src: s(43), notes: 'Manual: "Totals auto-sum from entered rows".' }),
          ...immFields,
          calc('Total Immovable Assets', immovable.map((m) => `asset${k(m)}Value`).join(' + '), { src: s(43), notes: 'Manual: "Totals auto-sum from entered rows".' }),
        ],
      },
      {
        key: 'family', name: 'Customer Profile — Family', repeatable: true, src: s('44–45'), fields: [
          ro('Total of Family Member', { src: s(44) }), text('Name of Family Member', { src: s(45) }), int('Age', { key: 'familyMemberAge', src: s(45), min: 0 }),
          dd('Gender', [], { key: 'familyMemberGender', src: s(45) }), dd('Relationship', [], { key: 'familyMemberRelationship', src: s(45) }),
          dd('Occupation', [], { key: 'familyMemberOccupation', src: s(45) }), cur('Annual Income', { key: 'familyMemberAnnualIncome', src: s(45) }),
        ],
      },
      { key: 'pdCurrentAddress', name: 'Family Details — Current Address', src: s(46), fields: pdAddress('pdCurrent', 'Current') },
      { key: 'pdPermanentAddress', name: 'Family Details — Permanent Address', src: s(46), fields: pdAddress('pdPermanent', 'Permanent') },
      {
        key: 'staff', name: 'Staff Details', src: s(47), fields: [
          yn('Is Staff', { key: 'isStaff', src: s(47) }),
          text('Name', { key: 'staffName', src: s(47), vis: [eq('isStaff', 'Yes')] }),
          text('Branch/Office', { key: 'staffBranchOffice', src: s(47), vis: [eq('isStaff', 'Yes')] }),
          dd('Relationship', [], { key: 'staffRelationship', src: s(47), vis: [eq('isStaff', 'Yes')] }),
          text('Designation/Role', { key: 'staffDesignation', src: s(47), vis: [eq('isStaff', 'Yes')], notes: 'Manual: employer fields appear only when Is Staff = Yes.' }),
        ],
      },
      { key: 'businessProfile', name: 'Personal Discussion — Business Profile', src: s(48), fields: [ro('Customer Name', { key: 'pdCustomerName', src: s(48) }), yn('Is Any Business', { key: 'isAnyBusiness', src: s(48) })] },
      {
        key: 'businessDetail', name: 'Business Detail', src: s(49), vis: business, fields: [
          dd('Nature of Business', [], { src: s(49) }), dd('Type of Business', [], { src: s(49) }),
          dec('Share % in Partnership/Company', { key: 'sharePercent', src: s(49), min: 0, max: 100 }),
          area('Address of Business', { src: s(49) }), dec('Vintage in Year', { key: 'businessVintageYears', src: s(49), min: 0 }), dd('Ownership of Business', [], { src: s(49) }),
        ],
      },
      {
        key: 'businessFinancials', name: 'Trailing 3-Month Business Financials', src: s(50), vis: business, fields: [
          text('Products/Service Names', { src: s(50) }), int('Average Daily Customer', { src: s(50), min: 0 }), cur('Average Daily Sales', { src: s(50) }),
          cur('Month 1 Sales', { key: 'month1Sales', src: s(50) }), cur('Month 2 Sales', { key: 'month2Sales', src: s(50) }), cur('Month 3 Sales', { key: 'month3Sales', src: s(50) }),
          cur('Month 1 Purchase/Expenditure', { key: 'month1Purchase', src: s(50) }), cur('Month 2 Purchase/Expenditure', { key: 'month2Purchase', src: s(50) }), cur('Month 3 Purchase/Expenditure', { key: 'month3Purchase', src: s(50) }),
          cur('Month 1 Electricity Bill', { key: 'month1ElectricityBill', src: s(50) }), cur('Month 2 Electricity Bill', { key: 'month2ElectricityBill', src: s(50) }), cur('Month 3 Electricity Bill', { key: 'month3ElectricityBill', src: s(50) }),
          cur('Inventory (Current Stock)', { key: 'inventoryCurrentStock', src: s(50) }),
        ],
      },
      {
        key: 'officeStaffing', name: 'Office & Staffing', src: s(51), vis: business, fields: [
          int('No. of Staff', { key: 'noOfStaff', src: s(51), min: 0 }), cur('Salary per Staff', { src: s(51) }),
          area('Details of Office', { src: s(51), help: 'chairs / fan / weighing scale / rack etc.' }),
          dd('Office Rented/Owned', ['Rented', 'Owned'], { key: 'officeRentedOwned', src: s(51), nc: true, notes: 'Values implied by the label; confirm.' }),
          cur('Rent', { key: 'officeRent', src: s(51) }), cur('Other Expenses', { key: 'officeOtherExpenses', src: s(51) }),
        ],
      },
      {
        key: 'fieldVerificationChecklist', name: 'Field Verification Checklist', src: s(52), vis: business, fields: [
          dec('Office/Shop/Business Premise Area', { key: 'premiseArea', src: s(52) }), cur('Market Value of Premise', { src: s(52) }),
          dec('Working on Same Premise Since (Yrs.)', { key: 'samePremiseSinceYears', src: s(52), min: 0 }),
          yn('Applicant was Present During Visit', { key: 'applicantPresentDuringVisit', src: s(52) }), yn('Existing Business OD or CC', { key: 'existingBusinessOdCc', src: s(52) }),
          yn('GST', { key: 'gstRegistered', src: s(52) }), yn('Activity Found During Visit', { src: s(52) }),
        ],
      },
      {
        key: 'referenceChecks', name: 'Reference Checks & Final Remarks', src: s(53), vis: business, fields: [
          yn('Sign Board', { key: 'signBoard', src: s(53) }), yn('Is Business Registered', { src: s(53) }),
          text('Prominent Customer 1 — Name', { key: 'prominent1Name', src: s(53) }), text('Prominent Customer 1 — Contact', { key: 'prominent1Contact', src: s(53) }),
          text('Prominent Customer 1 — Feedback', { key: 'prominent1Feedback', src: s(53) }), text('Prominent Customer 1 — Location', { key: 'prominent1Location', src: s(53) }),
          text('Prominent Customer 2 — Name', { key: 'prominent2Name', src: s(53) }), text('Prominent Customer 2 — Contact', { key: 'prominent2Contact', src: s(53) }),
          text('Prominent Customer 2 — Feedback', { key: 'prominent2Feedback', src: s(53) }), text('Prominent Customer 2 — Location', { key: 'prominent2Location', src: s(53) }),
          text('Neighbour Name', { src: s(53) }), dd('Neighbour Type', [], { src: s(53) }), text('Neighbour Contact', { src: s(53) }),
          text('Neighbour Vintage at Current Address', { key: 'neighbourVintage', src: s(53) }),
          area('Major Observations/Comments/Concerns during PDs', { key: 'pdMajorObservations', src: s(53) }),
        ],
      },
    ],
  };
}

function loanDetailsTractor(v: Variant): SubSpec {
  const s = (n: number | string) => `Manual Fig ${n}`;
  const used = v === 'USED_TRACTOR';
  return {
    key: 'loanDetails', name: 'Loan Details', platform: 'MOBILE', role: 'SALES_OFFICER', src: 'Manual §11, Fig 55–59',
    desc: 'Five tabs: Sourcing / Asset / Loan / Charges / Summary.',
    modules: [
      {
        key: 'sourcing', name: 'Sourcing', src: s(55), fields: [
          ro('Lead Reference No', { src: s(55) }), ro('Product', { key: 'sourcingProduct', src: s(55) }), ro('Channel', { key: 'sourcingChannel', src: s(55) }),
          dd('Vehicle Status', [], { src: s(55) }),
          dd('Scheme', used ? ['Kisan Vahan Used Tractor (Lite)', 'Kisan Vahan Used Tractor (Pro)'] : ['Kisan Vahan New Tractor (Lite)'], { src: used ? 'OPTIM web queue #26/#27 (scheme names)' : 'Manual §1 (scheme of the documented case)', nc: true, notes: 'Scheme values come from the product scheme master; only these names were observed.' }),
          dd('Dealer', [], { src: s(55), notes: 'Dealer master list' }), dd('Dealer Outlet', [], { src: s(55) }), dd('Disbursement Branch', [], { src: s(55) }),
        ],
      },
      {
        key: 'asset', name: 'Asset', src: s(56), nc: used,
        desc: used ? 'Used Tractor asset fields are not documented separately in the manual — confirm (e.g. registration / valuation details).' : undefined,
        fields: [
          dd('Manufacturer', [], { src: s(56) }), dd('Model', [], { src: s(56) }), dec('HP', { key: 'assetHp', src: s(56) }), dd('Variant', [], { src: s(56) }),
          date('Date of Delivery', { src: s(56), help: 'DD-MM-YYYY' }), text('Engine Number', { src: s(56) }), text('Chassis Number', { src: s(56) }),
          dec('Hour Meter Reading', { src: s(56), min: 0 }),
        ],
      },
      {
        key: 'loan', name: 'Loan', src: s(57), fields: [
          cur('Bank Price', { src: s(57) }), cur('Dealer Proforma Invoice Amount', { src: s(57) }), cur('Total Asset Cost', { src: s(57), nc: true, notes: 'Whether this is entered or calculated is not stated.' }),
          cur('Applied Loan Amount', { src: s(57), help: 'Capped by the scheme LTV% (LTV/Max hint shown on screen).', nc: true, notes: 'LTV % is scheme policy — not stated in the manual.' }),
          calc('Margin Money', 'totalAssetCost - appliedLoanAmount', { src: s(57), nc: true, notes: 'Formula proven on the Two Wheeler screen (OPTIM #38: 1,57,700 − 1,00,000 = 57,700); confirm for Tractor.' }),
          dd('PSL Detail', [], { src: s(57) }),
          dec('Offered ROI', { src: s(57), min: 9.45, max: 15.75, help: 'Bounded by bank policy ROI Min/Max; policy MLR shown on screen.', nc: true, notes: 'Bounds 9.45%–15.75% are the example shown in the manual for the documented scheme — policy-driven, confirm per scheme.' }),
          dd('Repayment Frequency', REPAY_FREQ, { src: 'Manual Fig 57; values from OPTIM #145', notes: 'OPTIM spells "Quaterly".' }),
          int('Tenure', { key: 'loanTenure', src: s(57), help: 'Months', min: 1 }),
        ],
      },
      {
        key: 'charges', name: 'Charges', src: s(58), fields: [
          dd('Funded/Non Funded', FUNDED, { key: 'pfFundedNonFunded', src: 'Manual Fig 58; values OPTIM #40' }), ro('PF % As Per Policy', { key: 'pfPercentAsPerPolicy', src: s(58) }),
          ro('PF Amount', { src: s(58) }), cur('Offered Processing Fee', { src: s(58) }), ro('Total Processing Fee Including GST', { key: 'totalProcessingFeeInclGst', src: s(58) }),
          dd('CLI', [], { key: 'cli', src: s(58) }), cur('CLI Coverage Amount', { src: s(58) }), ro('Actual Premium', { src: s(58) }), ro('CLI Premium', { src: s(58) }),
          int('Tenure', { key: 'cliTenure', src: s(58), help: 'CLI tenure (months)' }),
        ],
      },
      {
        key: 'summary', name: 'Summary', src: s(59), fields: [
          ro('Dealer Proforma Amount', { src: s(59) }), ro('Min/Max Finance Amount', { key: 'minMaxFinanceAmount', src: s(59) }), ro('Agri Income', { src: s(59) }),
          ro('Bureau Obligation', { src: s(59) }), ro('Document Income', { key: 'summaryDocumentIncome', src: s(59) }), ro('Additional Obligation', { src: s(59) }),
          ro('Allied Income', { key: 'summaryAlliedIncome', src: s(59) }), ro('Proposed Tractor Income', { src: s(59) }), ro('Annual Income', { src: s(59) }),
          ro('Annual Obligation', { src: s(59) }), ro('Total Finance Amount', { src: s(59) }), ro('LTV% Total Cost', { key: 'ltvTotalCost', src: s(59) }),
          ro('LTV% On Road Price', { key: 'ltvOnRoadPrice', src: s(59) }), ro('Actual Bank Policy MLR', { src: s(59) }), ro('Processing Fee', { key: 'summaryProcessingFee', src: s(59) }),
          ro('CLI', { key: 'summaryCli', src: s(59) }), ro('Total Funded Charges', { src: s(59) }), ro('Total Non-Funded Charges', { src: s(59) }), ro('Total Charges', { src: s(59) }),
          ro('Emi Amount', { key: 'emiAmount', src: s(59), help: 'Computed on demand via the calculator icon.' }),
        ],
      },
    ],
  };
}

function loanDetailsTW(): SubSpec {
  const o = (n: string) => `OPTIM #${n}`;
  return {
    key: 'loanDetails', name: 'Loan Details', platform: 'MOBILE', role: 'SALES_OFFICER', src: 'OPTIM #33–#45',
    desc: 'Five tabs: Sourcing / Asset / Loan / Charges / Summary.',
    modules: [
      {
        key: 'sourcing', name: 'Sourcing', src: o('33–34'), fields: [
          ro('Lead Reference No', { src: o('33') }), ro('Product', { key: 'sourcingProduct', src: o('33') }), ro('Channel', { key: 'sourcingChannel', src: o('33') }),
          dd('Scheme', ['TW-NIP'], { src: o('34'), nc: true, notes: 'Only TW-NIP observed; values come from the product scheme master.' }),
          dd('Dealer', [], { src: o('34'), notes: 'Dealer master list (e.g. SHRI SHAM AUTO MOTORS observed)' }), dd('Dealer Outlet', [], { src: o('34') }),
          dd('Disbursement Branch', [], { src: o('34'), notes: 'e.g. PROHORIZON BANK observed' }),
        ],
      },
      {
        key: 'asset', name: 'Asset — Make And Model', src: o('35'), fields: [
          dd('Manufacturer', [], { src: o('35'), notes: 'e.g. BAJAJ observed (master list)' }), dd('Model', [], { src: o('35'), notes: 'e.g. Freedom 125 Drum NG04 observed (master list)' }),
          ro('Variant', { src: o('35'), help: 'Derived from the selected model (e.g. Plus).' }), dd('Fuel Type', ['Petrol'], { src: o('35'), nc: true, notes: 'Only "Petrol" observed.' }),
        ],
      },
      {
        key: 'loan', name: 'Loan', src: o('36–38'), fields: [
          ro('Scheme', { key: 'loanScheme', src: o('36') }),
          cur('Asset Cost', { src: o('36') }), cur('Discount', { src: o('36') }),
          calc('Ex Show Room Price', 'assetCost - discount', { src: o('36'), notes: 'Proven by screen values: 1,50,000 − 1,000 = 1,49,000.' }),
          cur('Road Tax', { src: o('36') }), cur('Insurance Amount', { src: o('36') }), cur('Registration Charges', { src: o('37') }), cur('Other Charges', { src: o('37') }),
          calc('On Road Price', 'exShowRoomPrice + roadTax + insuranceAmount + registrationCharges + otherCharges', { src: o('37'), notes: 'Proven: 1,49,000 + 2,500 + 2,000 + 1,000 + 200 = 1,54,700.' }),
          cur('Accessories Cost', { src: o('37') }), cur('Extended Warranty Charges', { src: o('37') }),
          calc('Total Asset Cost', 'onRoadPrice + accessoriesCost + extendedWarrantyCharges', { src: o('37'), notes: 'Proven: 1,54,700 + 1,000 + 2,000 = 1,57,700.' }),
          cur('Applied Loan Amount', { src: o('38') }),
          calc('Margin Money', 'totalAssetCost - appliedLoanAmount', { src: o('38'), notes: 'Proven: 1,57,700 − 1,00,000 = 57,700.' }),
          int('Tenure', { key: 'loanTenure', src: o('38'), help: 'Months (dropdown in OPTIM, e.g. 36)', min: 1 }),
          dec('Offered ROI', { src: o('38'), min: 12.25, max: 25, help: 'Shows ACTUAL BANK POLICY MLR (16.00%) with MIN/MAX bounds.', nc: true, notes: 'MIN 12.25% / MAX 25.00% observed for scheme TW-NIP — policy-driven, confirm.' }),
        ],
      },
      {
        key: 'charges', name: 'Charges', src: o('39–42'), fields: [
          ro('Applied Loan Amount', { key: 'chargesAppliedLoanAmount', src: o('39') }), ro('Document Charges', { src: o('39') }),
          ro('PF % As Per Policy', { key: 'pfPercentAsPerPolicy', src: o('39'), help: 'e.g. 2%' }), ro('PF Amount', { src: o('39') }),
          dd('Funded / Non Funded', FUNDED, { key: 'pfFundedNonFunded', src: o('40') }), cur('Offered Processing Fee', { src: o('40') }),
          calc('Total Processing Fee (Included GST)', 'offeredProcessingFee * 1.18', { key: 'totalProcessingFeeInclGst', src: o('41'), nc: true, notes: 'Proven by values 2,000→2,360, 1,000→1,180, 1,800→2,124 (18% GST). GST rate is tax policy — confirm.' }),
          dd('CLI', ['Taken'], { key: 'cli', src: o('41'), nc: true, notes: 'Only "Taken" observed.' }),
          cur('CLI Coverage Amount', { src: o('41'), help: 'Max shown on screen (e.g. Max 1,00,000).' }), int('Tenure', { key: 'cliTenure', src: o('41') }),
          dd('Funded / Non Funded', FUNDED, { key: 'cliFundedNonFunded', src: o('41') }), ro('Actual Premium', { src: o('41') }), ro('CLI Premium', { src: o('42') }),
          dd('Hospi Taken', ['Taken'], { src: o('42'), nc: true, notes: 'Only "Taken" observed.' }), dd('Funded / Non Funded', FUNDED, { key: 'hospiFundedNonFunded', src: o('42') }),
          int('Tenure', { key: 'hospiTenure', src: o('42') }), ro('Hospi Premium', { src: o('42') }),
        ],
      },
      {
        key: 'summary', name: 'Deal Summary', src: o('43–44'), fields: [
          ro('Tenure', { key: 'summaryTenure', src: o('43') }), ro('LTV% Total Cost', { key: 'ltvTotalCost', src: o('43') }), ro('LTV% On Road Price', { key: 'ltvOnRoadPrice', src: o('43') }),
          ro('Actual Bank Policy MLR', { src: o('43') }), ro('Offered ROI', { key: 'summaryOfferedRoi', src: o('43') }),
          ro('Processing Fee', { key: 'summaryProcessingFee', src: o('43') }), ro('CLI', { key: 'summaryCli', src: o('43') }), ro('Hospi Premium', { key: 'summaryHospiPremium', src: o('43') }),
          ro('Document Charges', { key: 'summaryDocumentCharges', src: o('43') }), ro('Total Funded Charges', { src: o('43') }), ro('Total Non Funded Charges', { src: o('43') }),
          ro('Total Charges', { src: o('43') }), ro('Emi Amount', { key: 'emiAmount', src: o('44'), help: 'Computed via the calculator icon.' }),
        ],
      },
    ],
  };
}

function scoreCardTW(): SubSpec {
  return {
    key: 'scoreCard', name: 'Score Card', platform: 'MOBILE', role: 'SALES_OFFICER', src: 'OPTIM #46–#49',
    desc: 'Tabs: Score Card / Profile. Score-card questions and answer types are configurable here; only the "Score Type" selector was visible in the source.',
    modules: [
      { key: 'scoreCard', name: 'Score Card', src: 'OPTIM #46', nc: true, fields: [dd('Score Type', [], { src: 'OPTIM #46', notes: 'Values not visible; score-card questions not captured in the screenshots.' })] },
      ...customerProfileModules('OPTIM #47–#49', true),
    ],
  };
}

function documentUpload(v: Variant): SubSpec {
  return {
    key: 'documentUpload', name: 'Document Upload', platform: 'MOBILE', role: 'SALES_OFFICER',
    src: isTractor(v) ? 'Manual §12, Fig 61' : 'OPTIM #51–#54',
    desc: 'Required documents are configured under Document Configuration; additional documents may be chosen from the Document Master.',
    fields: [dd('Select Additional Document', ADDITIONAL_DOCS, { src: 'OPTIM #52', nc: true, notes: ADDITIONAL_DOC_NOTE })],
  };
}

function applicationForm(v: Variant): SubSpec {
  const t = isTractor(v);
  const s = (m: string, o: string) => (t ? `Manual Fig ${m}` : `OPTIM #${o}`);
  const notSame = [neq('sameAsCurrentAddress', true)];
  const officeVis = t ? [eq('isOfficeDetails', 'Yes')] : undefined;
  const officeFields: FieldSpec[] = [
    ...(t ? [yn('Is Office Details', { key: 'isOfficeDetails', src: s('64', '62') })] : []),
    dd('Udhyam Certificate', YES_NO, { src: s('64', '62'), vis: officeVis }),
    text('Office Name', { src: s('64', '62'), vis: officeVis }),
    text('Designation', { src: s('64', '62'), vis: officeVis }),
    ...(t ? [] : [check('Same As Current Address', { key: 'officeSameAsCurrent', src: 'OPTIM #62' }), check('Same As Current Permanent', { key: 'officeSameAsPermanent', src: 'OPTIM #62' })]),
    ...addressBlock('office', 'Office ', s('64', '62–63')).map((f) => ({ ...f, vis: officeVis })),
    text('Office Mobile Number', { src: s('64', '63'), vis: officeVis }),
  ];
  const refBlock = (n: number): FieldSpec[] => [
    text(`Reference ${n} — Name`, { key: `ref${n}Name`, src: s('65', '64–65') }),
    dd(`Reference ${n} — Relationship`, ['Brother'], { key: `ref${n}Relationship`, src: s('65', '64'), nc: true, notes: 'Only "Brother" observed.' }),
    text(`Reference ${n} — Mobile Number`, { key: `ref${n}Mobile`, src: s('65', '65') }),
    ...addressBlock(`ref${n}`, `Reference ${n} — `, s('65', '64–65')),
  ];
  return {
    key: 'applicationForm', name: 'Application Form', platform: 'MOBILE', role: 'SALES_OFFICER', src: t ? 'Manual §13, Fig 62–66' : 'OPTIM #56–#66',
    desc: 'Four tabs: Personal / Address / Office / Reference. Submission locks the journey up to Application Form (Manual §13.1).',
    modules: [
      {
        key: 'personal', name: 'Personal Details', src: s('62', '56–57'), fields: [
          ro('Name', { key: 'afName', src: s('62', '56') }), ro('DOB', { key: 'afDob', src: s('62', '56') }), ro('Father Name', { key: 'afFatherName', src: s('62', '56') }),
          ro('Mobile Number', { key: 'afMobileNumber', src: s('62', '56') }),
          text('Mother / Maiden Name', { key: 'motherMaidenName', src: s('62', '57') }), text('Email Id', { key: 'emailId', src: s('62', '57') }),
          dd('Religion', ['Hindu'], { src: s('62', '57'), nc: true, notes: 'Only "Hindu" observed.' }), dd('Cast', ['General'], { key: 'cast', src: s('62', '57'), nc: true, notes: 'Label spelled "Cast" on screen. Only "General" observed.' }),
          dd('Nationality / Citizenship', ['Indian Resident'], { key: 'nationality', src: s('62', '57'), nc: true, notes: 'Only "Indian Resident" observed.' }),
          int('No Of Dependents', { key: 'noOfDependents', src: s('62', '57'), min: 0 }),
        ],
      },
      {
        key: 'address', name: 'Address Details', src: s('63', '58–61'), fields: [
          ro('Current Address', { key: 'afCurrentAddress', src: s('63', '58'), help: 'Pre-filled from KYC.' }),
          int('Current Address — Years', { key: 'currentAddressYears', src: s('63', '58'), min: 0 }), int('Current Address — Months', { key: 'currentAddressMonths', src: s('63', '58'), min: 0, max: 11 }),
          int('Current City — Years', { key: 'currentCityYears', src: s('63', '58'), min: 0 }), int('Current City — Months', { key: 'currentCityMonths', src: s('63', '58'), min: 0, max: 11 }),
          check('Same As Current Address', { key: 'sameAsCurrentAddress', src: s('63', '59'), help: 'When ticked, the Permanent Address fields are hidden.' }),
          ...addressBlock('perm', 'Permanent ', s('63', '60–61')).map((f) => ({ ...f, vis: notSame })),
          ...(t ? [] : [
            dd('Accommodation', ['Living With Family'], { key: 'afAccommodation', src: 'OPTIM #61', nc: true, notes: 'Only "Living With Family" observed.' }),
            dd('Residence', ['Bungalow', 'Flat'], { key: 'afResidence', src: 'OPTIM #61, #143', nc: true, notes: 'Only these values observed.' }),
          ]),
        ],
      },
      { key: 'office', name: 'Office Details', src: s('64', '62–63'), fields: officeFields },
      { key: 'reference', name: 'Reference Details', src: s('65', '64–65'), fields: [...refBlock(1), ...refBlock(2)] },
    ],
  };
}

// ─────────────────────────── Back-office stages (web) ───────────────────────────

function dueDiligence(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §14, Fig 68–79' : 'OPTIM #68–#81';
  return {
    key: 'documentValidation', name: 'Due Diligence — Document Validation', platform: 'WEB', role: 'DUE_DILIGENCE', src,
    desc: 'Each KYC document is validated through a Yes/No questionnaire, then given a status. Image Distorted routes a Document Request to the SO (Loop 1); Compliance Reject requires a fresh lead.',
    modules: [
      {
        key: 'aadhaarQuestionnaire', name: 'Aadhaar Card — Validate', src, fields: [
          yn("Is customer's name matched with Aadhaar?", { key: 'aadhaarNameMatched', req: 'M', src }), yn("Is customer's DOB matched?", { key: 'aadhaarDobMatched', req: 'M', src }),
          yn('Is Aadhaar number masked?', { key: 'aadhaarMasked', req: 'M', src }), yn('Is the image clear and readable?', { key: 'aadhaarImageClear', req: 'M', src }),
          yn('Does the photograph match the applicant?', { key: 'aadhaarPhotoMatch', req: 'M', src }),
        ],
      },
      {
        key: 'livePhotoQuestionnaire', name: 'Live Photo — Validate', src: 'OPTIM DD questionnaire', fields: [
          yn("Is customer's live photo cleared?", { key: 'livePhotoCleared', src: 'OPTIM DD questionnaire' }), yn('Does live photo match the customer?', { key: 'livePhotoMatch', src: 'OPTIM DD questionnaire' }),
        ],
      },
      {
        key: 'panQuestionnaire', name: 'PAN Card — Validate', src: 'OPTIM DD questionnaire', fields: [
          yn("Is customer's name matched with PAN?", { key: 'panNameMatched', src: 'OPTIM DD questionnaire' }), yn("Is customer's DOB matched with PAN?", { key: 'panDobMatched', src: 'OPTIM DD questionnaire' }),
          yn('Is the PAN number valid and visible?', { key: 'panValidVisible', src: 'OPTIM DD questionnaire' }), yn('Is the image clear?', { key: 'panImageClear', src: 'OPTIM DD questionnaire' }),
          yn('Is the PAN format valid (5 letters + 4 digits + 1 letter)?', { key: 'panFormatValid', src: 'OPTIM DD questionnaire' }),
          yn('Is the PAN verified via NSDL/ITD?', { key: 'panVerifiedNsdl', src: 'OPTIM DD questionnaire' }),
        ],
      },
      {
        key: 'validationOutcome', name: 'Validation Outcome (per document)', src, fields: [
          dd('Status', ['Verified', 'Image Distorted', 'Compliance Reject'], { key: 'documentStatus', req: 'M', src: isTractor(v) ? 'Manual Fig 71' : 'OPTIM #70–#72' }),
          area('Remarks', { key: 'validationRemarks', req: 'M', maxLen: 200, src, notes: '200-character limit shown on OPTIM remark boxes.' }),
          check('Archive this image!', { key: 'archiveImage', src }),
        ],
      },
      { key: 'finalSummary', name: 'Final Due Diligence Task Summary', src, fields: [area('Remark', { key: 'ddFinalRemark', req: 'M', maxLen: 200, src })] },
    ],
  };
}

function camPreparation(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §15, Fig 80–104' : 'OPTIM #89–#109';
  return {
    key: 'camPreparation', name: 'CAM Preparation', platform: 'WEB', role: 'CAM_USER', src,
    desc: 'Credit Appraisal Memo workspace. Toolbar actions (Request/Upload Additional Document, Modify, CAM Hold, Query, Prepare/Reject CAM, Initiate FI/TVR) are workflow actions.',
    modules: [
      {
        key: 'statusStrip', name: 'Status Strip', src, fields: [
          ro('Due Diligence', { key: 'ddStatus', src }), ro('TVR Status', { key: 'tvrStatusBadge', src }), ro('FI Status', { key: 'fiStatusBadge', src }),
          ro('RCU Status', { key: 'rcuStatusBadge', src }), ro('Income Validate', { key: 'incomeValidateStatus', src }), ro('Deviations', { key: 'deviationsStatus', src }),
          ro('Case Status', { key: 'caseStatus', src }),
        ],
      },
      {
        key: 'specialConditions', name: 'Special Conditions', repeatable: true, src: isTractor(v) ? 'Manual Fig 100' : 'OPTIM CAM', fields: [
          dd('Condition Type', ['Pre-Disbursement', 'Post-Disbursement'], { src: 'Manual Fig 100' }), area('Special Condition', { key: 'specialConditionText', src }),
        ],
      },
      { key: 'riskMitigants', name: 'Risk & Mitigants', repeatable: true, src, fields: [area('Risk', { src }), area('Mitigants', { src })] },
      {
        key: 'exposure', name: 'Exposure', src, fields: [
          cur('Existing Loans', { key: 'exposureExistingLoans', src }), cur('Current POS', { key: 'exposureCurrentPos', src }), cur('Proposed Loan', { key: 'exposureProposedLoan', src }),
          cur('Total Exp', { key: 'exposureTotal', src }), cur('Peak Exp', { key: 'exposurePeak', src }),
        ],
      },
      {
        key: 'deviations', name: 'Deviations', src: isTractor(v) ? 'Manual Fig 102–103' : 'OPTIM #105–#107', fields: [
          check('No Deviation', { key: 'noDeviation', src, help: 'Ticking adds a NODEVIATION row (Approving Authority: Credit - L1) and clears the deviation gate.' }),
          dd('Deviation Code', [], { key: 'addDeviationCode', src, notes: 'Deviation master (code / description / approving authority) observed in OPTIM: e.g. AGE, CAUTION FI, CIBIL, CIBILSMA2, CIBIL Score<650, DOCNORM, EMI, IDV_5, IDV_10, WAIVER, WRITE OFF — authority mapping needs confirmation.', vis: [neq('noDeviation', true)] }),
        ],
      },
      {
        key: 'additionalDocument', name: 'Request Additional Document', src: 'Manual Fig 85; OPTIM #110–#111', fields: [
          ro('Document Type', { key: 'additionalDocumentType', src: 'Manual Fig 85', help: 'Fixed: Additional Document' }),
          dd('Document Master', ADDITIONAL_DOCS, { key: 'additionalDocumentMaster', req: 'M', src: 'Manual Fig 85', nc: true, notes: ADDITIONAL_DOC_NOTE }),
          area('Remarks', { key: 'additionalDocumentRemarks', req: 'M', src: 'Manual Fig 85' }),
        ],
      },
    ],
  };
}

function incomeValidation(v: Variant): SubSpec {
  if (v === 'TW') {
    const src = 'OPTIM #96–#103';
    return {
      key: 'incomeValidation', name: 'Income Validation', platform: 'WEB', role: 'CAM_USER', src,
      desc: 'Two Wheeler: tabs Income / Banking.',
      modules: [
        {
          key: 'monthlyIncome', name: 'Monthly Income', repeatable: true, src, fields: [
            ro('Member Type', { src }), ro('Member Name', { key: 'incomeMemberName', src }), cur('Primary Income', { src }), cur('Alternate Income', { src }),
            ro('Loan to Income by SO', { src }), cur('Validated Income', { src }),
          ],
        },
        {
          key: 'obligations', name: 'Obligation', src, fields: [
            cur('Bureau', { key: 'obligationBureau', src }), cur('Current Loan', { key: 'obligationCurrentLoan', src }), cur('Monthly Credit Card', { key: 'obligationCreditCard', src }),
            cur('Miscellaneous', { key: 'obligationMisc', src }), cur('Rent', { key: 'obligationRent', src }), cur('Additional', { key: 'obligationAdditional', src }),
            cur('Excluded', { key: 'obligationExcluded', src }), ro('FOIR', { src }),
          ],
        },
        {
          key: 'assetLiability', name: 'Asset vs Liability / Net Worth', src, fields: [
            ro('Asset Declared (SO)', { key: 'assetDeclaredSo', src }), cur('Term Loan Liability', { src }), cur('Credit Card Liability', { src }),
            cur('Gold / OD / Other Liability', { key: 'otherLiability', src }), cur('Additional Liability', { src }), ro('Net Worth', { src }),
          ],
        },
        ...bankingModules(src),
      ],
    };
  }
  const s = (n: number | string) => `Manual Fig ${n}`;
  return {
    key: 'incomeValidation', name: 'Income Validation', platform: 'WEB', role: 'CAM_USER', src: 'Manual §15.1, Fig 92–101',
    desc: 'Five tabs: Income Assessment (Declared / Validated), PD, Bureau Obligations, Income, Banking. Submitting the Income tab flips Income Validate to VALIDATED.',
    modules: [
      {
        key: 'incomeAssessment', name: 'Income Assessment', src: s('92–96'), fields: [
          radio('View', ['Declared', 'Validated'], { key: 'incomeAssessmentView', src: s('92') }),
          ro('Category of Farmer', { src: s(92) }), ro('Distance of Branch to Residence', { key: 'ivDistanceBranch', src: s(92) }), ro('Source of Irrigation', { key: 'ivSourceOfIrrigation', src: s(92) }),
          ro('Purpose', { key: 'ivPurpose', src: s(92) }), ro('Agri Experience', { key: 'ivAgriExperience', src: s(92) }), ro('FI Status', { key: 'ivFiStatus', src: s(92) }),
          ro('Land Extent', { src: s(92) }), ro('PSL Status', { key: 'ivPslStatus', src: s(96), help: 'e.g. PSL AGRI' }),
          dec('Validate Tractor HP', { src: s(95) }), int('Validate Tractor Age', { src: s(95) }), cur('Validate Tractor Income', { src: s(95) }),
          int('Validate Count — Harvester', { key: 'validateHarvesterCount', src: s(94) }), cur('Validate Income — Harvester', { key: 'validateHarvesterIncome', src: s(94) }),
          int('Validate Count — Excavation/JCB', { key: 'validateJcbCount', src: s(94) }), cur('Validate Income — Excavation/JCB', { key: 'validateJcbIncome', src: s(94) }),
        ],
      },
      {
        key: 'bureauObligations', name: 'Bureau Obligations', repeatable: true, src: s(98), fields: [
          text('Nature of Loan', { key: 'boNatureOfLoan', src: s(98) }), text('Institution', { key: 'boInstitution', src: s(98) }), cur('Loan Amount', { key: 'boLoanAmount', src: s(98) }),
          cur('Outstanding Balance', { key: 'boOutstanding', src: s(98) }), cur('EMI', { key: 'boEmi', src: s(98) }), text('Track Record', { key: 'boTrackRecord', src: s(98) }),
          date('Disbursed Date', { key: 'boDisbursedDate', src: s(98) }), text('Repayment', { key: 'boRepayment', src: s(98) }), ro('Added By', { key: 'boAddedBy', src: s(98) }),
          cur('Annual Obligation', { key: 'boAnnualObligation', src: s(98) }), yn('Include in Calculation', { key: 'boInclude', src: s(98), help: 'Exclude/Include toggle' }),
        ],
      },
      {
        key: 'income', name: 'Income', src: s(99), fields: [
          ro('Agri Income', { key: 'ivAgriIncome', src: s(99) }), ro('Allied Income', { key: 'ivAlliedIncome', src: s(99) }), ro('Proposed Income', { key: 'ivProposedIncome', src: s(99) }),
          ro('Document Income', { key: 'ivDocumentIncome', src: s(99) }), ro('Total Income', { key: 'ivTotalIncome', src: s(99) }),
          cur('Enter Annual Income', { key: 'enterAnnualIncome', src: s(99) }), dd('Sector', [], { key: 'ivSector', src: s(99) }), dd('Sub Sector', [], { key: 'ivSubSector', src: s(99) }),
          ro('NFCF:AI', { key: 'nfcfRatio', src: s(99) }),
        ],
      },
      ...bankingModules(s(101)),
    ],
  };
}

function bankingModules(src: string): ModuleSpec[] {
  return [
    { key: 'bankingAccount', name: 'Banking — Account', repeatable: true, src, fields: [dd('Member', [], { key: 'bankingMember', src }), text('IFSC', { key: 'bankingIfsc', src }), text('Account No', { key: 'bankingAccountNo', src, sensitive: true, mask: 'MASK_ALL_BUT_LAST_4' })] },
    {
      key: 'bankingBalances', name: 'Banking — Monthly Balances (6 months)', repeatable: true, src, fields: [
        text('Month', { key: 'balanceMonth', src }), cur('Balance on 10th', { key: 'balance10', src }), cur('Balance on 20th', { key: 'balance20', src }), cur('Balance on 30th', { key: 'balance30', src }),
        calc('Average', '(balance10 + balance20 + balance30) / 3', { key: 'balanceAverage', src, notes: 'Average of the three tri-monthly readings (Average column on screen).' }),
      ],
    },
    { key: 'bankingSummary', name: 'Banking — Summary', src, fields: [ro('Overall Average Monthly Balance Complied', { key: 'overallAmbComplied', src })] },
  ];
}

function rcu(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §16.1' : 'OPTIM #159–#162';
  return {
    key: 'rcu', name: 'RCU', platform: 'WEB', role: 'RCU_USER', src, nc: isTractor(v),
    desc: isTractor(v) ? 'Validates scheme-related documents in parallel with CAM. RCU screens are not captured in the Tractor manual — RCU fields below are from the OPTIM web screens; confirm for Tractor.' : 'Validates scheme documents in parallel with CAM; self-validate or assign to agency.',
    modules: [
      {
        key: 'rcuDocument', name: 'RCU — Document Evaluation', repeatable: true, src: 'OPTIM #160–#161', fields: [
          dd('RCU Status', ['Pending', 'Sample', 'Screening', 'RCU Hold', 'Negative', 'Fraud'], { src: 'OPTIM #160 legend' }), area('RCU Remarks', { src: 'OPTIM #161' }),
          dd('Evaluation Status', ['Positive', 'Negative'], { src: 'OPTIM #161', nc: true, notes: 'Only these two values observed.' }), area('Evaluation Remarks', { src: 'OPTIM #161' }),
          dd('Assign To', ['Self', 'Agency'], { key: 'rcuAssignTo', src: 'OPTIM #160 (Self Assign / Assign to agency)' }),
        ],
      },
      { key: 'rcuFinal', name: 'Final RCU Task Summary', src: 'OPTIM #162', fields: [area('Remark', { key: 'rcuFinalRemark', req: 'M', maxLen: 200, src: 'OPTIM #162' })] },
    ],
  };
}

function fi(v: Variant): SubSpec {
  const t = isTractor(v);
  const src = t ? 'Manual §16.2, Fig 90, 110–111' : 'OPTIM #112–#118, #148–#154';
  const q = t
    ? [
        yn('Q1. Applicant Available', { key: 'fiQ1ApplicantAvailable', src }), yn('Q2. Address Located Easily', { key: 'fiQ2AddressLocated', src }),
        yn('Q3. Residing at Address', { key: 'fiQ3Residing', src }), dd('Q4. Residence Type', [], { key: 'fiQ4ResidenceType', src }),
        dd('Q5. Residence Condition', [], { key: 'fiQ5ResidenceCondition', src }), yn('Q6. Landmark Matched', { key: 'fiQ6LandmarkMatched', src }),
        yn('Q7. Family Present', { key: 'fiQ7FamilyPresent', src }), area('Q8. FI Remarks', { key: 'fiQ8Remarks', src: 'Manual Fig 111' }),
      ]
    : [
        yn('Was the office/business address verified?', { key: 'fiQOfficeVerified', src: 'OPTIM #151', nc: true, notes: 'Questionnaire has 10 questions; only Q1 and Q7–Q10 were readable.' }),
        dd('Occupancy status observed', ['Self Occupied'], { key: 'fiQOccupancy', src: 'OPTIM #153', nc: true }),
        dd('Overall environment observed', ['Satisfactory'], { key: 'fiQEnvironment', src: 'OPTIM #153', nc: true }),
        yn('Any adverse findings during the FI visit?', { key: 'fiQAdverseFindings', src: 'OPTIM #153' }),
        text('Is branch sign and stamp present?', { key: 'fiQBranchStamp', src: 'OPTIM #153' }),
      ];
  return {
    key: 'fi', name: 'FI — Field Investigation', platform: 'WEB / AGENCY', role: 'FI_USER', src,
    desc: 'Initiated from CAM (Self-handle / Waived Off / Assign to Agency per address). A Negative result automatically generates a deviation.',
    modules: [
      {
        key: 'fiInitiation', name: 'Initiate FI', repeatable: true, src: t ? 'Manual Fig 90' : 'OPTIM #112–#113', fields: [
          dd('Address Type', ['Current Address', 'Permanent Address', 'Office Address'], { key: 'fiAddressType', src }), ro('Full Address', { key: 'fiFullAddress', src }),
          dd('Action', ['Self-handle', 'Waived Off', 'Assign to Agency'], { key: 'fiInitiationAction', src }), ro('Assigned By', { key: 'fiAssignedBy', src }),
          text('Assigned To', { key: 'fiAssignedTo', src }), text('Remarks', { key: 'fiInitiationRemarks', src, help: 'e.g. "Manual waived off"' }),
        ],
      },
      { key: 'fiQuestionnaire', name: 'FI Questionnaire', src, fields: q },
      {
        key: 'fiOutcome', name: 'Final Status & Remarks', src, fields: [
          dd('Status', t ? ['Positive', 'Negative'] : ['Positive', 'Negative', 'Re-Initiate to same', 'Assign to other agency'], { key: 'fiStatus', req: 'M', src: t ? 'Manual Fig 111, §16.3' : 'OPTIM #153' }),
          file('Upload Document', { key: 'fiUploadDocument', src }), area('Remarks', { key: 'fiRemarks', req: t ? 'O' : 'M', src }),
        ],
      },
    ],
  };
}

function tvr(v: Variant): SubSpec {
  const t = isTractor(v);
  const src = t ? 'Manual §16.2, Fig 89, 112' : 'OPTIM #112';
  return {
    key: 'tvr', name: 'TVR — Telephonic / Residence Verification', platform: 'WEB / AGENCY', role: 'TVR_USER', src, nc: !t,
    desc: t ? 'Initiated from CAM per phone number. A Negative result automatically generates a deviation.' : 'TVR initiation was captured; the TVR questionnaire for Two Wheeler was not readable in the screenshots — questions copied from the Tractor manual need confirmation.',
    modules: [
      {
        key: 'tvrInitiation', name: 'Initiate TVR', repeatable: true, src, fields: [
          dd('Number Type', ['Primary Number', 'Office Number', 'Reference 1', 'Reference 2'], { src }), ro('Phone Number', { key: 'tvrPhoneNumber', src }),
          dd('Action', ['Self TVR', 'Waived Off', 'Assign to Agency'], { key: 'tvrInitiationAction', src }), ro('Assigned By', { key: 'tvrAssignedBy', src }),
          text('Assigned To', { key: 'tvrAssignedTo', src }), text('Remarks', { key: 'tvrInitiationRemarks', src }),
        ],
      },
      {
        key: 'tvrQuestionnaire', name: 'RESI TVR Questionnaire', src: 'Manual Fig 112', nc: !t, fields: [
          yn('Q1. Residing at Address', { key: 'tvrQ1Residing', src: 'Manual Fig 112' }), yn('Q2. Reachable/Contactable', { key: 'tvrQ2Reachable', src: 'Manual Fig 112' }),
          yn('Q3. Residence Type Suitable', { key: 'tvrQ3ResidenceSuitable', src: 'Manual Fig 112' }), yn('Q4. Discrepancies Found', { key: 'tvrQ4Discrepancies', src: 'Manual Fig 112' }),
          yn('Q5. Utilities Verified', { key: 'tvrQ5Utilities', src: 'Manual Fig 112' }), yn('Q6. Current/Permanent Address Verified', { key: 'tvrQ6AddressVerified', src: 'Manual Fig 112' }),
        ],
      },
      { key: 'tvrOutcome', name: 'Status', src, fields: [dd('Status', ['Positive', 'Negative'], { key: 'tvrStatus', req: 'M', src: 'Manual §16.3' }), file('Upload Document', { key: 'tvrUploadDocument', src })] },
    ],
  };
}

function sanctionTerms(src: string, ratioLabel: string): FieldSpec[] {
  return [
    ro('Asset Cost', { key: 'ipAssetCost', src }), ro('Finance Amount', { key: 'ipFinanceAmount', src }), ro('Loan Tenure', { key: 'ipLoanTenure', src }),
    ro('Previous Repayment Frequency', { key: 'ipPreviousRepaymentFrequency', src }),
    cur('Sanction Amount', { key: 'sanctionAmount', req: 'M', src, help: 'Capped by the policy Max Limit shown on screen.' }),
    dd('Repayment Frequency', REPAY_FREQ, { key: 'sanctionRepaymentFrequency', req: 'M', src: 'OPTIM #145', notes: 'OPTIM spells "Quaterly".' }),
    int('Sanction Tenure', { key: 'sanctionTenure', req: 'M', src, help: 'Months (dropdown in OPTIM)', min: 1 }),
    ro(`Live ${ratioLabel}`, { key: 'liveRatios', src, help: 'Sanctioned LTV / ratio / EMI computed live.' }),
    area('Sanction Conditions', { key: 'sanctionConditions', src, help: 'One condition per line (Add / Remove).' }),
  ];
}

function inPrincipleApproval(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §19, Fig 105–109' : 'OPTIM #142–#147';
  return {
    key: 'inPrincipleApproval', name: 'In-Principle Approval', platform: 'WEB', role: 'CREDIT_APPROVER', src,
    fields: [
      ...sanctionTerms(src, isTractor(v) ? 'LTV / NFCF / EMI' : 'LTV / FOIR / EMI'),
      ...(isTractor(v) ? [ro('PSL Status', { key: 'ipPslStatus', src })] : []),
      area('Remark', { key: 'ipRemark', req: 'M', src }),
      area('Add Special Conditions', { key: 'ipSpecialConditions', src }),
    ],
  };
}

function deviation(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §20, Fig 113–117' : 'OPTIM #163–#171';
  return {
    key: 'deviation', name: 'Deviation', platform: 'WEB', role: 'DEVIATION_APPROVER', src,
    desc: isTractor(v)
      ? 'Credit deviations auto-generated when FI or TVR is Negative ("System auto deviations!").'
      : 'Credit deviations auto-generated by the system (observed for TVR, FI and RCU negatives on OPTIM #168).',
    modules: [
      {
        key: 'creditDeviation', name: 'Credit Deviation', repeatable: true, src, fields: [
          ro('Deviation Code', { src, help: isTractor(v) ? 'e.g. NODEVIATION, TVR, FI' : 'e.g. NODEVIATION, TVR, FI, RCU' }), ro('Deviation By', { src }), ro('Deviation', { key: 'deviationDescription', src }),
          ro('LO Remarks', { src }), ro('Auth', { key: 'deviationAuth', src, help: 'Approving authority, e.g. Credit - L1' }), ro('Cur. Status', { key: 'deviationCurrentStatus', src }),
          dd('Update Status', ['Pending', 'Approve', 'Reject'], { key: 'deviationUpdateStatus', req: 'M', src: 'OPTIM #168; Manual Fig 116 (Approve/Reject)' }),
          area('Auth Remarks', { key: 'deviationAuthRemarks', src }), ro('Approved By', { key: 'deviationApprovedBy', src }),
        ],
      },
      { key: 'deviationFinal', name: 'Final Credit Deviation Remarks', src, fields: [area('Remark', { key: 'deviationFinalRemark', req: 'M', src })] },
    ],
  };
}

function creditApproval(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §21, Fig 118–121' : 'OPTIM #172–#178';
  return {
    key: 'creditApproval', name: 'Credit Approval', platform: 'WEB', role: 'CREDIT_APPROVER', src,
    desc: 'Credit Decisioning: final sanction, repayer and repayment account, then Credit Approve or Loan Decline.',
    modules: [
      {
        key: 'inPrincipleSummary', name: 'In-Principle Approval Details', src, fields: [
          ro('In-Principle Sanction Amount / Tenure', { src }), ro('In-Principle Sanction On Asset', { src }), ro('In-Principle Remark', { src }), ro('In-Principle Sanction Conditions', { src }),
        ],
      },
      {
        key: 'creditDecisioning', name: 'Credit Decisioning', src, fields: [
          ...sanctionTerms(src, isTractor(v) ? 'LTV / NFCF / EMI' : 'LTV / FOIR / EMI'),
          dd('Repayer', [], { src, help: 'e.g. applicant name (Applicant)' }), dd('Repayer Bank Account', [], { src, help: 'System verifies the account; error "Unable to verify bank account. Please try again." on failure.' }),
          dd('Registration In Favor Of', [], { src }), dd('Add Special Conditions', [], { key: 'creditSpecialConditions', src }),
        ],
      },
      {
        key: 'decision', name: 'Decision', src, fields: [
          area('Credit Approval Remark', { key: 'creditApprovalRemark', src, reqWhen: [eq('creditDecision', 'Credit Approve')] }),
          area('Loan Declined Remark', { key: 'loanDeclinedRemark', src, reqWhen: [eq('creditDecision', 'Loan Decline')] }),
          radio('Decision', ['Credit Approve', 'Loan Decline'], { key: 'creditDecision', src, help: 'Represents the Credit Approve / Loan Decline buttons for preview purposes.' }),
        ],
      },
    ],
  };
}

function relook(): SubSpec {
  return {
    key: 'relook', name: 'Relook', platform: 'WEB', role: 'RELOOK_USER', src: 'Manual §37.1', nc: true,
    desc: 'Declined cases (Deviation reject / Loan Decline) enter the Relook Queue. Relook screens were not captured in the source.',
    fields: [area('Relook Remarks', { src: 'Manual §37.1', nc: true })],
  };
}

// ─────────────────────────── Post-sanction (mobile) ───────────────────────────

function repayment(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §22, Fig 123' : 'OPTIM #181–#183';
  return {
    key: 'repayment', name: 'Repayment Details', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    desc: 'Bank account verified via IFSC lookup and Penny Drop before use.',
    fields: [
      dd('Re-Payment Account', ['Applicant'], { src, nc: true, notes: 'Only "Applicant" observed (member list).' }), ro('Customer Name', { key: 'repaymentCustomerName', src }),
      text('IFSC Code', { key: 'repaymentIfsc', src }), ro('Bank Name', { key: 'repaymentBankName', src, map: 'IFSC lookup' }), ro('Branch Name', { key: 'repaymentBranchName', src, map: 'IFSC lookup' }),
      ro('Address', { key: 'repaymentBankAddress', src, map: 'IFSC lookup' }), text('Account Number', { key: 'repaymentAccountNumber', src, sensitive: true, mask: 'MASK_ALL_BUT_LAST_4' }),
    ],
  };
}

function dealStructure(v: Variant): SubSpec {
  const t = isTractor(v);
  const src = t ? 'Manual §23, Fig 124–128' : 'OPTIM #185–#190';
  const roiBounds = t ? { min: 9.45, max: 15.75 } : { min: 12.25, max: 25 };
  return {
    key: 'dealStructure', name: 'Deal Structure', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    desc: 'Final loan structure within sanctioned limits. A discount on PF / CLI / ROI or a CLI tenure difference (with Justification) generates a Business deviation.',
    modules: [
      {
        key: 'sanctionedTerms', name: 'Sanctioned Terms', src, fields: [
          ro('Sanction On Asset', { src }), ro('Sanction Tenure', { key: 'dsSanctionTenure', src }), ro('Funded Charges', { key: 'dsFundedCharges', src }), ro('Total Charges', { key: 'dsTotalCharges', src }),
          ro('Total Sanction Amount', { src }), ro('Scheme', { key: 'dsScheme', src }), ro('Actual Bank Policy MLR', { key: 'dsMlr', src }), ro('Applied ROI', { key: 'dsAppliedRoi', src }),
          ro('Repayment Frequency', { key: 'dsRepaymentFrequency', src }), ...(t ? [] : [ro('Document Charges', { key: 'dsDocumentCharges', src })]),
          cur('Loan Availed', { src, help: 'Capped at the sanctioned maximum (Max shown on screen).' }),
        ],
      },
      {
        key: 'charges', name: 'Charges', src, fields: [
          ...(t ? [] : [dd('Document Charges — Funded / Non Funded', FUNDED, { key: 'dsDocChargesFunded', src })]),
          dd('Funded / Non Funded', FUNDED, { key: 'dsPfFunded', src }), cur('Offered Processing Fee', { key: 'dsOfferedProcessingFee', src, help: 'Policy amount shown on screen.' }),
          ro('Total Offered Processing Fee (Incl. GST)', { key: 'dsTotalPfInclGst', src }), text('Justification If Any (PF)', { key: 'justificationPf', src }),
          dd('CLI', t ? [] : ['Taken'], { key: 'dsCli', src, nc: true }), cur('CLI Coverage Amount', { key: 'dsCliCoverage', src }), dd('Funded / Non Funded', FUNDED, { key: 'dsCliFunded', src }),
          int('Tenure', { key: 'dsCliTenure', src }), ro('CLI Premium', { key: 'dsCliPremium', src }), text('Justification If Any (CLI)', { key: 'justificationCli', src }),
          ...(t ? [] : [
            dd('Hospi Taken', ['Taken'], { key: 'dsHospiTaken', src, nc: true }), dd('Funded / Non Funded', FUNDED, { key: 'dsHospiFunded', src }),
            int('Tenure', { key: 'dsHospiTenure', src }), ro('Hospi Premium', { key: 'dsHospiPremium', src }),
          ]),
        ],
      },
      {
        key: 'roiEmi', name: t ? 'Stamp Duty, ROI & EMI' : 'ROI & EMI', src, fields: [
          ...(t ? [cur('Stamp Duty Charges', { src })] : []),
          ro('Total Availed Amount', { src }),
          dec('Offered ROI', { key: 'dsOfferedRoi', src, ...roiBounds, nc: true, notes: 'Policy MIN/MAX bounds as observed for the documented scheme — confirm.' }),
          text('Justification If Any (ROI)', { key: 'justificationRoi', src }), ro('Emi Amount', { key: 'dsEmiAmount', src }),
          ro('Deviation Generated', { key: 'dealDeviationGenerated', src: 'Manual §23.1', help: 'Set by the system after submission (Yes / No). Deviation codes observed: CLI_TENURE, CLI_COVERAGE, MLR_DISCOUNT, PF_DISCOUNT.' }),
        ],
      },
      {
        key: 'dsSummary', name: 'Summary', src, fields: [
          ro('Processing Fee', { key: 'dsSummaryPf', src }), ro('CLI', { key: 'dsSummaryCli', src }),
          ...(t ? [ro('Stamp Duty Charges', { key: 'dsSummaryStampDuty', src })] : [ro('Hospi Premium', { key: 'dsSummaryHospi', src })]),
          ro('Margin Money', { key: 'dsMarginMoney', src }),
        ],
      },
    ],
  };
}

function sanctionLetter(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §26, Fig 136–141' : 'OPTIM #224–#229';
  return {
    key: 'sanctionLetter', name: 'Sanction Letter (e-KYC gated)', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    desc: 'HARD STOP: "Please complete your E-KYC to continue. The sanction letter can be issued only after E-KYC verification."',
    modules: [
      {
        key: 'ekyc', name: 'Aadhaar e-KYC', src, fields: [
          ro('E-KYC Status', { key: 'ekycStatus', src, help: 'Pending / Done' }),
          check('Aadhaar consent (customer has been provided options to use Aadhaar for KYC authentication)', { key: 'aadhaarConsent', src, help: 'Consent must be checked before language/mobile fields and Get OTP appear.' }),
          dd('Consent in the customer\'s preferred language', ['English'], { key: 'consentLanguage', src, nc: true, notes: 'Only "ENGLISH" observed.', vis: [eq('aadhaarConsent', true)] }),
          text('Enter Mobile Number (linked with Aadhaar)', { key: 'aadhaarLinkedMobile', src, vis: [eq('aadhaarConsent', true)] }),
          text("Enter The Customer's Aadhaar Number", { key: 'aadhaarNumber', src, sensitive: true, mask: 'MASK_ALL', minLen: 12, maxLen: 12, pattern: '^[0-9]{12}$', patternMsg: 'Aadhaar number must be 12 digits.', nc: true, notes: '12-digit length inferred from the masked field (XXXXXXXXXXXX) — confirm.' }),
          text('Enter OTP', { key: 'ekycOtp', src, help: '5-minute countdown (Manual Fig 140).' }),
        ],
      },
      {
        key: 'loanSummary', name: 'Loan Summary', src, fields: [
          ro('Sanction Date', { src }), ro('Tenure (Months)', { key: 'lsTenure', src }), ro('ROI', { key: 'lsRoi', src }), ro('Total Availed Amount', { key: 'lsTotalAvailed', src }),
          date('1st EMI Date', { key: 'firstEmiDate', src, help: 'Selected from the allowed EMI dates (dropdown in OPTIM).' }), ro('Emi Amount', { key: 'lsEmiAmount', src }),
        ],
      },
    ],
  };
}

function nach(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §27, Fig 142' : 'OPTIM #230–#231';
  return {
    key: 'nach', name: isTractor(v) ? 'NACH' : 'NACH (Enach)', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    fields: [
      ro('Loan Amount', { key: 'nachLoanAmount', src }), ro('Tenure', { key: 'nachTenure', src }), ro('Repayment Account', { key: 'nachRepaymentAccount', src }),
      ro('Account Name', { key: 'nachAccountName', src }), ro('IFSC Code', { key: 'nachIfsc', src }), ro('First EMI Date', { key: 'nachFirstEmiDate', src }),
      dd('Nach Type', isTractor(v) ? ['Physical NACH', 'eNACH'] : ['E-NACH', 'SI', 'PHYSICAL NACH'], {
        src, nc: isTractor(v), notes: isTractor(v) ? 'Manual observed "Physical NACH" and states eNACH is supported; OPTIM (Two Wheeler) shows E-NACH / SI / PHYSICAL NACH — confirm for Tractor.' : undefined,
      }),
    ],
  };
}

function disbursementDetails(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §28, Fig 143' : 'OPTIM #232';
  return {
    key: 'disbursementDetails', name: 'Disbursement Details', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    fields: [
      yn('New Dealer', { key: 'newDealer', src, help: 'Toggle to add a dealer not already on file.' }),
      text('Dealer Account Name', { src }), text('Dealer Account No', { src, sensitive: true, mask: 'MASK_ALL_BUT_LAST_4' }), text('IFSC Code', { key: 'dealerIfsc', src }),
      cur('Disbursement Amount', { key: 'sdDisbursementAmount', src }),
    ],
  };
}

function nominee(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §29, Fig 144' : 'OPTIM #234–#235';
  return {
    key: 'nominee', name: 'Nominee Details', platform: 'MOBILE', role: 'SALES_OFFICER', src,
    fields: [
      text('Name', { key: 'nomineeName', src }), dd('Relationship', ['Brother'], { key: 'nomineeRelationship', src, nc: true, notes: 'Only "Brother" observed.' }),
      date('DOB', { key: 'nomineeDob', src }), dd('Gender', ['Male'], { key: 'nomineeGender', src, nc: true, notes: 'Only "Male" observed.' }),
      ...addressBlock('nominee', '', src),
    ],
  };
}

function preDisbursementDocuments(v: Variant): SubSpec {
  return {
    key: 'preDisbursementDocuments', name: 'Pre-Disbursement Documents', platform: 'MOBILE', role: 'SALES_OFFICER',
    src: isTractor(v) ? 'Manual §30, Fig 145–147' : 'OPTIM #237–#240',
    desc: 'Document checklist is configured under Document Configuration. Submission → "Disbursement Document Uploaded" → QC Maker queue.',
    fields: [dd('Select Additional Document', ADDITIONAL_DOCS, { key: 'preDisbAdditionalDocument', src: 'OPTIM #238', nc: true, notes: ADDITIONAL_DOC_NOTE })],
  };
}

// ─────────────────────────── Business / Operations / Disbursement (web) ───────────────────────────

function asmApproval(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §24, Fig 129–131' : 'OPTIM #191, #213–#216';
  return {
    key: 'asmApproval', name: 'ASM Approval', platform: 'WEB', role: 'ASM', src,
    desc: 'ASM reviews the Business deviations and RECOMMENDS (Approve/Reject). ASM does not hold final approval authority.',
    modules: [
      {
        key: 'businessDeviations', name: 'Business Deviations', repeatable: true, src, fields: [
          dd('Deviation Code', ['CLI_TENURE', 'CLI_COVERAGE', 'MLR_DISCOUNT', 'PF_DISCOUNT'], { key: 'businessDeviationCode', ro: true, src: 'Manual §23.1, Fig 130' }),
          ro('Auth', { key: 'bdAuth', src }), ro('Policy', { key: 'bdPolicy', src }), ro('Availed', { key: 'bdAvailed', src }), ro('Deviation %', { key: 'bdDeviationPercent', src }), ro('Status', { key: 'bdStatus', src }),
        ],
      },
      { key: 'asmAction', name: 'ASM Approval Action', src, fields: [area('Remark', { key: 'asmRemark', req: 'M', src: 'Manual Fig 131' })] },
    ],
  };
}

function businessApproval(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §25, Fig 132–135' : 'OPTIM #196–#222';
  return {
    key: 'businessApproval', name: 'Business Approval (Rate Approval)', platform: 'WEB', role: 'BUSINESS_USER', src,
    modules: [
      {
        key: 'rateApproval', name: 'Business Rate Approval', repeatable: true, src, fields: [
          ro('Deviation Code', { key: 'brDeviationCode', src }), dd('Auth', ['Approve', 'Reject'], { key: 'brAuth', req: 'M', src }), area('Auth Remarks', { key: 'brAuthRemarks', src }),
        ],
      },
      { key: 'businessFinal', name: 'Final Business Deviation Remarks', src, fields: [area('Remark', { key: 'businessFinalRemark', req: 'M', src })] },
    ],
  };
}

function qcMaker(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §31, Fig 148–150' : 'OPTIM #241–#257';
  return {
    key: 'qcMaker', name: 'QC Maker', platform: 'WEB', role: 'QC_MAKER', src,
    modules: [
      {
        key: 'qcMakerDocuments', name: 'Document Validation', repeatable: true, src, fields: [
          ro('Document', { key: 'qcmDocument', src }),
          dd('QC Maker Status', ['Verified', 'Discrepancy'], { key: 'qcMakerStatus', req: 'M', src, nc: true, notes: 'Manual: "Valid or Discrepancy?"; screens show PENDING / VERIFIED. Exact rejection label not visible.' }),
          area('QC Maker Remarks', { key: 'qcMakerRemarks', src }),
        ],
      },
      { key: 'qcMakerFinal', name: 'Final QC Initiated Task Summary', src, fields: [area('Remark', { key: 'qcMakerFinalRemark', req: 'M', src })] },
    ],
  };
}

function qcChecker(v: Variant): SubSpec {
  const src = isTractor(v) ? 'Manual §32, Fig 151–153' : 'OPTIM #258–#266';
  return {
    key: 'qcChecker', name: 'QC Checker', platform: 'WEB', role: 'QC_CHECKER', src,
    modules: [
      {
        key: 'qcCheckerDocuments', name: 'Final Validation (Audit Initiated)', repeatable: true, src, fields: [
          ro('QC Maker Status', { key: 'qccMakerStatus', src }), ro('QC Maker Remarks', { key: 'qccMakerRemarks', src }),
          dd('QC Checker Status', ['Verified', 'Rejected'], { key: 'qcCheckerStatus', req: 'M', src, nc: true, notes: 'VERIFIED observed; the rejection label is not visible in the source.' }),
          area('QC Checker Remarks', { key: 'qcCheckerRemarks', src }),
        ],
      },
      { key: 'qcCheckerFinal', name: 'Final QC Initiated Task Summary', src, fields: [area('Remark', { key: 'qcCheckerFinalRemark', req: 'M', src })] },
    ],
  };
}

function disbursementUpdate(v: Variant): SubSpec {
  const t = isTractor(v);
  const src = t ? 'Manual §33, Fig 154–156' : 'OPTIM #267–#271';
  return {
    key: 'disbursementUpdate', name: 'Disbursement Update', platform: 'WEB', role: 'DISBURSEMENT_USER', src,
    modules: [
      {
        key: 'financialReview', name: 'Financial Review', src, fields: [
          ro('Total Asset Cost', { key: 'duTotalAssetCost', src }), ro('LTV', { key: 'duLtv', src }), ro('Finance Amount', { key: 'duFinanceAmount', src }), ro('Margin Money', { key: 'duMarginMoney', src }),
          ro('Total Charges', { key: 'duTotalCharges', src }), ro('Dealer Proforma Invoice Amount', { key: 'duDealerProforma', src }), ro('Disbursement Amount', { key: 'duDisbursementAmount', src }),
          ro('Broken Period Days', { src }), ro('Broken Period Interest', { src }), ro('EMI with Broken Period Interest', { src }), ro('Distance from Branch', { src }),
          ro('Disbursement Branch Region', { src }), ro('Disbursement Branch State', { src }),
        ],
      },
      {
        key: 'disbursementUpdateAction', name: 'Disbursement Update Action', src, fields: [
          cur('Enter Disbursement Amount', { key: 'enterDisbursementAmount', req: 'M', src }),
          ...(t ? [] : [area('Remark', { key: 'disbursementUpdateRemark', req: 'M', src: 'OPTIM #271' })]),
        ],
      },
    ],
  };
}

function authDone(v: Variant): SubSpec {
  const t = isTractor(v);
  const src = t ? 'Manual §34, Fig 157–163' : 'OPTIM #272–#287';
  return {
    key: 'authDone', name: 'Auth Done', platform: 'WEB', role: 'AUTH_USER', src,
    desc: 'Authorizer reviews applicant data and the document galleries (Credit / OVD / Disbursement / System documents), then updates auth details.',
    fields: t
      ? [area('Auth Remarks', { key: 'authRemarks', src, nc: true, notes: '"Update Auth Details" fields are not listed in the manual — confirm.' })]
      : [
          ro('Disbursement Update Amount', { key: 'authDisbursementUpdateAmount', src: 'OPTIM #275' }),
          cur('Enter Auth Disbursement Amount', { key: 'enterAuthDisbursementAmount', req: 'M', src: 'OPTIM #275' }),
          area('Remark', { key: 'authRemark', req: 'M', src: 'OPTIM #275' }),
        ],
  };
}

function finalDisbursement(v: Variant): SubSpec {
  const src = 'Manual §35, Fig 159';
  return {
    key: 'finalDisbursement', name: 'Final Disbursement', platform: 'WEB', role: 'AUTH_USER', src, nc: !isTractor(v),
    desc: 'Check Dedupe (All Members) → CIF creation → Loan Account creation → GL Account creation. No other accounting process is documented.' + (isTractor(v) ? '' : ' Not captured in the Two Wheeler screenshots — copied from the Tractor manual for confirmation.'),
    modules: [
      { key: 'cifCreation', name: 'CIF Creation', repeatable: true, src, fields: [ro('Member Name', { key: 'cifMemberName', src }), ro('Member Type', { key: 'cifMemberType', src }), ro('NTB/ETB', { key: 'ntbEtb', src }), ro('Customer ID', { key: 'cifCustomerId', src })] },
      { key: 'loanCreation', name: 'Loan Account Creation', src, fields: [ro('First EMI Date', { key: 'lcFirstEmiDate', src }), ro('Sanction Amount', { key: 'lcSanctionAmount', src }), ro('Sanction Date', { key: 'lcSanctionDate', src }), ro('Tenure / Rate Parameters', { key: 'lcTenureRate', src })] },
      {
        key: 'glAccounts', name: 'GL Account Creation', repeatable: true, src, fields: [
          ro('GL Account', { src }), dd('Description', ['Processing Fee', 'CLI', 'Documentation Charges', 'Stamp Duty Charges'], { key: 'glDescription', ro: true, src }),
          ro('Base Amount', { key: 'glBaseAmount', src }), ro('IGST', { key: 'glIgst', src }), ro('CGST', { key: 'glCgst', src }), ro('SGST', { key: 'glSgst', src }), ro('Final Amount', { key: 'glFinalAmount', src }),
        ],
      },
    ],
  };
}

// ─────────────────────────── Assembly ───────────────────────────

export function losStages(v: Variant): StageSpec[] {
  const t = isTractor(v);
  const loginSubs: SubSpec[] = [leadCreation(v), mobileVerification(v), kyc(v), duplicateCheck(v), bureau(v)];
  if (t) loginSubs.push(fvr(), personalDiscussion(), loanDetailsTractor(v));
  else loginSubs.push(loanDetailsTW(), scoreCardTW());
  loginSubs.push(documentUpload(v), applicationForm(v));
  return [
    { key: 'login', name: 'Login', platform: 'MOBILE', src: t ? 'Manual §3, §6–13' : 'OPTIM #1–#67', desc: 'Customer-facing journey on the mobile app up to Application Form submission.', subs: loginSubs },
    { key: 'dueDiligence', name: 'Due Diligence', platform: 'WEB', src: t ? 'Manual §14' : 'OPTIM #68–#81', desc: 'Compliance validation of KYC documents.', subs: [dueDiligence(v)] },
    {
      key: 'credit', name: 'Credit', platform: 'WEB', src: t ? 'Manual §15–21' : 'OPTIM #89–#178', desc: 'CAM, verifications (RCU/FI/TVR in parallel), deviation and credit decision.',
      subs: [camPreparation(v), incomeValidation(v), rcu(v), fi(v), tvr(v), inPrincipleApproval(v), deviation(v), creditApproval(v), relook()],
    },
    {
      key: 'postSanction', name: 'Post-Sanction', platform: 'MOBILE', src: t ? 'Manual §22–30' : 'OPTIM #179–#240', desc: 'Sales Officer steps after credit sanction. Business approval is routed in between (see Workflow).',
      subs: [repayment(v), dealStructure(v), sanctionLetter(v), nach(v), disbursementDetails(v), nominee(v), preDisbursementDocuments(v)],
    },
    { key: 'business', name: 'Business', platform: 'WEB', src: t ? 'Manual §24–25' : 'OPTIM #191–#222', desc: 'Deal-structure deviations: ASM recommends, Business decides.', subs: [asmApproval(v), businessApproval(v)] },
    { key: 'operations', name: 'Operations', platform: 'WEB', src: t ? 'Manual §31–32' : 'OPTIM #241–#266', desc: 'QC Maker / QC Checker on pre-disbursement documents.', subs: [qcMaker(v), qcChecker(v)] },
    { key: 'disbursement', name: 'Disbursement', platform: 'WEB', src: t ? 'Manual §33–35' : 'OPTIM #267–#287', desc: 'Disbursement amount, authorisation and final disbursement.', subs: [disbursementUpdate(v), authDone(v), finalDisbursement(v)] },
  ];
}

export function losDocuments(v: Variant): DocSpec[] {
  const t = isTractor(v);
  const kycSrc = t ? 'Manual Fig 9, 70' : 'OPTIM #15–#20, #70';
  const docs: DocSpec[] = [
    { sub: 'login/kyc', code: 'AADHAAR_POI', name: 'Aadhaar Card (POI) — Front', category: 'KYC / OVD', validatedBy: ['DUE_DILIGENCE'], src: kycSrc, notes: 'Capture confirmations: "I confirm the image is clear and visible" and "I agree and confirm that the document is masked".' },
    { sub: 'login/kyc', code: 'AADHAAR_POA', name: 'Aadhaar Card (POA) — Back', category: 'KYC / OVD', validatedBy: ['DUE_DILIGENCE'], src: kycSrc },
    { sub: 'login/kyc', code: 'LIVE_PHOTO', name: 'Live Photo', category: 'KYC / OVD', capture: 'CAMERA', validatedBy: ['DUE_DILIGENCE'], src: kycSrc },
    { sub: 'login/kyc', code: 'PAN_CARD', name: 'PAN Card', category: 'KYC / OVD', capture: 'CAMERA', validatedBy: ['DUE_DILIGENCE'], src: kycSrc },
  ];
  if (t) {
    docs.push(
      { sub: 'login/fvr', code: 'LAND_IMAGE', name: 'Land Image', category: 'Income', req: 'OPTIONAL', capture: 'CAMERA', nc: true, src: 'Manual Fig 23, 160' },
      { sub: 'login/fvr', code: 'OTHER_INCOME_PROOF', name: 'Other Income Proof Image', category: 'Income', req: 'OPTIONAL', capture: 'CAMERA', nc: true, src: 'Manual Fig 27' },
      { sub: 'login/fvr', code: 'ANIMAL_HUSBANDRY_IMAGES', name: 'Animal Husbandry Images', category: 'Income', req: 'OPTIONAL', capture: 'CAMERA', nc: true, src: 'Manual Fig 31, 160' },
      { sub: 'login/fvr', code: 'OTHER_ALLIED_INCOME_IMAGES', name: 'Other Allied Income Images', category: 'Income', req: 'OPTIONAL', capture: 'CAMERA', nc: true, src: 'Manual Fig 32, 160' },
      { sub: 'login/fvr', code: 'MACHINERY_IMAGES', name: 'Machinery Images', category: 'Income', req: 'OPTIONAL', capture: 'CAMERA', nc: true, src: 'Manual Fig 34, 160' },
      { sub: 'login/documentUpload', code: 'QUOTATION', name: 'Dealer Quotation', category: 'Scheme', capture: 'CAMERA', nc: true, src: 'Manual Fig 61', notes: 'Mandatory status not explicitly stated.' },
      { sub: 'postSanction/preDisbursementDocuments', code: 'DPN', name: 'Demand Promissory Note (DPN)', category: 'Pre-Disbursement', capture: 'CAMERA', validatedBy: ['QC_MAKER', 'QC_CHECKER'], src: 'Manual §30, Fig 145' },
      { sub: 'postSanction/preDisbursementDocuments', code: 'DPN_DELIVERY_WAIVER', name: 'DPN Delivery Cum Waiver Letter', category: 'Pre-Disbursement', capture: 'CAMERA', validatedBy: ['QC_MAKER', 'QC_CHECKER'], src: 'Manual §30, Fig 145' },
      { sub: 'postSanction/preDisbursementDocuments', code: 'SECURITY_PDC', name: 'Security PDC', category: 'Pre-Disbursement', capture: 'CAMERA', validatedBy: ['QC_MAKER', 'QC_CHECKER'], src: 'Manual §30, Fig 145' },
      { sub: 'postSanction/preDisbursementDocuments', code: 'SIGNATURE_APPLICANT', name: 'Signature — Applicant', category: 'Pre-Disbursement', capture: 'CAMERA', validatedBy: ['QC_MAKER', 'QC_CHECKER'], src: 'Manual §30, Fig 145' },
    );
  } else {
    const ss = 'OPTIM #51–#54, #160';
    docs.push(
      { sub: 'login/documentUpload', code: 'BANK_STATEMENT', name: 'Bank Statement', category: 'Scheme', capture: 'CAMERA', validatedBy: ['RCU_USER'], src: ss },
      { sub: 'login/documentUpload', code: 'INSURANCE_POLICY', name: 'Insurance Policy', category: 'Scheme', capture: 'CAMERA', validatedBy: ['RCU_USER'], src: ss },
      { sub: 'login/documentUpload', code: 'RC_VEHICLE', name: 'Registration Certificate (RC) of the Vehicle', category: 'Scheme', capture: 'CAMERA', validatedBy: ['RCU_USER'], src: ss },
      { sub: 'credit/fi', code: 'FI_DOCUMENT_IMAGE', name: 'FI Document Image', category: 'FI', req: 'OPTIONAL', capture: 'CAMERA', src: 'OPTIM #148' },
    );
    const pre = ['BANK STATEMENT', 'HYPOTHECATION AGREEMENT', 'INSURANCE POLICY', 'LOAN AGREEMENT', 'POST-DATED CHEQUE', 'QUOTATION', 'SANCTION LETTER', 'TAX INVOICE', 'UDYAM CERTIFICATE'];
    for (const p of pre)
      docs.push({ sub: 'postSanction/preDisbursementDocuments', code: `PRE_${p.replace(/[^A-Z]+/g, '_')}`, name: `Scheme | ${p}`, category: 'Pre-Disbursement', capture: 'CAMERA', validatedBy: ['QC_MAKER', 'QC_CHECKER'], src: 'OPTIM #237–#239', nc: true, notes: 'Listed on the upload screen; whether each is mandatory is not shown.' });
    docs.push({ sub: 'postSanction/preDisbursementDocuments', code: 'SIGNATURE_APPLICANT', name: 'Signature — Applicant', category: 'Pre-Disbursement', capture: 'CAMERA', validatedBy: ['QC_MAKER', 'QC_CHECKER'], src: 'OPTIM #238, #256' });
  }
  for (const [code, name] of [['SYS_APPLICATION_FORM', 'Application Form (system generated)'], ['SYS_CAM', 'CAM (system generated)'], ['SYS_KFS', 'KFS (system generated)'], ['SYS_SANCTION_LETTER', 'Sanction Letter (system generated)'], ['SYS_WELCOME_LETTER', 'Welcome Letter (system generated)']])
    docs.push({ sub: 'disbursement/authDone', code, name, category: 'System Documents', capture: 'SYSTEM_GENERATED', req: 'OPTIONAL', src: 'Manual Fig 163', nc: !t });
  return docs;
}

export function losTransitions(v: Variant): TransSpec[] {
  const t = isTractor(v);
  const M = (s: string) => (t ? `Manual ${s}` : `OPTIM / Manual ${s}`);
  const SO = ['SALES_OFFICER'];
  const preAppNext = t ? 'login/fvr' : 'login/loanDetails';
  const list: TransSpec[] = [
    { from: 'login/leadCreation', to: 'login/mobileVerification', code: 'SUBMIT', label: 'Submit', outcome: 'SUBMIT', roles: SO, fields: ['channelPartner', 'applicationType'], src: M('Fig 4') },
    { from: 'login/mobileVerification', to: 'login/kyc', code: 'VERIFY_OTP', label: 'Get OTP & Verify', outcome: 'SUBMIT', roles: SO, fields: ['mobileNumber', 'customerConsent', 'mobileOtp'], src: M('Fig 5') },
    { from: 'login/kyc', to: 'login/duplicateCheck', code: 'CREATE_LEAD', label: 'Continue (create lead)', outcome: 'SUBMIT', status: 'Lead Created', roles: SO, src: M('Fig 9'), exception: 'System runs the Duplicate Check automatically after the lead is created.' },
    { from: 'login/duplicateCheck', to: 'login/bureau', code: 'NO_DUPLICATE', label: 'No duplicate found', outcome: 'AUTO', roles: ['SYSTEM_ENGINE'], src: M('§7') },
    { from: 'login/duplicateCheck', to: 'login/bureau', code: 'APPLICATION_ACCEPTED', label: 'Application Accepted', outcome: 'APPROVE', status: 'Duplicate Approved', roles: ['DUPLICATE_REVIEWER'], src: M('Fig 16') },
    { from: 'login/duplicateCheck', to: null, code: 'APPLICATION_REJECTED', label: 'Application Rejected', outcome: 'REJECT', status: 'Duplicate Rejected', roles: ['DUPLICATE_REVIEWER'], terminal: true, src: M('Fig 16, §7'), exception: 'Duplicate rejection stops the case; SO sees "Duplicate Rejected".' },
    { from: 'login/bureau', to: preAppNext, code: 'BUREAU_APPROVED', label: 'Bureau Approved', outcome: 'AUTO', status: 'Bureau Approved', roles: ['SYSTEM_ENGINE'], src: M('Fig 18, §8') },
    { from: 'login/bureau', to: null, code: 'BUREAU_REJECTED', label: 'Bureau Rejected', outcome: 'REJECT', status: 'Bureau Rejected', roles: ['SYSTEM_ENGINE'], terminal: true, src: M('§8'), exception: 'Journey blocked until the bureau condition is satisfied.' },
    { from: 'login/bureau', to: null, code: 'BUREAU_EXPIRED', label: 'Bureau Expired', outcome: 'REJECT', status: 'Bureau Expired', roles: ['SYSTEM_ENGINE'], terminal: true, src: M('§8, Fig 80'), exception: 'Remark "Lead Expired - Validity Period Exceeded". Relook / re-assign is an administrative action.' },
  ];
  if (t)
    list.push(
      { from: 'login/fvr', to: 'login/personalDiscussion', code: 'SUBMIT', label: 'Submit FVR', outcome: 'SUBMIT', status: 'Partially Submitted', roles: SO, src: 'Manual Fig 38' },
      { from: 'login/personalDiscussion', to: 'login/loanDetails', code: 'SUBMIT', label: 'Submit PD', outcome: 'SUBMIT', status: 'Partially Submitted', roles: SO, src: 'Manual Fig 54' },
      { from: 'login/loanDetails', to: 'login/documentUpload', code: 'SUBMIT', label: 'Submit Loan Details', outcome: 'SUBMIT', status: 'Partially Submitted', roles: SO, src: 'Manual Fig 60' },
    );
  else
    list.push(
      { from: 'login/loanDetails', to: 'login/scoreCard', code: 'SUBMIT', label: 'Submit Loan Details', outcome: 'SUBMIT', status: 'Partially Submitted', roles: SO, src: 'OPTIM #45' },
      { from: 'login/scoreCard', to: 'login/documentUpload', code: 'SUBMIT', label: 'Continue', outcome: 'SUBMIT', status: 'Partially Submitted', roles: SO, src: 'OPTIM #50' },
    );
  list.push(
    { from: 'login/documentUpload', to: 'login/applicationForm', code: 'SUBMIT', label: 'Submit Documents', outcome: 'SUBMIT', status: 'Partially Submitted', roles: SO, docs: t ? ['QUOTATION'] : ['BANK_STATEMENT', 'INSURANCE_POLICY', 'RC_VEHICLE'], src: M('§12') },
    { from: 'login/applicationForm', to: 'dueDiligence/documentValidation', code: 'SUBMIT', label: 'Submit Application Form', outcome: 'SUBMIT', status: 'Due Diligence Pending', roles: SO, allMandatory: true, src: M('§13.1'), exception: 'Journey locks as Completed up to Application Form; further edits only via Modify (Case Modification loop).' },
    { from: 'dueDiligence/documentValidation', to: 'credit/camPreparation', code: 'MARK_AS_COMPLETE', label: 'Mark As Complete', outcome: 'APPROVE', status: 'Cam Pending', roles: ['DUE_DILIGENCE'], remarks: true, src: M('Fig 73, 79'), exception: 'Image Distorted does not hard-block completion; the flagged document routes a rework task to the SO.' },
    { from: 'dueDiligence/documentValidation', to: 'login/kyc', code: 'DOCUMENT_REQUEST', label: 'Image Distorted → Document Request', outcome: 'RETURN', status: 'Document Requested', roles: ['DUE_DILIGENCE'], remarks: true, conds: [{ fieldKey: 'documentStatus', operator: 'EQUALS', value: 'Image Distorted' }], src: M('§14.2'), exception: 'Loop 1: SO recaptures from My Task → case returns to Due Diligence for re-validation.' },
    { from: 'dueDiligence/documentValidation', to: null, code: 'COMPLIANCE_REJECT', label: 'Compliance Reject', outcome: 'REJECT', status: 'Compliance Rejected', roles: ['DUE_DILIGENCE'], remarks: true, terminal: true, conds: [{ fieldKey: 'documentStatus', operator: 'EQUALS', value: 'Compliance Reject' }], src: M('§14.3'), exception: 'HARD STOP: SO must restart as a fresh lead (business rule described in process documentation).' },
    { from: 'credit/camPreparation', to: 'credit/inPrincipleApproval', code: 'PREPARE_CAM', label: 'Prepare CAM', outcome: 'SUBMIT', status: 'In-Principle Approval Pending', roles: ['CAM_USER'], remarks: true, src: M('Fig 104–105') },
    { from: 'credit/camPreparation', to: null, code: 'REJECT_CAM', label: 'Reject CAM', outcome: 'REJECT', roles: ['CAM_USER'], remarks: true, nc: true, src: M('Fig 84'), exception: 'Destination / resulting status after Reject CAM is not established in the source.' },
    { from: 'credit/camPreparation', to: null, code: 'MODIFY', label: 'Modify (Case Modification)', outcome: 'RETURN', status: 'Case Modified', roles: ['CAM_USER'], remarks: true, src: M('§18, Fig 87'), exception: 'Loop 3: the relevant mobile stage unlocks with data prefilled; SO resubmits → back to CAM. Changing a parent field may reset dependent fields.' },
    { from: 'credit/camPreparation', to: null, code: 'REQUEST_ADDITIONAL_DOCUMENT', label: 'Request Additional Document', outcome: 'RETURN', status: 'Additional Document Request', roles: ['CAM_USER'], fields: ['additionalDocumentMaster', 'additionalDocumentRemarks'], src: M('§17, Fig 85'), exception: 'Loop 2: request appears in SO My Task; SO uploads → back to CAM.' },
    { from: 'credit/camPreparation', to: null, code: 'QUERY', label: 'Query with SO', outcome: 'QUERY', roles: ['CAM_USER'], src: M('Fig 88'), exception: 'All initiated queries must be closed before completing ("It\'s necessary to close all initiated QUERIES" — OPTIM).' },
    { from: 'credit/camPreparation', to: null, code: 'CAM_HOLD', label: 'CAM Hold', outcome: 'HOLD', roles: ['CAM_USER'], nc: true, src: M('Fig 84'), exception: 'Hold behaviour not described in the source.' },
    { from: 'credit/camPreparation', to: 'credit/fi', code: 'INITIATE_FI', label: 'Initiate FI', outcome: 'AUTO', status: 'FI Initiated', roles: ['CAM_USER'], src: M('§16.2, Fig 90') },
    { from: 'credit/camPreparation', to: 'credit/tvr', code: 'INITIATE_TVR', label: 'Initiate TVR', outcome: 'AUTO', status: 'TVR Initiated', roles: ['CAM_USER'], src: M('§16.2, Fig 89') },
    { from: 'credit/rcu', to: null, code: 'MARK_AS_COMPLETE', label: 'Mark As Complete', outcome: 'SUBMIT', roles: ['RCU_USER'], remarks: true, src: t ? 'Manual §16.1' : 'OPTIM #161–#162', exception: 'Parallel stream: result appears as the RCU Status badge on CAM / Credit screens.', nc: t },
    { from: 'credit/fi', to: null, code: 'SUBMIT_POSITIVE', label: 'Submit (Positive)', outcome: 'SUBMIT', status: 'FI Positive', roles: ['FI_USER'], conds: [{ fieldKey: 'fiStatus', operator: 'EQUALS', value: 'Positive' }], src: M('§16.3'), exception: 'Parallel stream; no deviation generated.' },
    { from: 'credit/fi', to: 'credit/deviation', code: 'NEGATIVE_AUTO_DEVIATION', label: 'Negative → automatic deviation', outcome: 'AUTO', status: 'Deviation Pending', roles: ['FI_USER', 'SYSTEM_ENGINE'], conds: [{ fieldKey: 'fiStatus', operator: 'EQUALS', value: 'Negative' }], src: M('§20.1'), exception: 'System generates "Fi Deviations" (Deviation By: SYSTEM, "System auto deviations!").' },
    { from: 'credit/tvr', to: null, code: 'SUBMIT_POSITIVE', label: 'Submit (Positive)', outcome: 'SUBMIT', status: 'TVR Positive', roles: ['TVR_USER'], conds: [{ fieldKey: 'tvrStatus', operator: 'EQUALS', value: 'Positive' }], src: M('§16.3') },
    { from: 'credit/tvr', to: 'credit/deviation', code: 'NEGATIVE_AUTO_DEVIATION', label: 'Negative → automatic deviation', outcome: 'AUTO', status: 'Deviation Pending', roles: ['TVR_USER', 'SYSTEM_ENGINE'], conds: [{ fieldKey: 'tvrStatus', operator: 'EQUALS', value: 'Negative' }], src: M('§20.1') },
    { from: 'credit/inPrincipleApproval', to: 'credit/creditApproval', code: 'IN_PRINCIPLE_APPROVE', label: 'Submit In-Principle Approval', outcome: 'APPROVE', status: 'In-Principle Approved', roles: ['CREDIT_APPROVER'], remarks: true, fields: ['sanctionAmount', 'sanctionRepaymentFrequency', 'sanctionTenure', 'ipRemark'], src: M('Fig 108–109'), exception: 'If a third-party check is Negative the case goes to Deviation first (Decision Table §19.1).' },
    { from: 'credit/deviation', to: 'credit/creditApproval', code: 'DEVIATION_APPROVED', label: 'Update Status — Approved', outcome: 'APPROVE', status: 'Credit Approval Pending', roles: ['DEVIATION_APPROVER'], remarks: true, conds: [{ fieldKey: 'deviationUpdateStatus', operator: 'EQUALS', value: 'Approve' }], src: M('Fig 116–118') },
    { from: 'credit/deviation', to: 'credit/relook', code: 'DEVIATION_REJECTED', label: 'Update Status — Rejected', outcome: 'REJECT', status: 'Loan Declined', roles: ['DEVIATION_APPROVER'], remarks: true, conds: [{ fieldKey: 'deviationUpdateStatus', operator: 'EQUALS', value: 'Reject' }], src: M('§20.2'), exception: 'Loop 4: Loan Declined → Relook Queue.' },
    { from: 'credit/creditApproval', to: 'postSanction/repayment', code: 'CREDIT_APPROVE', label: 'Credit Approve', outcome: 'APPROVE', status: 'Credit Sanctioned', roles: ['CREDIT_APPROVER'], remarks: true, fields: ['sanctionAmount', 'sanctionRepaymentFrequency', 'sanctionTenure'], src: M('Fig 121–122') },
    { from: 'credit/creditApproval', to: 'credit/relook', code: 'LOAN_DECLINE', label: 'Loan Decline', outcome: 'REJECT', status: 'Loan Declined', roles: ['CREDIT_APPROVER'], remarks: true, src: M('Fig 121, §37.1') },
    { from: 'credit/relook', to: 'credit/creditApproval', code: 'REOPEN', label: 'Reopen', outcome: 'RETURN', status: 'Relook', roles: ['RELOOK_USER'], nc: true, src: M('§37.1'), exception: 'If reopened, returns to the same user who declined it, per the configured workflow.' },
    { from: 'postSanction/repayment', to: 'postSanction/dealStructure', code: 'AUTHENTICATE', label: 'Authenticate (Penny Drop)', outcome: 'SUBMIT', status: 'Repayment Account Verified', roles: SO, fields: ['repaymentIfsc', 'repaymentAccountNumber'], src: M('§22'), exception: 'Failed Penny Drop blocks progression until a valid account is entered.' },
    { from: 'postSanction/dealStructure', to: 'business/asmApproval', code: 'SUBMIT_WITH_DEVIATION', label: 'Submit (deviation generated)', outcome: 'SUBMIT', status: 'ASM Approval Pending', roles: SO, conds: [{ fieldKey: 'dealDeviationGenerated', operator: 'EQUALS', value: 'Yes' }], src: M('§23.1') },
    { from: 'postSanction/dealStructure', to: 'postSanction/sanctionLetter', code: 'SUBMIT_NO_DEVIATION', label: 'Submit (no deviation)', outcome: 'SUBMIT', status: 'Deal Structure Submitted', roles: SO, conds: [{ fieldKey: 'dealDeviationGenerated', operator: 'NOT_EQUALS', value: 'Yes' }], src: M('§23.1') },
    { from: 'business/asmApproval', to: 'business/businessApproval', code: 'ASM_RECOMMEND_APPROVE', label: 'Approve (recommendation)', outcome: 'APPROVE', status: 'Business Approval Pending', roles: ['ASM'], remarks: true, src: M('Fig 131'), exception: 'ASM recommends but does not approve the deviation.' },
    { from: 'business/asmApproval', to: null, code: 'ASM_RECOMMEND_REJECT', label: 'Reject (recommendation)', outcome: 'REJECT', roles: ['ASM'], remarks: true, nc: true, src: M('Fig 130'), exception: 'Routing after an ASM Reject recommendation is not established in the source.' },
    { from: 'business/businessApproval', to: 'postSanction/sanctionLetter', code: 'BUSINESS_APPROVE', label: 'Update Status — Approved', outcome: 'APPROVE', status: 'Loan Sanctioned', roles: ['BUSINESS_USER'], remarks: true, src: M('Fig 134–136') },
    { from: 'business/businessApproval', to: 'postSanction/dealStructure', code: 'BUSINESS_REJECT', label: 'Update Status — Rejected', outcome: 'RETURN', status: t ? 'Deal Structure Returned' : 'Rate Negotiation', roles: ['BUSINESS_USER'], remarks: true, src: t ? 'Manual §25' : 'OPTIM #206', exception: 'Loop 5: SO resubmits Deal Structure; system re-checks deviation.' },
    { from: 'postSanction/sanctionLetter', to: 'postSanction/nach', code: 'SUBMIT', label: 'Submit Loan Summary', outcome: 'SUBMIT', status: 'Loan Sanctioned', roles: SO, fields: ['firstEmiDate'], conds: [{ fieldKey: 'ekycStatus', operator: 'EQUALS', value: 'Done' }], src: M('§26'), exception: 'HARD STOP if e-KYC not done: "Please complete your E-KYC to continue. The sanction letter can be issued only after E-KYC verification."' },
    { from: 'postSanction/nach', to: 'postSanction/disbursementDetails', code: 'SUBMIT', label: 'Submit', outcome: 'SUBMIT', roles: SO, fields: ['nachType'], src: M('§27') },
    { from: 'postSanction/disbursementDetails', to: 'postSanction/nominee', code: 'SUBMIT', label: 'Submit', outcome: 'SUBMIT', roles: SO, src: M('§28') },
    { from: 'postSanction/nominee', to: 'postSanction/preDisbursementDocuments', code: 'SUBMIT', label: 'Submit', outcome: 'SUBMIT', roles: SO, src: M('§29') },
    { from: 'postSanction/preDisbursementDocuments', to: 'operations/qcMaker', code: 'SUBMIT', label: 'Submit', outcome: 'SUBMIT', status: 'Disbursement Document Uploaded', roles: SO, docs: t ? ['DPN', 'DPN_DELIVERY_WAIVER', 'SECURITY_PDC', 'SIGNATURE_APPLICANT'] : ['SIGNATURE_APPLICANT'], src: M('§30') },
    { from: 'operations/qcMaker', to: 'operations/qcChecker', code: 'MARK_AS_COMPLETE', label: 'Mark As Complete', outcome: 'APPROVE', status: 'QC Verified', roles: ['QC_MAKER'], remarks: true, src: M('Fig 150') },
    { from: 'operations/qcMaker', to: 'postSanction/preDisbursementDocuments', code: 'DISCREPANCY', label: 'Discrepancy → Document Request', outcome: 'RETURN', status: 'QC Initiated Document Requested', roles: ['QC_MAKER'], remarks: true, src: t ? 'Manual §31' : 'OPTIM #249–#257', exception: 'Loop 6: SO re-uploads from My Task → back to QC Maker ("QC Initiated Document Re-Submitted").' },
    { from: 'operations/qcChecker', to: 'disbursement/disbursementUpdate', code: 'MARK_AS_COMPLETE', label: 'Mark As Complete', outcome: 'APPROVE', status: 'QC Audited', roles: ['QC_CHECKER'], remarks: true, src: M('Fig 153–154') },
    { from: 'operations/qcChecker', to: 'postSanction/preDisbursementDocuments', code: 'REJECT', label: 'Reject → Document Request', outcome: 'RETURN', roles: ['QC_CHECKER'], remarks: true, src: M('§32'), exception: 'Loop 7: SO → QC Maker (re-validate) → QC Checker. The document must pass QC Maker again.' },
    { from: 'disbursement/disbursementUpdate', to: 'disbursement/authDone', code: 'UPDATE_DISBURSEMENT', label: 'Update Disbursement Details', outcome: 'SUBMIT', status: 'Disbursement Updated', roles: ['DISBURSEMENT_USER'], remarks: !t, fields: ['enterDisbursementAmount'], src: M('Fig 156') },
    { from: 'disbursement/authDone', to: 'disbursement/finalDisbursement', code: 'UPDATE_AUTH_DETAILS', label: 'Update Auth Details', outcome: 'APPROVE', status: 'Auth Done', roles: ['AUTH_USER'], remarks: !t, src: M('Fig 158') },
    { from: 'disbursement/finalDisbursement', to: null, code: 'DISBURSE_THIS_CASE', label: 'Disburse This Case', outcome: 'SUBMIT', status: 'Final Disbursement', roles: ['AUTH_USER'], terminal: true, nc: !t, src: 'Manual §35', exception: 'Creates CIF, Loan Account and GL Account; a system Welcome Letter is generated.' },
  );
  return list;
}

export function losSnapshot(v: Variant) {
  return buildSnapshot(losStages(v), losDocuments(v), losTransitions(v));
}

/**
 * Starter template for products without source material (cars, commercial vehicles).
 * Same high-level OPTIM stage skeleton, every item flagged "requires confirmation",
 * with only the product-independent lead-creation / KYC screens pre-filled.
 */
export function starterSnapshot(productName: string) {
  const ph = (key: string, name: string, platform: SubSpec['platform'], role: string): SubSpec => ({
    key, name, platform, role, src: 'Starter template', nc: true, desc: `Placeholder — configure the ${productName} fields after business confirmation.`, fields: [],
  });
  const common = (s: SubSpec): SubSpec => ({ ...s, nc: true, src: `${s.src} (common OPTIM screen — confirm for ${productName})`, fields: s.fields?.map((f) => ({ ...f, nc: true })), modules: s.modules?.map((m) => ({ ...m, fields: m.fields.map((f) => ({ ...f, nc: true })) })) });
  const stages: StageSpec[] = [
    {
      key: 'login', name: 'Login', platform: 'MOBILE', nc: true, src: 'Starter template',
      subs: [
        common(leadCreation('TW')), common(mobileVerification('TW')), common(kyc('TW')),
        ph('duplicateCheck', 'Duplicate Check', 'WEB', 'DUPLICATE_REVIEWER'), ph('bureau', 'Bureau', 'SYSTEM', 'SYSTEM_ENGINE'),
        ph('loanDetails', 'Loan Details', 'MOBILE', 'SALES_OFFICER'), ph('documentUpload', 'Document Upload', 'MOBILE', 'SALES_OFFICER'),
        ph('applicationForm', 'Application Form', 'MOBILE', 'SALES_OFFICER'),
      ],
    },
    { key: 'dueDiligence', name: 'Due Diligence', platform: 'WEB', nc: true, subs: [ph('documentValidation', 'Due Diligence — Document Validation', 'WEB', 'DUE_DILIGENCE')] },
    {
      key: 'credit', name: 'Credit', platform: 'WEB', nc: true,
      subs: [ph('camPreparation', 'CAM Preparation', 'WEB', 'CAM_USER'), ph('rcu', 'RCU', 'WEB', 'RCU_USER'), ph('fi', 'FI', 'WEB / AGENCY', 'FI_USER'), ph('tvr', 'TVR', 'WEB / AGENCY', 'TVR_USER'), ph('deviation', 'Deviation', 'WEB', 'DEVIATION_APPROVER'), ph('creditApproval', 'Credit Approval', 'WEB', 'CREDIT_APPROVER')],
    },
    {
      key: 'postSanction', name: 'Post-Sanction', platform: 'MOBILE', nc: true,
      subs: [ph('repayment', 'Repayment Details', 'MOBILE', 'SALES_OFFICER'), ph('dealStructure', 'Deal Structure', 'MOBILE', 'SALES_OFFICER'), ph('sanctionLetter', 'Sanction Letter', 'MOBILE', 'SALES_OFFICER'), ph('nach', 'NACH', 'MOBILE', 'SALES_OFFICER'), ph('disbursementDetails', 'Disbursement Details', 'MOBILE', 'SALES_OFFICER'), ph('nominee', 'Nominee Details', 'MOBILE', 'SALES_OFFICER'), ph('preDisbursementDocuments', 'Pre-Disbursement Documents', 'MOBILE', 'SALES_OFFICER')],
    },
    { key: 'operations', name: 'Operations', platform: 'WEB', nc: true, subs: [ph('qcMaker', 'QC Maker', 'WEB', 'QC_MAKER'), ph('qcChecker', 'QC Checker', 'WEB', 'QC_CHECKER')] },
    { key: 'disbursement', name: 'Disbursement', platform: 'WEB', nc: true, subs: [ph('disbursementUpdate', 'Disbursement Update', 'WEB', 'DISBURSEMENT_USER'), ph('authDone', 'Auth Done', 'WEB', 'AUTH_USER')] },
  ];
  const tr: TransSpec[] = [
    { from: 'login/leadCreation', to: 'login/mobileVerification', code: 'SUBMIT', label: 'Submit', outcome: 'SUBMIT', roles: ['SALES_OFFICER'], nc: true, src: 'Starter template' },
    { from: 'login/mobileVerification', to: 'login/kyc', code: 'VERIFY_OTP', label: 'Get OTP & Verify', outcome: 'SUBMIT', roles: ['SALES_OFFICER'], nc: true, src: 'Starter template' },
  ];
  const kycDocs = losDocuments('TW').filter((d) => d.sub === 'login/kyc').map((d) => ({ ...d, nc: true }));
  return buildSnapshot(stages, kycDocs, tr);
}
