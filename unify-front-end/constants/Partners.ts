import type { Partner, PartnerCategory } from '@/types/partner';
import { CATEGORY_ORDER } from '@/types/partner';

/**
 * Partner directory. Hardcoded for V1 (initial outreach stage).
 *
 * To add a partner: append to its category group, set active: true, bump
 * displayOrder. Add a `logo` require() when a real square symbol mark arrives
 * (the UI falls back to a monogram on the category accent until then).
 *
 * Migration note: when partner count reaches ~5 per category OR content edits
 * ship more than weekly, migrate to Sanity (the Partner shape maps 1:1). May
 * later merge into the Service Map `services` pipeline (DOCS/tickets/04-service-map.md).
 */
export const PARTNERS: Partner[] = [
  // ── Getting Settled ─────────────────────────────────────────────────────
  {
    slug: 'diversecity',
    name: 'DIVERSEcity',
    category: 'gettingSettled',
    partnershipType: 'resource',
    tagline:
      'Culturally safe programs across education, employment & wellbeing.',
    description:
      'DIVERSEcity Community Resources Society is a BC-registered charity (since 1978) that connects newcomers to culturally safe programs across education, employment, health, and wellbeing — the on-the-ground service arm for immigrant and refugee support in Greater Vancouver.',
    highlights: [
      'Culturally safe settlement programs',
      'Education, employment & health support',
      'Serving immigrants & refugees since 1978',
    ],
    serviceArea: 'Surrey and Delta',
    website: 'https://www.dcrs.ca/',
    eligibility:
      'Settlement services are open to permanent residents, refugees and protected persons through IRCC funding. Temporary residents, international students, naturalized citizens and refugee claimants are served through the BC Newcomer Services Program.',
    howToStart:
      'For settlement services, email newcomers@dcrs.ca or call 604-507-6060. General enquiries: 604-597-0205.',
    phone: '604-597-0205',
    email: 'info@dcrs.ca',
    address: '13455 76 Avenue, Surrey, BC V3W 2W3',
    languages: [
      'English',
      'French',
      'Spanish',
      'Arabic',
      'Burmese',
      'Farsi',
      'Hindi',
      'Korean',
      'Mandarin',
      'Punjabi',
    ],
    programs: [
      {
        id: 'diversecity-settlement-services',
        name: 'Settlement Services',
        description:
          'One-on-one work with a settlement worker to build a plan covering education, employment, housing and health.',
        eligibility:
          'Permanent residents, refugees and protected persons through IRCC funding; temporary residents, international students, naturalized citizens and refugee claimants through the BC Newcomer Services Program.',
        cost: 'free',
        url: 'https://www.dcrs.ca/our-services/settlement-services/',
      },
      {
        id: 'diversecity-linc',
        name: 'English Classes (LINC)',
        description:
          'Free English classes for new immigrants, from pre-literacy to CLB 4. A language assessment comes first.',
        cost: 'free',
        url: 'https://www.dcrs.ca/our-services/english-language-programs/language-instruction-for-newcomers-to-canada-linc/',
      },
      {
        id: 'diversecity-safe-haven',
        name: 'Safe Haven Program',
        description:
          'Settlement, employment, language and counselling support for refugee claimants who cannot use federally funded services.',
        eligibility:
          'Refugee claimants in Surrey and Delta who are not eligible for federally funded settlement services.',
        cost: 'free',
        url: 'https://www.dcrs.ca/our-services/settlement-services/services-for-non-permanent-residents/safe-haven-program/',
      },
      {
        id: 'diversecity-rise',
        name: 'RISE Program',
        description:
          'One-on-one help and group workshops for refugees, covering community connection, Canadian systems, housing and employment.',
        url: 'https://www.dcrs.ca/our-services/programs-for-refugees/',
      },
      {
        id: 'diversecity-employment-programs',
        name: 'Employment Programs',
        description:
          'Job readiness and self-employment support, including EVolve Skills, Future Leaders, H.E.A.L. for Work and the Diverse Entrepreneurs Business Incubator.',
        url: 'https://www.dcrs.ca/our-services/employment-programs/',
      },
      {
        id: 'diversecity-early-childhood-education',
        name: 'Childminding During LINC',
        description:
          'Free care for children 18 months to five years while a parent attends English classes.',
        cost: 'free',
        url: 'https://www.dcrs.ca/our-services/english-language-programs/early-childhood-education-program/',
      },
      {
        id: 'diversecity-mental-health-and-substance-use-services',
        name: 'Mental Health and Substance Use Services',
        description:
          'Counselling and support. Intake: 604-547-1202, intake@dcrs.ca.',
        url: 'https://www.dcrs.ca/our-services/mental-health-and-substance-use-services/',
      },
      {
        id: 'diversecity-language-testing-centre-celpip',
        name: 'Language Testing Centre (CELPIP)',
        description:
          'CELPIP language testing for immigration and citizenship applications.',
        url: 'https://www.dcrs.ca/our-services/celpip/',
      },
    ],
    logo: require('@/assets/images/partners/diversecity.png'),
    displayOrder: 0,
    active: true,
  },
  {
    slug: 'burnaby-neighbourhood-house',
    name: 'Burnaby Neighbourhood House',
    category: 'gettingSettled',
    partnershipType: 'resource',
    tagline: 'Community programs, childcare, and newcomer support in Burnaby.',
    description:
      'Burnaby Neighbourhood House helps people enhance their lives and strengthen their community through programs built around the changing needs of a diverse population — childcare, family and food security, and dedicated newcomer support.',
    highlights: [
      'Newcomer settlement support',
      'Childcare & family programs',
      'Food security initiatives',
    ],
    serviceArea: 'Burnaby',
    website: 'https://burnabynh.ca/',
    eligibility:
      'Settlement services are funded by IRCC and, in line with its requirements, focus on permanent residents and convention refugees. Community, food and childcare programs are open to everyone.',
    howToStart:
      'Call or email the nearest house. For settlement services, contact settlementprogram@burnabynh.ca or 604-431-0400.',
    phone: '(604) 431-0400',
    email: 'receptiona@burnabynh.ca',
    address: '#100 – 4460 Beresford St, Burnaby, BC V5H 0B8',
    hours:
      'South House Mon–Fri 9:00am–5:00pm · North House Mon–Fri 9:30am–4:30pm · Brentwood House Mon–Fri 9:00am–4:00pm',
    languages: [
      'English',
      'Mandarin',
      'Filipino (Tagalog)',
      'Farsi',
      'Dari',
      'Pashto',
      'Spanish',
      'Arabic',
      'Kurdish',
    ],
    programs: [
      {
        id: 'burnaby-neighbourhood-house-newcomers-settlement-services',
        name: 'Newcomers Settlement Services',
        description:
          'Settlement plans, benefit applications, language support and community connections.',
        eligibility:
          'Funded by IRCC and, in accordance with their requirements, focused on supporting permanent residents and convention refugees.',
        url: 'https://burnabynh.ca/programs-and-services/newcomers-settlement-services/',
      },
      {
        id: 'burnaby-neighbourhood-house-information-and-orientation',
        name: 'Information and Orientation',
        description:
          'Plain-language information for newcomers, one-on-one, as a family, or in a group workshop.',
        url: 'https://burnabynh.ca/programs-and-services/newcomers-settlement-services/',
      },
      {
        id: 'burnaby-neighbourhood-house-naars',
        name: 'Needs and Asset Assessment (NAARS)',
        description:
          'Wrap-around settlement support in your first language and in English, including help applying for benefits.',
        url: 'https://burnabynh.ca/programs-and-services/newcomers-settlement-services/',
      },
      {
        id: 'burnaby-neighbourhood-house-community-connections',
        name: 'Community Connections',
        description:
          'Volunteering, youth and women’s programs, English conversation circles, and workshops on health, work and education.',
        url: 'https://burnabynh.ca/programs-and-services/newcomers-settlement-services/',
      },
      {
        id: 'burnaby-neighbourhood-house-food-security',
        name: 'Food Security Programs',
        description:
          'Food access programs, alongside Burnaby Meals on Wheels.',
        url: 'https://burnabynh.ca/programs-and-services/community-program/food-security-programs/',
      },
      {
        id: 'burnaby-neighbourhood-house-child-care',
        name: 'Child Care Programs',
        description:
          'Licensed care for ages 0–12: early years, preschool, school age, afterschool and summer day camp.',
        url: 'https://burnabynh.ca/programs-and-services/child-care-programs/',
      },
      {
        id: 'burnaby-neighbourhood-house-volunteer-income-tax-program',
        name: 'Volunteer Income Tax Program',
        description: 'Free help filing your income tax return.',
        url: 'https://burnabynh.ca/programs-and-services/community-program/volunteer-income-tax-program/',
      },
    ],
    logo: require('@/assets/images/partners/burnaby-neighbourhood-house.png'),
    displayOrder: 1,
    active: true,
  },
  {
    slug: 'ymca-bc',
    name: 'YMCA BC',
    category: 'gettingSettled',
    partnershipType: 'resource',
    tagline: 'Programs for families, children, and seniors across BC.',
    description:
      'YMCA BC supports families, children, and seniors in communities across British Columbia, building vibrant and healthy communities with a shared sense of social responsibility where people can thrive in spirit, mind, and body.',
    highlights: [
      'Programs for all ages',
      'Health & wellness focus',
      'Communities across BC',
    ],
    serviceArea: 'British Columbia',
    website: 'https://www.ymcabc.ca/',
    cost: 'mixed',
    howToStart:
      'Email the newcomer team at newcomers@ymcabc.ca to enrol before your first session. General employment enquiries go to employment.services@ymcabc.ca, or call 604-681-9622.',
    phone: '604-681-9622',
    email: 'information.request@ymcabc.ca',
    // Head office. The newcomer programs themselves run at the Robert Lee YMCA
    // in downtown Vancouver.
    address: '620 Royal Ave #10, New Westminster, BC V3M 1J2',
    hours: 'Mon–Fri 8:30am–4:30pm',
    programs: [
      {
        id: 'ymca-bc-english-conversation-club',
        name: 'English Conversation Club for Newcomers',
        description:
          'A weekly club at the Robert Lee YMCA in downtown Vancouver where newcomers practise English with trained facilitators.',
        eligibility:
          'All immigration statuses except visitor visas. You must be legally able to work in Canada. Temporary foreign workers should ask the team about separate sessions.',
        cost: 'free',
        url: 'https://www.ymcabc.ca/employment-and-newcomers/english-conversation-club',
      },
      {
        id: 'ymca-bc-citizenship-test-prep',
        name: 'Prepare for the Canadian Citizenship Test',
        description:
          'A hybrid group program that works through the Discover Canada guide with a facilitator and practice questions. Four sessions a year.',
        eligibility: 'All immigration statuses except visitor visas.',
        cost: 'free',
        url: 'https://www.ymcabc.ca/employment-and-newcomers/canadian-citizenship-preparation',
      },
      {
        id: 'ymca-bc-connect2work',
        name: 'Connect2Work for Newcomers',
        description:
          'Workshops that bridge settlement and employment: job skills, confidence, and connections in the local job market.',
        cost: 'free',
        url: 'https://www.ymcabc.ca/employment-and-newcomers',
      },
      {
        id: 'ymca-bc-international-students-employment-support',
        name: 'International Students Employment Support',
        description:
          'Free program to help international students overcome employment barriers in Canada.',
        cost: 'free',
        url: 'https://www.ymcabc.ca/employment-and-newcomers/international-students-employment-support',
      },
      {
        id: 'ymca-bc-self-employment-program',
        name: 'Self Employment Program',
        description:
          'A 48-week funded program: 10 weeks writing a business plan, then 38 weeks of launch support with a case manager.',
        eligibility:
          '18 or older; eligible to work in Canada; unemployed or working under 20 hours a week; applied for or received EI in the last five years, or receiving PWD/PPMB benefits; living in the Lower Mainland, Squamish or Sechelt; and you need a specific business idea.',
        cost: 'free',
        url: 'https://www.ymcabc.ca/employment-and-newcomers/self-employment-program',
      },
      {
        id: 'ymca-bc-explore-child-care-career',
        name: 'Explore Child Care as a Career',
        description:
          'A short course for newcomers on child care careers, the credentials needed, and how to get into the field.',
        cost: 'free',
        url: 'https://www.ymcabc.ca/employment-and-newcomers/explore-career-in-childcare-newcomers-program',
      },
      {
        id: 'ymca-bc-wellness-connection',
        name: 'Wellness Connection for Newcomers',
        description:
          'A supportive space that welcomes newcomers and promotes good health.',
        url: 'https://www.ymcabc.ca/employment-and-newcomers/wellness-connection-newcomers',
      },
    ],
    logo: require('@/assets/images/partners/ymca-bc.png'),
    displayOrder: 2,
    active: true,
  },
  // ── Find Work ───────────────────────────────────────────────────────────
  {
    slug: 'iec-bc',
    name: 'Immigrant Employment Council of BC',
    category: 'findWork',
    partnershipType: 'resource',
    tagline: 'Helping BC employers hire and retain immigrant talent.',
    description:
      'The Immigrant Employment Council of BC works on the employer side of immigrant integration — helping BC businesses recruit, hire, and retain skilled immigrant talent through mentorship programs, job boards, and employer education.',
    highlights: [
      'Mentorship programs',
      'Job boards for newcomers',
      'Employer education',
    ],
    serviceArea: 'British Columbia',
    website: 'https://iecbc.ca/',
    cost: 'free',
    howToStart:
      'Register online through the TalentConnect form, or contact the office by phone or email. Each program has its own registration form.',
    phone: '(604) 629-5364',
    email: 'employerengagement@iecbc.ca',
    address: '720 – 750 West Pender St, Vancouver, BC V6C 2T7',
    programs: [
      {
        id: 'iec-bc-talentconnect',
        name: 'TalentConnect',
        description:
          'A free profile that shows BC employers your skills, education and experience, plus access to job postings and networking events.',
        eligibility:
          'Newcomers with a work permit (except temporary foreign workers), and people approved for immigration who have not yet landed. You must be available for work and living in BC, or willing to move there.',
        cost: 'free',
        url: 'https://iecbc.ca/for-talent/connect-with-employers/',
      },
      {
        id: 'iec-bc-mentorconnect',
        name: 'MentorConnect',
        description:
          'Occupation-specific mentoring that pairs you with an established local professional for up to 12 hours over two months.',
        eligibility:
          'Newcomers to Canada within the past 10 years who are eligible to work and have a job-ready resume. You must be in BC or planning to move to BC.',
        cost: 'free',
        url: 'https://iecbc.ca/mentorconnect/',
      },
      {
        id: 'iec-bc-ascend',
        name: 'ASCEND',
        description:
          'Online, self-paced learning to build the workplace soft skills Canadian employers look for (English & French).',
        cost: 'free',
        url: 'https://ascendemployment.com/participants/',
      },
      {
        id: 'iec-bc-fast',
        name: 'FAST',
        description:
          'Helps newcomers see how their experience and training meet Canadian standards, with career-prep streams by field.',
        eligibility:
          'Permanent residents or people approved in principle for PR, refugees, international students, skilled immigrants with a valid work permit, and Canadian citizens.',
        cost: 'free',
        url: 'https://fastcanada.ca/',
      },
    ],
    displayOrder: 0,
    active: true,
  },
  {
    slug: 'newcomer-jobs-canada',
    name: 'Newcomer Jobs Canada',
    category: 'findWork',
    partnershipType: 'resource',
    tagline: 'A job board built for newcomers to Canada.',
    description:
      'Newcomer Jobs Canada is a commercial national job board that matches new Canadians with employers. It is a listings site rather than a settlement agency: there is no BC office and no in-person service. Employers pay to post; creating a job-seeker account is free.',
    highlights: [
      'Newcomer-focused job board',
      'Opportunities across Canada',
      'Easier job search for new arrivals',
    ],
    serviceArea: 'Canada',
    website: 'https://newcomerjobscanada.ca/',
    cost: 'mixed',
    howToStart:
      'Create a free account online, upload your resume and apply for jobs on the website.',
    phone: '(306) 229-6774',
    hours: 'Mon–Fri 9:00am–5:00pm CST',
    logo: require('@/assets/images/partners/newcomer-jobs-canada.png'),
    displayOrder: 1,
    active: true,
  },
  // ── Immigration Help ────────────────────────────────────────────────────
  // Copy, programs, languages and cost supplied by the partner by email on
  // 2026-09-18 (Vicky Guo, Operations & Process Lead). The slug predates the
  // rename and stays put — it is the analytics and route key. Program links
  // go to the partner's own English site, not the /unify/ referral page.
  {
    slug: 'canada-shaw-immigration',
    name: 'Canada Shaws Consulting Inc.',
    category: 'immigrationHelp',
    partnershipType: 'referral',
    tagline: 'Licensed RCICs, Canadian immigration & visa service experts.',
    description:
      'Established in 2015 and based in Richmond, British Columbia, Canada Shaws Consulting Inc. is a member of Shaws Global Brand Group. Its immigration consultants are licensed by the College of Immigration and Citizenship Consultants (CICC), Canada’s regulatory body for immigration and citizenship consultants.\n\nCanada Shaws provides comprehensive support across a wide range of Canadian immigration programs, as well as study permits, work permits, and business and investment pathways. Together with its sister companies under Shaws Global Brand Group, it also offers business consulting, investment advisory, global immigration services, residency and citizenship planning, education planning, and career planning. The firm helps clients worldwide navigate their options and build personalized plans for their future, with services available in English, Filipino (Tagalog), Persian (Farsi), Mandarin, and Cantonese.',
    highlights: [
      'CICC-licensed consultants',
      'Study, work, PR & visa pathways',
      'Service in five languages',
    ],
    serviceArea: 'Richmond',
    // Affiliate link supplied by the partner; deliberately unlabelled in the
    // UI and opened by the standard Website button.
    website: 'https://www.immshaws.com/unify/',
    ctaLabelKey: 'learn.resources.cta.bookIntroMeeting',
    cost: 'mixed',
    howToStart:
      'Book a free introductory session to discuss your needs and learn about their services.',
    phone: '+1 672-867-6886',
    email: 'info@canadashaws.com',
    address: '308-5811 Cooney Rd, Richmond, BC V6X 3M1',
    hours: 'Mon–Fri 9:00am–6:00pm · Closed weekends',
    languages: [
      'English',
      'Filipino (Tagalog)',
      'Persian (Farsi)',
      'Mandarin',
      'Cantonese',
    ],
    programs: [
      {
        id: 'canada-shaw-immigration-study-in-canada',
        name: 'Study in Canada',
        description:
          'Explore educational opportunities in Canada with personalized guidance on school applications, study permits, and — where eligible — part-time work during your studies and potential pathways to permanent residency after graduation.',
        url: 'https://canadashaws.ca/study-abroad-in-canada/',
      },
      {
        id: 'canada-shaw-immigration-work-in-canada',
        name: 'Work in Canada',
        description:
          'Navigate Canadian work permit options with professional support tailored to your career goals.',
        url: 'https://canadashaws.ca/work-in-canada/',
      },
      {
        id: 'canada-shaw-immigration-permanent-residency',
        name: 'Canadian Permanent Residency',
        description:
          'Explore permanent residency pathways tailored to your qualifications, experience, and long-term goals in Canada.',
        url: 'https://canadashaws.ca/immigrate-to-canada/',
      },
      // No page on canadashaws.ca for visas/extensions or the citizenship +
      // PRTD + ATIP bundle (checked 2026-09-18), so these two stay display-only.
      {
        id: 'canada-shaw-immigration-visas-extensions',
        name: 'Visas & Extensions',
        description:
          'Get assistance with visa applications, permit extensions, and maintaining your temporary resident status in Canada.',
      },
      {
        id: 'canada-shaw-immigration-other-services',
        name: 'Other Services',
        description:
          'Access support with citizenship applications, document amendments, Permanent Resident Travel Documents (PRTDs), Access to Information and Privacy (ATIP) requests, and other services.',
      },
    ],
    logo: require('@/assets/images/partners/canada-shaw-immigration.png'),
    lastVerified: '2026-09-18',
    displayOrder: 0,
    active: true,
  },
  // HELD INACTIVE — unverifiable. Its About page publishes "MEMBER ID:
  // R123456", a template placeholder, names no consultant, and carries another
  // firm's copy ("Maple Leaf Visas"). A paid representative who is not
  // CICC-registered is acting illegally, and this audience is who that harms.
  // Re-activate only once someone confirms the business by phone and against
  // college-ic.ca. Tracked in .design/state.json.
  {
    slug: 'global-connect-immigration',
    name: 'Global Connect Immigration',
    category: 'immigrationHelp',
    partnershipType: 'referral',
    tagline: 'Registered consultancy for PR, visas, and settlement.',
    description:
      'Global Connect is a registered Canadian immigration consulting firm helping newcomers navigate permanent residency pathways, visa processes, and settlement planning with expert, personalized guidance.',
    highlights: [
      'PR pathway guidance',
      'Visa & work-permit support',
      'Personalized settlement planning',
    ],
    serviceArea: 'Surrey',
    website: 'https://globalconnectmigration.com/',
    cost: 'paid',
    howToStart: 'Phone, email, or book a consultation through the website.',
    phone: '+1 (604) 495-1927',
    email: 'info@globalconnectmigration.com',
    address: '8556 120th Street, Unit 208, Surrey, BC V3W 3N5',
    programs: [
      {
        id: 'global-connect-immigration-family-sponsorship',
        name: 'Family Sponsorship',
        description:
          'Help sponsoring a spouse, partner, children or parents for permanent residency.',
      },
    ],
    logo: require('@/assets/images/partners/global-connect-immigration.png'),
    displayOrder: 1,
    active: false,
  },
  // ── Libraries & Learning ────────────────────────────────────────────────
  {
    slug: 'burnaby-public-library',
    name: 'Burnaby Public Library',
    category: 'librariesLearning',
    partnershipType: 'resource',
    tagline: 'Inclusive spaces to gather, learn, and play.',
    description:
      'Burnaby Public Library creates inclusive spaces where people can gather, learn, and play across four branches — free programs, resources, and places to connect.',
    highlights: [
      'Free programs & resources',
      '4 branches across Burnaby',
      'Welcoming spaces to learn',
    ],
    serviceArea: 'Burnaby · 4 branches',
    website: 'https://bpl.bc.ca/',
    ctaLabelKey: 'learn.resources.cta.joinLibrary',
    cost: 'free',
    eligibility:
      'Membership is free for anyone who lives in Burnaby or the surrounding InterLINK area. No identification is required to open an account, and you can use the name of your choice. Special memberships cover people living elsewhere in BC and outside BC.',
    howToStart:
      'Walk in to the service desk at any of the four locations, or call 604-436-5400, and staff will open your account and give you a card you can use straight away.',
    phone: '604-436-5400',
    email: 'eref@bpl.bc.ca',
    address: '6100 Willingdon Ave, Burnaby, BC V5H 4N5 (Bob Prittie Metrotown)',
    hours: 'Mon–Thu 10:00am–8:00pm · Fri–Sun 10:00am–6:00pm',
    programs: [
      {
        id: 'burnaby-public-library-become-a-member',
        name: 'Become a Member',
        description:
          'Staff open your account at any service desk and give you a card the same day. No identification needed, and an existing card from another library can be linked.',
        eligibility:
          'Free for anyone who lives in Burnaby or the surrounding InterLINK area.',
        cost: 'free',
        url: 'https://bpl.bc.ca/people-help/welcome-desk/become-a-member',
      },
      {
        id: 'burnaby-public-library-english-conversation-circle',
        name: 'English Conversation Circle',
        description:
          'Practise English and meet people in a relaxed group. A librarian leads the discussion. Runs in branches and on Zoom.',
        eligibility: 'Ages 18 and over. Some English is recommended.',
        cost: 'free',
        url: 'https://bpl.bc.ca/things-to-borrow/learning-english',
      },
      {
        id: 'burnaby-public-library-learning-english',
        name: 'Learning English',
        description:
          'Books, CDs and DVDs at every level, study guides for IELTS, TOEIC, TOEFL and CELPIP, and free online courses including Mango Languages and Road to IELTS.',
        cost: 'free',
        url: 'https://bpl.bc.ca/things-to-borrow/learning-english',
      },
      {
        id: 'burnaby-public-library-arrivals-in-english',
        name: 'Arrivals in English',
        description:
          'A free online course built around the everyday English newcomers need while settling into life in Canada.',
        cost: 'free',
        url: 'https://bpl.bc.ca/things-to-use/digital-resources/arrivals-in-english',
      },
      {
        id: 'burnaby-public-library-services-for-immigrants-newcomers',
        name: 'Services for Immigrants & Newcomers',
        description:
          'A staff-maintained directory of Burnaby-area services by need — citizenship preparation, work, English — with each organization’s contact details and eligibility.',
        cost: 'free',
        url: 'https://bpl.bc.ca/people-help/information-community-resources/services-for-immigrants',
      },
      {
        id: 'burnaby-public-library-summer-reading-club',
        name: 'Summer Reading Club',
        description: 'Free summer reading program for children of all ages.',
        cost: 'free',
      },
    ],
    logo: require('@/assets/images/partners/burnaby-public-library.png'),
    displayOrder: 0,
    active: true,
  },
  {
    slug: 'surrey-libraries',
    name: 'Surrey Libraries',
    category: 'librariesLearning',
    partnershipType: 'resource',
    tagline: 'Sparking curiosity and lifelong learning.',
    description:
      'Surrey Libraries connects people, sparks curiosity, and inspires lifelong learning to enhance the lives of Surrey residents across ten branches.',
    highlights: [
      'Free lifelong-learning programs',
      '10 branches across Surrey',
      'Connecting the community',
    ],
    serviceArea: 'Surrey · 10 branches',
    website: 'https://www.surreylibraries.ca/',
    ctaLabelKey: 'learn.resources.cta.visitWelcomeCentre',
    cost: 'free',
    eligibility:
      'You can become a member if you live in Surrey or a neighbouring InterLINK community. Newcomer library services are free at every branch.',
    howToStart:
      'Visit the Newcomer Welcome Centre at City Centre Branch, Level 4 — 604-590-7847 or library-newcomers@surrey.ca.',
    phone: '604-590-7847',
    email: 'library-newcomers@surrey.ca',
    address:
      'City Centre Branch, 10350 University Drive, Surrey, BC V3T 4B8 (Welcome Centre on Level 4)',
    hours:
      'Newcomer Welcome Centre: Mon–Thu 10:00am–9:00pm · Fri–Sun 10:00am–5:00pm',
    programs: [
      {
        id: 'surrey-libraries-newcomer-welcome-centre',
        name: 'Newcomer Welcome Centre',
        description:
          'A dedicated space on Level 4 of City Centre. Staff help with library cards, City of Surrey and community services, English questions and job searching. Holds world-language books, dictionaries, IELTS material and computers.',
        cost: 'free',
        url: 'https://www.surreylibraries.ca/newcomer-centre',
      },
      {
        id: 'surrey-libraries-free-settlement-services-for-newcomers',
        name: 'Free Settlement Services for Newcomers',
        description:
          'Settlement workers from Options, DIVERSEcity, PICS and S.U.C.C.E.S.S. hold sessions in branches — job searching, English classes, citizenship exam prep, benefits, school registration.',
        eligibility:
          'No status restriction is stated. Services are delivered by partner agencies — call ahead to confirm times and locations.',
        cost: 'free',
        url: 'https://www.surreylibraries.ca/free-settlement-services-newcomers',
      },
      {
        id: 'surrey-libraries-english-language-learners',
        name: 'English Language Learners Programs',
        description:
          'Book clubs and conversation circles where you practise English in a friendly group. Sessions run across the branches.',
        cost: 'free',
        url: 'https://www.surreylibraries.ca/english-language-learners-programs',
      },
      {
        id: 'surrey-libraries-newcomer-teen-social-club',
        name: 'Newcomer Teen Social Club',
        description:
          'A monthly club where newcomer teens make friends and practise speaking English around a different topic each month.',
        cost: 'free',
        url: 'https://www.surreylibraries.ca/newcomer-teen-social-club-0',
      },
      {
        id: 'surrey-libraries-get-a-library-card',
        name: 'Get a Library Card',
        description:
          'Free for anyone living in Surrey or a neighbouring InterLINK community. Bring ID showing your name, photo and address, or two pieces of ID. Surrey residents can start online with a 90-day digital card.',
        eligibility:
          'You can become a member if you live in Surrey or a neighbouring InterLINK community.',
        cost: 'free',
        url: 'https://www.surreylibraries.ca/get-library-card',
      },
      {
        id: 'surrey-libraries-books-in-world-languages',
        name: 'Books in World Languages',
        description:
          'Collections in languages other than English, with a list of which languages each branch holds.',
        cost: 'free',
        url: 'https://www.surreylibraries.ca/books-media/books-world-languages',
      },
      {
        id: 'surrey-libraries-technology-help',
        name: 'Technology Help',
        description:
          'Drop-in and one-on-one sessions on computers, the internet, phones, tablets and eReaders.',
        cost: 'free',
        url: 'https://www.surreylibraries.ca/technology-help',
      },
    ],
    logo: require('@/assets/images/partners/surrey-libraries.png'),
    displayOrder: 1,
    active: true,
  },
  {
    slug: 'vancouver-public-library',
    name: 'Vancouver Public Library',
    category: 'librariesLearning',
    partnershipType: 'resource',
    tagline: 'Free places to discover, create, and share.',
    description:
      'Vancouver Public Library has served the lifelong learning, reading, and information needs of Vancouver residents for over 100 years across 21 branches — free places for everyone to discover, create, and share ideas and information.',
    highlights: [
      'Free for all residents',
      '21 branches across Vancouver',
      '100+ years serving the city',
    ],
    serviceArea: 'Vancouver · 21 branches',
    website: 'https://www.vpl.ca/',
    ctaLabelKey: 'learn.resources.cta.joinLibrary',
    cost: 'free',
    eligibility:
      'A free library card is for anyone who lives in or owns property in the City of Vancouver, and for residents of the University Endowment Lands, UBC neighbourhoods and UBC family housing. Programs and events are open to everyone.',
    howToStart:
      'Walk in to any branch with identification to register for a card, or register online for a temporary digital card. You can also call 604-331-3603 or email info@vpl.ca.',
    phone: '604-331-3603',
    email: 'info@vpl.ca',
    address: 'Central Library, 350 West Georgia St, Vancouver, BC V6B 6B1',
    hours:
      'Central: Mon–Thu 9:30am–8:30pm · Fri 9:30am–6:00pm · Sat 10:00am–6:00pm · Sun 11:00am–6:00pm',
    programs: [
      {
        id: 'vancouver-public-library-get-a-library-card',
        name: 'Get a Library Card',
        description:
          'Register at any branch with ID, or online for a temporary digital card. A PR card, Confirmation of Permanent Residence, or a visa or work permit issued for six months or more is accepted, with proof of a Vancouver address.',
        eligibility:
          'Free for people who live in or own property in the City of Vancouver.',
        cost: 'free',
        url: 'https://www.vpl.ca/borrowing/library-card',
      },
      {
        id: 'vancouver-public-library-esl-conversation-practice',
        name: 'ESL Conversation Practice',
        description:
          'Conversation circles where English learners meet, practise and make friends. Most sessions are drop-in with no registration.',
        eligibility: 'Best suited to intermediate English speakers.',
        cost: 'free',
        url: 'https://www.vpl.ca/programs/esl-conversation-practice',
      },
      {
        id: 'vancouver-public-library-immigration-and-settlement-guide',
        name: 'Immigration and Settlement Guide',
        description:
          'A staff-maintained guide covering immigrating to Canada, settlement services, refugee support, finding work, learning English and translation services.',
        cost: 'free',
        url: 'https://www.vpl.ca/guides/immigration-and-settlement',
      },
      {
        id: 'vancouver-public-library-translation-services-guide',
        name: 'Translation Services Guide',
        description:
          'A list of translation and interpretation services, including DIVERSEcity, ISSofBC, MOSAIC and the Society of Translators and Interpreters of BC.',
        cost: 'free',
        url: 'https://www.vpl.ca/guides/immigration-and-settlement/translation-services',
      },
      {
        id: 'vancouver-public-library-clarity-english',
        name: 'Clarity English',
        description:
          'A free online language-learning resource with interactive activities, practice tests and grammar help.',
        cost: 'free',
        url: 'https://www.vpl.ca/digital-library/clarity-english-language-learning',
      },
      {
        id: 'vancouver-public-library-world-languages-collection',
        name: 'World Languages Collection',
        description:
          'Reading for adults, teens and children in sixteen languages other than English. Branch collections follow their neighbourhoods; Central carries the full range.',
        cost: 'free',
        url: 'https://www.vpl.ca/borrowing/world-languages',
      },
    ],
    logo: require('@/assets/images/partners/vancouver-public-library.png'),
    displayOrder: 2,
    active: true,
  },
  // ── Community & Belonging ───────────────────────────────────────────────
  {
    slug: 'big-brothers-big-sisters',
    name: 'Big Brothers Big Sisters',
    category: 'communityBelonging',
    partnershipType: 'resource',
    tagline: 'Life-changing mentoring for young people.',
    description:
      'Big Brothers Big Sisters matches children and teens with caring adult mentors. In this region the local agency is Big Brothers of Greater Vancouver, which runs the community, in-school and group mentoring programs listed here. Other parts of Canada are served by their own local agencies.',
    highlights: [
      '1:1 youth mentoring',
      "Supporting children's wellbeing",
      'Caring adult role models',
    ],
    serviceArea: 'Greater Vancouver',
    website: 'https://www.bigbrothersvancouver.com/',
    // Contact points at the Greater Vancouver agency rather than the Toronto
    // national office, because that is the agency a person here would apply to.
    // National office: 905-639-0461 / 1-800-263-9133.
    howToStart:
      'In Greater Vancouver, apply through Big Brothers of Greater Vancouver: application form, guardian information session, family interview and pre-match training, then a waitpool for matching. Elsewhere, use the "Find an agency near you" locator on the national website.',
    phone: '604-876-2447',
    email: 'officeadmin@bbgvf.com',
    programs: [
      {
        id: 'big-brothers-big-sisters-community-mentoring',
        name: 'Big Brothers Community Mentoring',
        description:
          'One-to-one mentoring in your own community. Mentors commit to a weekly 2–4 hour outing for a year.',
        url: 'https://www.bigbrothersvancouver.com/our-programs/big-brothers/',
      },
      {
        id: 'big-brothers-big-sisters-in-school-mentoring',
        name: 'In-School Mentoring',
        description:
          'One-to-one mentoring during the school day — a mentor visits for an hour a week through the school year.',
        url: 'https://www.bigbrothersvancouver.com/our-programs/in-school-mentor/',
      },
      {
        id: 'big-brothers-big-sisters-teen-mentoring',
        name: 'Teen Mentoring',
        description:
          'Secondary students mentor elementary students for an hour a week after school, with a youth leadership component.',
        url: 'https://www.bigbrothersvancouver.com/our-programs/teen-mentor/',
      },
      {
        id: 'big-brothers-big-sisters-mentoring-with-math',
        name: 'Mentoring with Math',
        description:
          'Tutoring plus mentorship to build confidence in maths, for families who cannot afford paid tutoring. Supplies are included.',
        cost: 'free',
        url: 'https://www.bigbrothersvancouver.com/our-programs/mentoring-math/',
      },
      {
        id: 'big-brothers-big-sisters-game-on',
        name: 'Game On!',
        description:
          'A group program on healthy choices through physical activity and life-skills discussion. 90 minutes a week for 8–10 weeks.',
        url: 'https://www.bigbrothersvancouver.com/our-programs/game-on/',
      },
      {
        id: 'big-brothers-big-sisters-roots-mentoring',
        name: 'Roots Mentoring',
        description:
          'Mentoring that celebrates Indigenous cultures, with learning from Indigenous community leaders.',
        url: 'https://www.bigbrothersvancouver.com/our-programs/roots/',
      },
    ],
    logo: require('@/assets/images/partners/big-brothers-big-sisters.png'),
    displayOrder: 0,
    active: true,
  },
  {
    slug: 'united-way-bc',
    name: 'United Way BC',
    category: 'communityBelonging',
    partnershipType: 'resource',
    tagline: 'Support for the people who need it most across BC.',
    description:
      "United Way BC serves over five million British Columbians, delivering resources and support where they're needed most — emergency response, children & youth, seniors, poverty, mental health, and food security.",
    highlights: [
      'Emergency & poverty support',
      'Programs for children, youth & seniors',
      'Mental health & food security',
    ],
    serviceArea: 'British Columbia',
    website: 'https://uwbc.ca/',
    howToStart:
      'For help finding a service, call or text 2-1-1 — free and confidential. For questions about United Way BC itself, call 604-294-8929 or email info@uwbc.ca.',
    phone: '604-294-8929',
    email: 'info@uwbc.ca',
    address: '4543 Canada Way, Burnaby, BC V5G 4T4',
    hours: 'Mon–Fri 8:30am–4:30pm (closed 12:00–1:00pm)',
    programs: [
      {
        id: 'united-way-bc-211',
        name: '211 British Columbia',
        description:
          'Dial or text 2-1-1 for free, confidential referral to community, government and social services. Interpretation in over 240 languages and dialects.',
        cost: 'free',
        url: 'https://bc.211.ca',
      },
      {
        id: 'united-way-bc-bc-safe-haven-program',
        name: 'BC Safe Haven Program',
        description:
          'Supports refugee claimants through volunteer mobilisations and public appeals for housing and services.',
        eligibility: 'Refugee claimants.',
        url: 'https://uwbc.ca/program/bc-safe-haven/',
      },
      {
        id: 'united-way-bc-food-security',
        name: 'Food Security',
        description:
          'Programs that improve access to healthy food for people facing food insecurity across BC.',
        url: 'https://uwbc.ca/program/food-security/',
      },
      {
        id: 'united-way-bc-transit-assistance',
        name: 'Emergency Transit Assistance Program',
        description:
          'Transit vouchers so people in need can travel by bus at no cost.',
        url: 'https://uwbc.ca/program/transit-assistance-program/',
      },
      {
        id: 'united-way-bc-better-at-home',
        name: 'Better at Home',
        description:
          'Non-medical help for seniors — groceries, housekeeping and social connection — in 260+ communities.',
        url: 'https://betterathome.ca',
      },
      {
        id: 'united-way-bc-school-s-out',
        name: "School's Out",
        description:
          'Before- and after-school programs with nutritious meals and developmental support during the school year.',
        eligibility: 'Ages 6–12.',
        url: 'https://uwbc.ca/stories/program/schools-out/',
      },
      {
        id: 'united-way-bc-work-experience-opportunities-grant',
        name: 'Work Experience Opportunities Grant',
        description: 'Skills and job training supports.',
        eligibility:
          'People receiving income assistance or disability assistance.',
      },
      {
        id: 'united-way-bc-youth-futures-education-fund',
        name: 'Youth Futures Education Fund',
        description: 'Low-barrier funding for education.',
        eligibility: 'Youth formerly in government care.',
      },
    ],
    logo: require('@/assets/images/partners/united-way-bc.png'),
    displayOrder: 1,
    active: true,
  },
  {
    slug: 'trout-lake-community-centre',
    name: 'Trout Lake Community Centre',
    category: 'communityBelonging',
    partnershipType: 'resource',
    tagline: '200+ programs for people of all ages.',
    description:
      'Trout Lake Community Centre offers more than 200 programs for people of all ages — a welcoming neighbourhood hub in East Vancouver run in partnership with the Vancouver Park Board.',
    highlights: [
      '200+ community programs',
      'Activities for all ages',
      'A neighbourhood gathering place',
    ],
    serviceArea: 'Vancouver',
    website: 'https://troutlakecc.com/',
    cost: 'mixed',
    howToStart:
      'Drop in and ask at the front desk, call 604-257-6955, or register online through the City of Vancouver recreation system.',
    phone: '604-257-6955',
    email: 'troutlakecc@vancouver.ca',
    address: '3360 Victoria Dr, Vancouver, BC V5N 4M4',
    // The office and front desk close 30 minutes before the building does.
    hours: 'Mon–Fri 9:00am–9:00pm · Sat–Sun 8:00am–4:00pm',
    programs: [
      {
        id: 'trout-lake-community-centre-leisure-access-program-lap',
        name: 'Leisure Access Program (LAP)',
        description:
          'City of Vancouver subsidy giving up to 50% off program and fitness centre fees.',
        eligibility:
          'Low-income Vancouver residents holding a valid leisure access card.',
      },
      {
        id: 'trout-lake-community-centre-tlcca-program-cost-assistance',
        name: 'TLCCA Program Cost Assistance',
        description:
          'Help with program fees for community members in financial need.',
        eligibility:
          'Community members in financial need who are not eligible for LAP.',
        url: 'https://troutlakecc.com/programs/',
      },
      {
        id: 'trout-lake-community-centre-adaptive-programs',
        name: 'Adaptive Programs',
        description: 'Inclusive activities for all ages and abilities.',
        url: 'https://troutlakecc.com/program/adaptive-programs/',
      },
      {
        id: 'trout-lake-community-centre-licensed-preschool',
        name: 'Licensed Preschool',
        description: 'Early learning for young children at the community centre.',
        cost: 'paid',
        url: 'https://troutlakecc.com/program/licensed-preschool/',
      },
      {
        id: 'trout-lake-community-centre-older-adult-programs',
        name: 'Older Adult Programs',
        description: 'Stay active and connected with peers.',
        url: 'https://troutlakecc.com/program/older-adult-programs/',
      },
    ],
    logo: require('@/assets/images/partners/trout-lake-community-centre.png'),
    displayOrder: 2,
    active: true,
  },
  // ── Networks & Planning Tables ──────────────────────────────────────────
  {
    slug: 'amssa',
    name: 'AMSSA',
    category: 'networksPlanning',
    partnershipType: 'resource',
    tagline: "The backbone supporting BC's newcomer-serving agencies.",
    description:
      'The Affiliation of Multicultural Societies and Service Agencies of BC is a provincial umbrella organization that strengthens the settlement and diversity sector — providing training, resources, e-learning, and advocacy for the agencies serving newcomers across BC.',
    highlights: [
      'Sector-wide training & e-learning',
      'Resources for newcomer-serving agencies',
      'Province-wide reach across BC',
    ],
    serviceArea: 'British Columbia',
    website: 'https://www.amssa.org/',
    cost: 'mixed',
    eligibility:
      'AMSSA serves member agencies and settlement-sector organizations, not individual newcomers. If you need help yourself, contact an AMSSA member agency directly.',
    howToStart:
      'Organizations can call 604-718-2780 or 1-888-355-5560, email amssa@amssa.org, or apply through the membership page. Individual newcomers should contact an AMSSA member agency directly.',
    phone: '604-718-2780',
    email: 'amssa@amssa.org',
    address: 'Metrotower II, Suite 2308, 4720 Kingsway, Burnaby, BC V5H 4N2',
    programs: [
      {
        id: 'amssa-re-settlement-and-integration',
        name: '(Re)Settlement and Integration',
        description:
          'Capacity building, networking, training and information resources for settlement service providers in BC and Yukon.',
        eligibility:
          'Settlement-sector organizations and professionals, including IRCC BC and Yukon and BC Settlement program holders.',
        url: 'https://www.amssa.org/programs/resettlement-and-integration/',
      },
      {
        id: 'amssa-migrant-worker-hub',
        name: 'Migrant Worker Hub',
        description:
          'Tools, resources, service mapping and training that build the capacity of organizations supporting migrant workers in BC.',
        eligibility: 'Settlement and migrant worker support organizations.',
        url: 'https://www.amssa.org/programs/migrant-worker-hub/',
      },
      {
        id: 'amssa-amssa-institute',
        name: 'AMSSA Institute',
        description:
          'An online learning platform — webinars, AMSSATalks, lectures and e-learning on topics from refugee mental health to employment standards.',
        url: 'https://www.amssa.org/programs/amssa-institute/',
      },
      {
        id: 'amssa-canadian-humanitarian-assistance-response-char',
        name: 'Canadian Humanitarian Assistance Response (CHAR)',
        description:
          'A community-based network that distributes donations and essential supports to newcomers in need across Canada.',
        url: 'https://www.amssa.org/char/',
      },
      {
        id: 'amssa-indigenous-truth-and-decolonization',
        name: 'Indigenous Truth and Decolonization',
        description:
          'AMSSA’s programme of Indigenous truth and decolonization work within the settlement sector.',
        url: 'https://www.amssa.org/programs/indigenous-truth-and-decolonization/',
      },
      {
        id: 'amssa-national-sector-engagement',
        name: 'National Sector Engagement',
        description:
          'Coordinates national engagement initiatives and governance structures across the settlement sector.',
        url: 'https://www.amssa.org/programs/',
      },
    ],
    displayOrder: 0,
    active: true,
  },
  {
    slug: 'surrey-lip',
    name: 'Surrey Local Immigration Partnership',
    category: 'networksPlanning',
    partnershipType: 'resource',
    tagline: '30+ organizations coordinating newcomer integration in Surrey.',
    description:
      'An IRCC-funded, multi-stakeholder council that brings together 30+ community organizations to develop collaborative, research-driven strategies for newcomer integration in Surrey. Managed by DIVERSEcity, it also offers tools like a services map and a racism-reporting tool.',
    highlights: [
      'Coordinates 30+ local organizations',
      'Services map for newcomers',
      'Racism-reporting tool',
    ],
    serviceArea: 'Surrey',
    website: 'https://www.surreylip.ca/',
    eligibility:
      'Surrey LIP is a partnership of organizations and does not deliver services to individuals. If you need help yourself, use the Surrey Services Map or contact a Community Connector.',
    howToStart:
      'For one-to-one settlement help, contact a Community Connector: CCBD@dcrs.ca or 604-547-1272 (Black diaspora), CCM@dcrs.ca or 604-547-1131 (Muslim and Afghan communities). To find any service in Surrey, use the Surrey Services Map. Organizations can use the contact form on the website.',
    programs: [
      {
        id: 'surrey-lip-community-connector-project',
        name: 'Community Connector Project',
        description:
          'Trained community members give newcomers information, services and connections during settlement, with streams for the Black diaspora and for Muslim and Afghan communities.',
        eligibility:
          'Newcomers of all backgrounds, with a particular focus on Black and Muslim/Afghan communities in Surrey.',
        url: 'https://www.surreylip.ca/project/community-connector-project/',
      },
      {
        id: 'surrey-lip-surrey-services-map',
        name: 'Surrey Services Map',
        description:
          'An online map of the services available to newcomers and residents in Surrey.',
        url: 'https://www.surreylip.ca/surrey-services-map/',
      },
      {
        id: 'surrey-lip-immigrant-advisory-round-table',
        name: 'Immigrant Advisory Round Table',
        description:
          'A table of immigrant residents that feeds community input into Surrey LIP’s planning and projects.',
        url: 'https://www.surreylip.ca/',
      },
      {
        id: 'surrey-lip-youth-newcomer-council',
        name: 'Surrey Youth Newcomer Council',
        description:
          'A council of newcomer youth that brings youth perspectives into Surrey LIP’s work.',
        url: 'https://www.surreylip.ca/',
      },
      {
        id: 'surrey-lip-bridging-indigenous-and-newcomer',
        name: 'Bridging Indigenous and Newcomer Communities',
        description:
          'A project that builds relationships and shared understanding between Indigenous and newcomer communities in Surrey.',
        url: 'https://www.surreylip.ca/project/bridging-indigenous-and-newcomer-communities/',
      },
      {
        id: 'surrey-lip-first-peoples-guide',
        name: 'Surrey First Peoples Guide',
        description:
          'A guide that helps facilitators introduce newcomers to the First Peoples of the Surrey area.',
        url: 'https://www.surreylip.ca/project/surrey-first-peoples-guide-for-newcomer-facilitation/',
      },
    ],
    logo: require('@/assets/images/partners/surrey-lip.png'),
    displayOrder: 1,
    active: true,
  },
  {
    slug: 'delta-lip',
    name: 'Delta Local Immigration Partnership',
    category: 'networksPlanning',
    partnershipType: 'resource',
    tagline: 'Coordinates newcomer services across Delta.',
    description:
      'The Delta Local Immigration Partnership is an IRCC-funded partnership table bringing local organizations together to make Delta more welcoming for newcomers. It states that it does not provide direct services to individuals.',
    highlights: [
      'Coordinates local newcomer services in Delta',
      'Youth and immigrant advisory tables',
      'Publishes the Delta Services Map',
    ],
    serviceArea: 'Delta',
    website: 'https://deltalip.ca/',
    eligibility:
      'Delta LIP is a partnership of community organizations, agencies, municipal bodies and local businesses, and does not deliver services to individuals. Newcomers and youth can take part through its advisory tables, or find services through the Delta Services Map.',
    howToStart:
      'Email deltalip@dcrs.ca, or use the contact form on the website. To find a service in Delta, use the Delta Services Map.',
    email: 'deltalip@dcrs.ca',
    programs: [
      {
        id: 'delta-lip-delta-services-map',
        name: 'Delta Services Map',
        description:
          'An online map of services available to newcomers in Delta.',
        url: 'https://deltalip.ca/delta-services-map/',
      },
      {
        id: 'delta-lip-resource-library',
        name: 'Resource Library',
        description:
          'Settlement and community resources published by the partnership for Delta residents and service providers.',
        url: 'https://deltalip.ca/resources/',
      },
      {
        id: 'delta-lip-delta-youth-newcomer-advisory-table-dynat',
        name: 'Delta Youth Newcomer Advisory Table (DYNAT)',
        description:
          'Brings together young people who want to make Delta more welcoming for newcomer youth.',
        eligibility:
          'Youth aged 16 to 25 who want to make Delta a more welcoming and inclusive place for newcomer youth.',
      },
      {
        id: 'delta-lip-immigrant-advisory-table',
        name: 'Immigrant Advisory Table',
        description:
          'A volunteer roundtable with members representing a diversity of backgrounds and experiences.',
        eligibility: 'Applicants must be at least 26 years old.',
      },
    ],
    logo: require('@/assets/images/partners/delta-lip.png'),
    displayOrder: 2,
    active: true,
  },
  // ── International Students ──────────────────────────────────────────────
  {
    slug: 'sfu-international',
    name: 'SFU International Services for Students',
    category: 'internationalStudents',
    partnershipType: 'resource',
    tagline: 'Advising, orientation, and newcomer support for SFU students.',
    description:
      "Simon Fraser University's International Services for Students supports international students with non-academic advising, orientation, and career programming, plus dedicated support for students who identify as refugees or newcomers.",
    highlights: [
      'Non-academic advising for international students',
      'Orientation and career programming',
      'Dedicated refugee and newcomer support',
    ],
    serviceArea: 'SFU Burnaby campus',
    website: 'https://www.sfu.ca/students/iss.html',
    ctaLabelKey: 'learn.resources.cta.bookAdvising',
    eligibility:
      'International students enrolled at SFU, including undergraduate, graduate and exchange students.',
    howToStart:
      'Drop in (in person or virtual), book an advising appointment, or email iss_office@sfu.ca. Advising enquiries go to intl_advising@sfu.ca.',
    phone: '778-782-4232',
    email: 'iss_office@sfu.ca',
    address: 'MBC 1200 – 8888 University Drive, Burnaby, BC V5A 1S6',
    hours: 'Mon–Fri 9:00am–4:00pm (closed 12:00–1:00pm)',
    programs: [
      {
        id: 'sfu-international-international-and-newcomer-student-advising',
        name: 'International and Newcomer Student Advising',
        description:
          'Non-academic advising for international undergraduate, graduate and exchange students.',
        eligibility:
          'International students, including undergraduate, graduate and exchange students.',
        url: 'https://www.sfu.ca/students/isap.html',
      },
      {
        id: 'sfu-international-refugee-and-newcomer-programs',
        name: 'Refugee and Newcomer Programs',
        description:
          'Case-managed support for students who identify as refugees or newcomers — settlement help, orientation, and connections to academic advising, health, financial aid and career services.',
        eligibility: 'SFU students who identify as refugees or newcomers.',
        url: 'https://www.sfu.ca/refugeeprograms/students.html',
      },
      {
        id: 'sfu-international-student-refugee-program',
        name: 'Student Refugee Program (with WUSC)',
        description:
          'SFU sponsors six undergraduate refugee students from overseas camps each year with World University Service of Canada. The sponsorship covers tuition, books, fees and living costs.',
        eligibility:
          'Refugee students aged 18–25 in overseas refugee camps, selected through WUSC.',
        url: 'https://www.sfu.ca/refugeeprograms/students.html',
      },
      {
        id: 'sfu-international-global-student-centre',
        name: 'Global Student Centre',
        description:
          'A campus space at AQ 2013 for international student support, events and time with advisors.',
        url: 'https://www.sfu.ca/students/iss.html',
      },
      {
        id: 'sfu-international-international-student-orientation-series',
        name: 'International Student Orientation Series',
        description:
          'A multi-part series for all new international students beginning studies at SFU.',
        eligibility: 'New international students starting at SFU.',
        url: 'https://www.sfu.ca/students/isap/programs/intlorientation.html',
      },
      {
        id: 'sfu-international-international-student-career-week',
        name: 'International Student Career Week',
        description:
          'A week-long series of career activities designed for international students.',
        eligibility: 'International undergraduate and graduate students.',
        url: 'https://www.sfu.ca/students/isap/programs/IntlCareerWeek.html',
      },
    ],
    logo: require('@/assets/images/partners/sfu-international.png'),
    displayOrder: 0,
    active: true,
  },
  {
    slug: 'fraser-international-college',
    name: 'Fraser International College',
    category: 'internationalStudents',
    partnershipType: 'resource',
    tagline: 'Pathway college programs leading into SFU degrees.',
    description:
      "Fraser International College is a private pathway college on SFU's Burnaby campus, offering foundation and first-year programs that lead into Simon Fraser University degrees. All programs are tuition-based.",
    highlights: [
      'University transfer pathway into SFU',
      'Foundation and first-year university programs',
      'Located on the SFU Burnaby campus',
    ],
    serviceArea: 'Burnaby',
    website: 'https://www.fraseric.ca/',
    ctaLabelKey: 'learn.resources.cta.applyOnline',
    cost: 'paid',
    eligibility:
      'Applicants must be at least 17 years old by the last day of their first semester and submit all academic transcripts. Academic requirements vary by program and by country of origin.',
    howToStart:
      'Apply online through the FIC student portal, email info@fraseric.ca, or apply through a listed education agent.',
    phone: '(778) 782-5011',
    email: 'info@fraseric.ca',
    address: '8999 Nelson Way, Burnaby, BC V5A 4B5',
    programs: [
      {
        id: 'fraser-international-college-foundation-program-utp-stage-i',
        name: 'Foundation Program (UTP Stage I)',
        description: 'Pre-university program taken over two terms.',
        eligibility:
          'Successful completion of Year 11 or equivalent, with benchmarks depending on the chosen program.',
        cost: 'paid',
        url: 'https://www.fraseric.ca/admissions/fees/',
      },
      {
        id: 'fraser-international-college-international-year-one-utp-stage-ii',
        name: 'International Year One (UTP Stage II)',
        description:
          'First-year university credit programme leading into an SFU degree.',
        eligibility:
          'Generally Year 12 completion or equivalent; requirements vary by country system and program.',
        cost: 'paid',
        url: 'https://www.fraseric.ca/admissions/fees/',
      },
      {
        id: 'fraser-international-college-associate-of-arts-degree',
        name: 'Associate of Arts Degree',
        description: 'Two-year associate degree taken at FIC.',
        eligibility: 'Generally Year 12 completion or equivalent.',
        cost: 'paid',
        url: 'https://www.fraseric.ca/admissions/fees/',
      },
      {
        id: 'fraser-international-college-student-success-team',
        name: 'Student Success Team',
        description:
          'Academic advising and study planning, including graduation and transfer planning into SFU.',
        eligibility: 'FIC students.',
        url: 'https://www.fraseric.ca/student-services/',
      },
      {
        id: 'fraser-international-college-wellness-office',
        name: 'Wellness Office',
        description:
          'Counselling and mental health support from a counsellor on staff.',
        eligibility: 'FIC students.',
        url: 'https://www.fraseric.ca/student-services/',
      },
      {
        id: 'fraser-international-college-student-support-services',
        name: 'Student Support Services',
        description:
          'Attendance support, tutorials and workshops, document requests, accommodation help, orientation and campus events. FIC students also reach some SFU services, including SFU Recreation and SFU Multifaith.',
        eligibility: 'FIC students.',
        url: 'https://www.fraseric.ca/student-services/',
      },
    ],
    displayOrder: 1,
    active: true,
  },
  // ── Insurance ───────────────────────────────────────────────────────────
  {
    slug: 'tugo',
    name: 'TuGo',
    category: 'insurance',
    partnershipType: 'referral',
    tagline:
      'Travel and visitor insurance, including cover during the health-plan wait.',
    description:
      'TuGo is a Canadian-owned travel insurance provider with its head office in Richmond, BC. Its Visitors to Canada plans cover emergency medical costs for family visiting from abroad and for people waiting for a provincial health plan to take effect.',
    highlights: [
      'Emergency medical cover for visitors to Canada',
      'Coverage options for pre-existing conditions',
      'Canadian-owned, head office in Richmond, BC',
    ],
    serviceArea: 'Canada and worldwide',
    // Affiliate link supplied by the partner; deliberately unlabelled in the
    // UI and opened by the standard Website button.
    website: 'https://tugo.partnerlinks.io/68e8fsmokbc7',
    ctaLabelKey: 'learn.resources.cta.getQuote',
    cost: 'paid',
    howToStart:
      'Start a quote online through a TuGo insurance partner, or call 1-855-929-8846.',
    phone: '1-855-929-8846',
    email: 'info@tugo.com',
    address: '1200–6081 No. 3 Road, Richmond, BC V6Y 2B2',
    hours: 'Mon–Fri 6:00am–5:00pm PST · Sat 7:00am–4:00pm PST · Sun closed',
    languages: ['English', 'French'],
    programs: [
      {
        id: 'tugo-visitors-to-canada-insurance',
        name: 'Visitors to Canada Insurance',
        description:
          'Emergency medical protection for visitors — doctor’s fees, prescriptions and emergency transport — with options covering pre-existing conditions.',
        eligibility:
          'For people visiting family or friends, travelling in Canada, or waiting for a provincial health plan to take effect.',
        cost: 'paid',
      },
      {
        id: 'tugo-basic-visitors-to-canada-insurance',
        name: 'Basic Visitors to Canada Insurance',
        description:
          'Lower-cost emergency medical coverage for visitors on a budget.',
        cost: 'paid',
      },
      {
        id: 'tugo-student-insurance',
        name: 'Student Insurance',
        description:
          'Cover for international students without a provincial health plan, and for Canadian students studying away. Includes medical and hospital treatment, some dental and eye care, and tutoring after a hospital stay.',
        eligibility:
          'International students studying in Canada, and Canadian students studying out of province or abroad.',
        cost: 'paid',
      },
      {
        id: 'tugo-trip-cancellation-trip-interruption-insurance',
        name: 'Trip Cancellation & Trip Interruption Insurance',
        description:
          'Covers costs if a trip is cancelled before departure or disrupted during travel.',
        cost: 'paid',
      },
      {
        id: 'tugo-24-7-emergency-medical-assistance',
        name: '24/7 Emergency Medical Assistance',
        description:
          'Round-the-clock emergency medical assistance and claims support on 1-800-663-0399.',
      },
    ],
    logo: require('@/assets/images/partners/tugo.png'),
    displayOrder: 0,
    active: true,
  },
  // ── Money & Banking ─────────────────────────────────────────────────────
  {
    slug: 'desjardins',
    name: 'Desjardins',
    category: 'money',
    partnershipType: 'referral',
    tagline: 'Newcomer banking, credit building, and free legal help.',
    description:
      "Desjardins is Canada's largest cooperative financial group. Its newcomer offer includes a chequing account with no monthly plan fee during an eligibility period, no-annual-fee credit cards to help build Canadian credit history, and a free legal assistance service. Its branch network is in Quebec and Ontario.",
    highlights: [
      'No monthly plan fee during the newcomer period',
      'Credit cards to build Canadian credit history',
      'Free legal assistance service for two years',
    ],
    serviceArea: 'Quebec and Ontario',
    website: 'https://www.desjardins.com/ca/personal/you-are/newcomers-canada/',
    cost: 'mixed',
    eligibility:
      'The newcomer account offer is for people aged 25 and over who are permanent residents, or temporary residents with a work permit valid for more than 8 months, who have lived in Canada 3 years or less and are not already Desjardins members. Separate offers cover ages 18–24 and full-time students aged 25–30.',
    howToStart:
      'Open an account online in about 15 minutes, or apply from abroad and confirm your identity at a service location on arrival.',
    phone: '1-877-435-6098',
    hours:
      'Legal assistance: file opening 24/7 · advisors Mon–Fri 9:00am–8:00pm, Sat 9:00am–5:00pm',
    languages: ['English', 'French'],
    programs: [
      {
        id: 'desjardins-newcomers-chequing-account-unlimited-plan',
        name: 'Newcomers chequing account (Unlimited plan)',
        description:
          'Chequing account with the monthly Unlimited plan fee waived during the eligibility period.',
        eligibility:
          'Aged 25+, permanent resident or temporary resident with a work permit valid more than 8 months, in Canada 3 years or less, and not already a Desjardins member.',
        cost: 'mixed',
      },
      {
        id: 'desjardins-free-legal-assistance-service',
        name: 'Free legal assistance service',
        description:
          'Legal assistance included with the newcomer offer for two years, covering everyday matters.',
        cost: 'free',
      },
      {
        id: 'desjardins-international-money-transfers',
        name: 'International money transfers',
        description: 'International money transfers of up to $25,000 per day.',
      },
      {
        id: 'desjardins-youth-and-student-accounts',
        name: 'Youth and student accounts',
        description:
          'Account offers for younger newcomers and full-time students.',
        eligibility: 'Ages 18–24, or 25–30 if a full-time student.',
        cost: 'mixed',
      },
    ],
    logo: require('@/assets/images/partners/desjardins.png'),
    displayOrder: 0,
    active: true,
  },
];

/**
 * Active partners from an arbitrary list, sorted by displayOrder.
 * Split out from `getActivePartners` so the filter is testable without an
 * inactive partner in the shipped data.
 */
export const selectActivePartners = (partners: Partner[]): Partner[] =>
  partners
    .filter(p => p.active)
    .sort((a, b) => a.displayOrder - b.displayOrder);

/** Active partners only, sorted by displayOrder. */
export const getActivePartners = (): Partner[] =>
  selectActivePartners(PARTNERS);

/** Active partners in a category, sorted by displayOrder. */
export const getPartnersByCategory = (category: PartnerCategory): Partner[] =>
  getActivePartners().filter(p => p.category === category);

/** Selects an active partner by slug from an arbitrary directory. */
export const selectActivePartnerBySlug = (
  partners: Partner[],
  slug: string
): Partner | undefined =>
  selectActivePartners(partners).find(p => p.slug === slug);

/** A single active partner by slug for the detail route. */
export const getPartnerBySlug = (slug: string): Partner | undefined =>
  selectActivePartnerBySlug(PARTNERS, slug);

/**
 * Categories that have ≥1 active partner, in CATEGORY_ORDER, with counts.
 * Empty categories are omitted.
 */
export const getCategoriesWithPartners = (): {
  category: PartnerCategory;
  partnerCount: number;
}[] => {
  const counts = new Map<PartnerCategory, number>();
  for (const p of getActivePartners()) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  return CATEGORY_ORDER.filter(c => counts.has(c)).map(category => ({
    category,
    partnerCount: counts.get(category)!,
  }));
};
