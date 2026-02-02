import type { AnalyticsEvent } from '../../analytics/types';

export type MockConversation = {
  conversationId: string;
  cityId: string;
  sessionId: string;
  startedAt: number;
  category?: string;
  messages: {
    id: string;
    role: "user" | "assistant";
    timestamp: number;
    content: string;
  }[];
  fallbackCount: number;
};

export const mockConversations: MockConversation[] = [
  // Ploce conversations - comprehensive set covering all categories
  
  // A) contacts_hours - Today
  {
    conversationId: "conv_ploce_001",
    cityId: "ploce",
    sessionId: "sess_abc123",
    startedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago (today)
    category: "contacts_hours",
    messages: [
      {
        id: "msg_1",
        role: "user",
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
        content: "Gdje se nalazi gradska uprava u Pločama?",
      },
      {
        id: "msg_2",
        role: "assistant",
        timestamp: Date.now() - 2 * 60 * 60 * 1000 + 500,
        content: "Gradska uprava Grada Ploča nalazi se na adresi Trg hrvatskih branitelja 1, 20340 Ploče. Radno vrijeme je od ponedjeljka do petka od 8:00 do 16:00 sati.",
      },
      {
        id: "msg_3",
        role: "user",
        timestamp: Date.now() - 2 * 60 * 60 * 1000 + 1000,
        content: "Kako mogu kontaktirati gradonačelnika?",
      },
      {
        id: "msg_4",
        role: "assistant",
        timestamp: Date.now() - 2 * 60 * 60 * 1000 + 1500,
        content: "Gradonačelnika možete kontaktirati putem e-maila na adresu gradonacelnik@ploce.hr ili telefonski na broj 020/679-100.",
      },
      {
        id: "msg_5",
        role: "user",
        timestamp: Date.now() - 2 * 60 * 60 * 1000 + 2000,
        content: "A koji je e-mail Odjela za opće poslove?",
      },
      {
        id: "msg_6",
        role: "assistant",
        timestamp: Date.now() - 2 * 60 * 60 * 1000 + 2500,
        content: "Odjel za opće poslove možete kontaktirati na e-mail adresi opci.poslovi@ploce.hr ili telefonski na 020/679-110. Radno vrijeme je od ponedjeljka do petka od 8:00 do 16:00 sati.",
      },
      {
        id: "msg_7",
        role: "user",
        timestamp: Date.now() - 2 * 60 * 60 * 1000 + 3000,
        content: "Hvala vam!",
      },
      {
        id: "msg_8",
        role: "assistant",
        timestamp: Date.now() - 2 * 60 * 60 * 1000 + 3500,
        content: "Nema na čemu! Ako imate još pitanja, slobodno me pitajte.",
      },
    ],
    fallbackCount: 0,
  },

  // B) forms_requests - Today
  {
    conversationId: "conv_ploce_002",
    cityId: "ploce",
    sessionId: "sess_def456",
    startedAt: Date.now() - 4 * 60 * 60 * 1000, // 4 hours ago (today)
    category: "forms_requests",
    messages: [
      {
        id: "msg_9",
        role: "user",
        timestamp: Date.now() - 4 * 60 * 60 * 1000,
        content: "Gdje mogu pronaći obrazac za prijavu prebivališta?",
      },
      {
        id: "msg_10",
        role: "assistant",
        timestamp: Date.now() - 4 * 60 * 60 * 1000 + 700,
        content: "Obrazac za prijavu prebivališta možete pronaći na službenim stranicama Grada Ploča u sekciji 'Formulari' ili možete ga preuzeti direktno u gradskoj upravi.",
      },
      {
        id: "msg_11",
        role: "user",
        timestamp: Date.now() - 4 * 60 * 60 * 1000 + 2500,
        content: "Kako ga trebam ispuniti?",
      },
      {
        id: "msg_12",
        role: "assistant",
        timestamp: Date.now() - 4 * 60 * 60 * 1000 + 3200,
        content: "Obrazac trebate ispuniti s osobnim podacima, podacima o prebivalištu te priložiti potrebnu dokumentaciju (osobna isprava, dokaz o vlasništvu ili najmu stana). Detaljne upute su navedene na obrascu.",
      },
      {
        id: "msg_13",
        role: "user",
        timestamp: Date.now() - 4 * 60 * 60 * 1000 + 4500,
        content: "Gdje ga mogu predati?",
      },
      {
        id: "msg_14",
        role: "assistant",
        timestamp: Date.now() - 4 * 60 * 60 * 1000 + 5200,
        content: "Obrazac možete predati osobno u gradskoj upravi, putem e-maila na uprava@ploce.hr ili poštom na adresu Trg hrvatskih branitelja 1, 20340 Ploče.",
      },
      {
        id: "msg_15",
        role: "user",
        timestamp: Date.now() - 4 * 60 * 60 * 1000 + 6000,
        content: "Koliko vremena traje obrada?",
      },
      {
        id: "msg_16",
        role: "assistant",
        timestamp: Date.now() - 4 * 60 * 60 * 1000 + 6700,
        content: "Obično obrada prijave prebivališta traje 5-7 radnih dana. Nakon obrade, bit ćete obaviješteni o statusu vaše prijave.",
      },
    ],
    fallbackCount: 0,
  },

  // C) utilities_communal - Yesterday
  {
    conversationId: "conv_ploce_003",
    cityId: "ploce",
    sessionId: "sess_ghi789",
    startedAt: Date.now() - 26 * 60 * 60 * 1000, // 26 hours ago (yesterday)
    category: "utilities_communal",
    messages: [
      {
        id: "msg_17",
        role: "user",
        timestamp: Date.now() - 26 * 60 * 60 * 1000,
        content: "Kada se odvoz smeća u mojoj ulici?",
      },
      {
        id: "msg_18",
        role: "assistant",
        timestamp: Date.now() - 26 * 60 * 60 * 1000 + 600,
        content: "Odvoz komunalnog otpada u Pločama se obavlja svaki utorak i petak ujutro. Molimo ostavite kontejnere na predviđenom mjestu do 7:00 sati.",
      },
      {
        id: "msg_19",
        role: "user",
        timestamp: Date.now() - 26 * 60 * 60 * 1000 + 3000,
        content: "U mojoj ulici je pokvarena ulična svjetiljka, kome se to prijavljuje?",
      },
      {
        id: "msg_20",
        role: "assistant",
        timestamp: Date.now() - 26 * 60 * 60 * 1000 + 3600,
        content: "Prijavu pokvarene ulične svjetiljke možete podnijeti Odjelu za komunalne poslove telefonski na 020/679-200 ili e-mailom na komunalno@ploce.hr. Molimo navedite točnu adresu i opis problema.",
      },
      {
        id: "msg_21",
        role: "user",
        timestamp: Date.now() - 26 * 60 * 60 * 1000 + 5000,
        content: "Koliko vremena obično traje popravak?",
      },
      {
        id: "msg_22",
        role: "assistant",
        timestamp: Date.now() - 26 * 60 * 60 * 1000 + 5600,
        content: "Obično se pokvarene ulične svjetiljke popravljaju u roku od 3-5 radnih dana, ovisno o težini kvara i dostupnosti dijelova.",
      },
    ],
    fallbackCount: 0,
  },

  // D) budget_finance - Yesterday
  {
    conversationId: "conv_ploce_004",
    cityId: "ploce",
    sessionId: "sess_jkl012",
    startedAt: Date.now() - 28 * 60 * 60 * 1000, // 28 hours ago (yesterday)
    category: "budget_finance",
    messages: [
      {
        id: "msg_23",
        role: "user",
        timestamp: Date.now() - 28 * 60 * 60 * 1000,
        content: "Koliki je proračun Grada Ploča za 2024. godinu?",
      },
      {
        id: "msg_24",
        role: "assistant",
        timestamp: Date.now() - 28 * 60 * 60 * 1000 + 800,
        content: "Proračun Grada Ploča za 2024. godinu iznosi 45.2 milijuna kuna. Detaljne informacije o raspodjeli sredstava možete pronaći u dokumentu 'Proracun-Grada-Ploca-2024.txt'.",
      },
      {
        id: "msg_25",
        role: "user",
        timestamp: Date.now() - 28 * 60 * 60 * 1000 + 2000,
        content: "Koliko se troši na kulturu?",
      },
      {
        id: "msg_26",
        role: "assistant",
        timestamp: Date.now() - 28 * 60 * 60 * 1000 + 2800,
        content: "Prema proračunu za 2024. godinu, za kulturu je predviđeno 2.8 milijuna kuna. Ovo uključuje potporu kulturnim organizacijama, manifestacijama i održavanje kulturnih objekata.",
      },
      {
        id: "msg_27",
        role: "user",
        timestamp: Date.now() - 28 * 60 * 60 * 1000 + 4000,
        content: "Gdje mogu pronaći dokumente o javnim nabavama?",
      },
      {
        id: "msg_28",
        role: "assistant",
        timestamp: Date.now() - 28 * 60 * 60 * 1000 + 4800,
        content: "Dokumente o javnim nabavama možete pronaći na službenim stranicama Grada Ploča u sekciji 'Javne nabavke' ili možete kontaktirati Odjel za financije na 020/679-130.",
      },
      {
        id: "msg_29",
        role: "user",
        timestamp: Date.now() - 28 * 60 * 60 * 1000 + 6000,
        content: "Hvala na informacijama!",
      },
      {
        id: "msg_30",
        role: "assistant",
        timestamp: Date.now() - 28 * 60 * 60 * 1000 + 6500,
        content: "Nema na čemu! Ako imate dodatna pitanja o proračunu, slobodno me kontaktirajte.",
      },
    ],
    fallbackCount: 0,
  },

  // E) tenders_jobs - 3 days ago
  {
    conversationId: "conv_ploce_005",
    cityId: "ploce",
    sessionId: "sess_mno345",
    startedAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    category: "tenders_jobs",
    messages: [
      {
        id: "msg_31",
        role: "user",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
        content: "Ima li trenutno otvorenih radnih mjesta u gradskoj upravi?",
      },
      {
        id: "msg_32",
        role: "assistant",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 900,
        content: "Trenutno je otvoreno natječajno postupak za radno mjesto referenta u Odjelu za gospodarski razvoj. Rok za prijavu je 15. dana od objave natječaja.",
      },
      {
        id: "msg_33",
        role: "user",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 3000,
        content: "Gdje mogu pronaći detalje o natječaju?",
      },
      {
        id: "msg_34",
        role: "assistant",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 3800,
        content: "Detalje o natječaju možete pronaći na službenim stranicama Grada Ploča u sekciji 'Natječaji' ili možete kontaktirati Odjel za opće poslove na 020/679-110.",
      },
      {
        id: "msg_35",
        role: "user",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 5000,
        content: "Kako se prijavljujem?",
      },
      {
        id: "msg_36",
        role: "assistant",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 5800,
        content: "Prijavu možete podnijeti osobno u gradskoj upravi, poštom na adresu Trg hrvatskih branitelja 1, 20340 Ploče ili e-mailom na opci.poslovi@ploce.hr. Molimo priložite sve potrebne dokumente navedene u natječaju.",
      },
      {
        id: "msg_37",
        role: "user",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 7000,
        content: "Ima li još javnih natječaja?",
      },
      {
        id: "msg_38",
        role: "assistant",
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 7800,
        content: "Trenutno je aktivan i javni natječaj za izvođenje radova na održavanju gradskih površina. Svi aktualni javni natječaji su objavljeni na službenim stranicama grada.",
      },
    ],
    fallbackCount: 0,
  },

  // F) acts_decisions - 4 days ago
  {
    conversationId: "conv_ploce_006",
    cityId: "ploce",
    sessionId: "sess_pqr678",
    startedAt: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4 days ago
    category: "acts_decisions",
    messages: [
      {
        id: "msg_39",
        role: "user",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000,
        content: "Gdje mogu pronaći odluke Gradskog vijeća?",
      },
      {
        id: "msg_40",
        role: "assistant",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000 + 700,
        content: "Sve odluke Gradskog vijeća Grada Ploča objavljene su na službenim stranicama grada u sekciji 'Odluke i akte' te su javno dostupne za pregled.",
      },
      {
        id: "msg_41",
        role: "user",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000 + 2500,
        content: "Kako mogu pronaći odluku o proračunu?",
      },
      {
        id: "msg_42",
        role: "assistant",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000 + 3200,
        content: "Odluku o proračunu možete pronaći pretraživanjem po ključnoj riječi 'proračun' u sekciji 'Odluke i akte' ili možete kontaktirati Gradsko vijeće na 020/679-105.",
      },
      {
        id: "msg_43",
        role: "user",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000 + 4500,
        content: "Postoje li propisi o parkiranju?",
      },
      {
        id: "msg_44",
        role: "assistant",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000 + 5200,
        content: "Da, Gradsko vijeće je donijelo Odluku o pravilima parkiranja koja je dostupna na službenim stranicama. Također možete kontaktirati Odjel za komunalne poslove za dodatne informacije.",
      },
      {
        id: "msg_45",
        role: "user",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000 + 6000,
        content: "Hvala!",
      },
      {
        id: "msg_46",
        role: "assistant",
        timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000 + 6500,
        content: "Nema na čemu! Ako imate dodatna pitanja o gradskim aktima, slobodno me kontaktirajte.",
      },
    ],
    fallbackCount: 0,
  },

  // G) permits_solutions - 5 days ago
  {
    conversationId: "conv_ploce_007",
    cityId: "ploce",
    sessionId: "sess_stu901",
    startedAt: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
    category: "permits_solutions",
    messages: [
      {
        id: "msg_47",
        role: "user",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
        content: "Kako mogu dobiti građevinsku dozvolu?",
      },
      {
        id: "msg_48",
        role: "assistant",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 + 800,
        content: "Za dobivanje građevinske dozvole potrebno je podnijeti zahtjev u Odjelu za prostorno planiranje i graditeljstvo. Zahtjev mora sadržavati projektnu dokumentaciju, dokaz o vlasništvu zemljišta i druge potrebne dokumente.",
      },
      {
        id: "msg_49",
        role: "user",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 + 3000,
        content: "Koliko vremena traje izdavanje dozvole?",
      },
      {
        id: "msg_50",
        role: "assistant",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 + 3800,
        content: "Rok za izdavanje građevinske dozvole je 30 dana od dana podnošenja potpune dokumentacije. U slučaju potrebe za dodatnim provjerama, rok se može produžiti.",
      },
      {
        id: "msg_51",
        role: "user",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 + 5000,
        content: "Trebam li dozvolu za manju nadogradnju?",
      },
      {
        id: "msg_52",
        role: "assistant",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 + 5800,
        content: "Za manje nadogradnje i rekonstrukcije možda nije potrebna građevinska dozvola, već samo prijava radova. Molimo kontaktirajte Odjel za prostorno planiranje na 020/679-140 za konkretne informacije o vašem slučaju.",
      },
      {
        id: "msg_53",
        role: "user",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 + 7000,
        content: "Hvala na informacijama!",
      },
      {
        id: "msg_54",
        role: "assistant",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 + 7500,
        content: "Nema na čemu! Ako imate dodatna pitanja o dozvolama, slobodno me kontaktirajte.",
      },
    ],
    fallbackCount: 0,
  },

  // H) social_support - 6 days ago
  {
    conversationId: "conv_ploce_008",
    cityId: "ploce",
    sessionId: "sess_vwx234",
    startedAt: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6 days ago
    category: "social_support",
    messages: [
      {
        id: "msg_55",
        role: "user",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000,
        content: "Postoje li programi financijske pomoći za građane?",
      },
      {
        id: "msg_56",
        role: "assistant",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 + 900,
        content: "Da, Grad Ploče nudi programe socijalne pomoći za građane u potrebi. Informacije o uvjetima i načinu prijave možete dobiti u Odjelu za socijalnu skrb na 020/679-180.",
      },
      {
        id: "msg_57",
        role: "user",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 + 3000,
        content: "Ima li stipendija za studente?",
      },
      {
        id: "msg_58",
        role: "assistant",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 + 3800,
        content: "Da, Grad Ploče dodjeljuje stipendije studentima koji su stalno nastanjeni u Pločama. Natječaj se obično objavljuje u rujnu svake godine. Detalje možete pronaći na službenim stranicama ili kontaktirati Odjel za socijalnu skrb.",
      },
      {
        id: "msg_59",
        role: "user",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 + 5000,
        content: "Koji su uvjeti za stipendiju?",
      },
      {
        id: "msg_60",
        role: "assistant",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 + 5800,
        content: "Uvjeti za stipendiju uključuju stalno prebivalište u Pločama, redovito studiranje, dobar akademski uspjeh i ispunjavanje materijalnih uvjeta. Detaljne informacije i obrazac za prijavu dostupni su u Odjelu za socijalnu skrb.",
      },
      {
        id: "msg_61",
        role: "user",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 + 7000,
        content: "Hvala vam puno!",
      },
      {
        id: "msg_62",
        role: "assistant",
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 + 7500,
        content: "Nema na čemu! Ako imate dodatna pitanja o socijalnoj pomoći, slobodno me kontaktirajte.",
      },
    ],
    fallbackCount: 0,
  },

  // I) events_news - 1 week ago
  {
    conversationId: "conv_ploce_009",
    cityId: "ploce",
    sessionId: "sess_yza567",
    startedAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    category: "events_news",
    messages: [
      {
        id: "msg_63",
        role: "user",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
        content: "Koji su nadolazeći događaji u gradu?",
      },
      {
        id: "msg_64",
        role: "assistant",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 + 700,
        content: "U narednom periodu planirani su različiti kulturni i sportski događaji. Detaljne informacije o svim nadolazećim manifestacijama možete pronaći na službenim stranicama Grada Ploča u sekciji 'Događaji'.",
      },
      {
        id: "msg_65",
        role: "user",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 + 2500,
        content: "Ima li nešto ovaj vikend?",
      },
      {
        id: "msg_66",
        role: "assistant",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 + 3200,
        content: "Ovaj vikend je planirana kulturna manifestacija na gradskom trgu, kao i nogometna utakmica lokalnog kluba. Točne informacije o vremenu i programu možete pronaći na službenim stranicama ili kontaktirati Odjel za kulturu na 020/679-160.",
      },
      {
        id: "msg_67",
        role: "user",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 + 4500,
        content: "Gdje se objavljuju službene obavijesti?",
      },
      {
        id: "msg_68",
        role: "assistant",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 + 5200,
        content: "Sve službene obavijesti Grada Ploča objavljuju se na službenim stranicama grada u sekciji 'Obavijesti' te su javno dostupne svim građanima.",
      },
      {
        id: "msg_69",
        role: "user",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 + 6000,
        content: "Super, hvala!",
      },
      {
        id: "msg_70",
        role: "assistant",
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 + 6500,
        content: "Nema na čemu! Pratite službene stranice za sve najnovije informacije o događajima u gradu.",
      },
    ],
    fallbackCount: 0,
  },

  // J) issue_reporting (needsHuman = true) - 2 weeks ago
  {
    conversationId: "conv_ploce_010",
    cityId: "ploce",
    sessionId: "sess_bcd890",
    startedAt: Date.now() - 14 * 24 * 60 * 60 * 1000, // 14 days ago (2 weeks)
    category: "issue_reporting",
    messages: [
      {
        id: "msg_71",
        role: "user",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000,
        content: "U mojoj ulici je velika rupa na cesti koja predstavlja opasnost za promet. Trebam hitno prijaviti!",
      },
      {
        id: "msg_72",
        role: "assistant",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 + 800,
        content: "Razumijem vašu zabrinutost. Za hitne prijave infrastrukturnih problema koji predstavljaju opasnost, molimo kontaktirajte Odjel za komunalne poslove hitno na 020/679-200 ili e-mailom na komunalno@ploce.hr. Molimo navedite točnu lokaciju problema.",
      },
      {
        id: "msg_73",
        role: "user",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 + 3000,
        content: "Rupa je u Ulici Ive Lole Ribara, ispred broja 15. Već je nekoliko dana tamo i netko može ozlijediti se!",
      },
      {
        id: "msg_74",
        role: "assistant",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 + 3800,
        content: "Hvala na detaljnoj informaciji. Vaša prijava je zabilježena. Molimo kontaktirajte Odjel za komunalne poslove direktno na 020/679-200 kako bi se problem što prije riješio. Za hitne slučajeve možete kontaktirati i službu komunalnih redara na 020/679-210.",
      },
      {
        id: "msg_75",
        role: "user",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 + 5000,
        content: "Također imam problem s bukom iz kafića koji radi do kasno u noć. To je nepodnošljivo!",
      },
      {
        id: "msg_76",
        role: "assistant",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 + 5800,
        content: "Za prijave problema s bukom molimo kontaktirajte službu komunalnih redara na 020/679-210 ili Odjel za komunalne poslove. Vaša prijava zahtijeva osobnu provjeru i intervenciju službenika, stoga molimo direktan kontakt.",
      },
      {
        id: "msg_77",
        role: "user",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 + 7000,
        content: "Hvala, nadam se da će se nešto poduzeti.",
      },
      {
        id: "msg_78",
        role: "assistant",
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 + 7500,
        content: "Razumijem vašu zabrinutost. Molimo kontaktirajte navedene službe direktno kako bi se problemi što prije riješili. Vaše prijave su važne za održavanje kvalitete života u gradu.",
      },
    ],
    fallbackCount: 0,
  },

  // K) general - 3 weeks ago
  {
    conversationId: "conv_ploce_011",
    cityId: "ploce",
    sessionId: "sess_efg123",
    startedAt: Date.now() - 21 * 24 * 60 * 60 * 1000, // 21 days ago (3 weeks)
    category: "general",
    messages: [
      {
        id: "msg_79",
        role: "user",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000,
        content: "Kako mogu dobiti informacije o gradskim projektima?",
      },
      {
        id: "msg_80",
        role: "assistant",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000 + 900,
        content: "Informacije o gradskim projektima možete pronaći na službenim stranicama Grada Ploča u sekciji 'Projekti' ili možete kontaktirati Odjel za gospodarski razvoj na 020/679-150.",
      },
      {
        id: "msg_81",
        role: "user",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000 + 3000,
        content: "Što je sa zaštitom okoliša?",
      },
      {
        id: "msg_82",
        role: "assistant",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000 + 3800,
        content: "Grad Ploče provodi različite programe zaštite okoliša. Detaljnije informacije možete dobiti kontaktiranjem Odjela za komunalne poslove na 020/679-200 ili pregledom dokumentacije na službenim stranicama.",
      },
      {
        id: "msg_83",
        role: "user",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000 + 5000,
        content: "A što sa recikliranjem?",
      },
      {
        id: "msg_84",
        role: "assistant",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000 + 5800,
        content: "Grad Ploče ima organiziran sustav odvoza i recikliranja otpada. Informacije o rasporedu odvoza i pravilima recikliranja možete pronaći na službenim stranicama ili kontaktirati komunalno poduzeće.",
      },
      {
        id: "msg_85",
        role: "user",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000 + 7000,
        content: "Hvala na informacijama!",
      },
      {
        id: "msg_86",
        role: "assistant",
        timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000 + 7500,
        content: "Nema na čemu! Ako imate dodatna pitanja, slobodno me kontaktirajte.",
      },
    ],
    fallbackCount: 0,
  },

  // L) spam - 4 weeks ago
  {
    conversationId: "conv_ploce_012",
    cityId: "ploce",
    sessionId: "sess_hij456",
    startedAt: Date.now() - 28 * 24 * 60 * 60 * 1000, // 28 days ago (4 weeks)
    category: "spam",
    messages: [
      {
        id: "msg_87",
        role: "user",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000,
        content: "asdfghjkl qwertyuiop zxcvbnm",
      },
      {
        id: "msg_88",
        role: "assistant",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 + 500,
        content: "Žao mi je, ali ne razumijem vaš upit. Molimo postavite konkretno pitanje o službama Grada Ploča, a rado ću vam pomoći.",
      },
      {
        id: "msg_89",
        role: "user",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 + 2000,
        content: "gluposti gluposti gluposti hahahaha",
      },
      {
        id: "msg_90",
        role: "assistant",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 + 2500,
        content: "Molimo postavite ozbiljno pitanje vezano za službe Grada Ploča. Ako imate konkretan upit, rado ću vam pomoći.",
      },
      {
        id: "msg_91",
        role: "user",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 + 4000,
        content: "vi ste sve debili i ništa ne valjate!!!!",
      },
      {
        id: "msg_92",
        role: "assistant",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 + 4500,
        content: "Razumijem da možete biti frustrirani. Ako imate konkretan problem ili pitanje vezano za službe Grada Ploča, molimo kontaktirajte nas na 020/679-100 ili e-mailom na uprava@ploce.hr. Rado ćemo vam pomoći.",
      },
      {
        id: "msg_93",
        role: "user",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 + 6000,
        content: "aaaaaaaaaaaaaaaaaaaa",
      },
      {
        id: "msg_94",
        role: "assistant",
        timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 + 6500,
        content: "Ako nemate konkretno pitanje, molimo završite razgovor. Za pomoć vezanu za službe Grada Ploča, kontaktirajte nas na 020/679-100.",
      },
    ],
    fallbackCount: 0,
  },

  // M) fallback example - 2 weeks ago
  {
    conversationId: "conv_ploce_013",
    cityId: "ploce",
    sessionId: "sess_klm789",
    startedAt: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
    category: "general",
    messages: [
      {
        id: "msg_95",
        role: "user",
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000,
        content: "Koliko košta izdavanje potvrde o prebivalištu?",
      },
      {
        id: "msg_96",
        role: "assistant",
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000 + 800,
        content: "Trenutno ne mogu pronaći informacije o cijeni izdavanja potvrde o prebivalištu u mojoj bazi podataka. Molimo kontaktirajte Odjel za opće poslove direktno na 020/679-110 ili e-mailom na opci.poslovi@ploce.hr za točne informacije o cijenama i postupku izdavanja.",
      },
      {
        id: "msg_97",
        role: "user",
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000 + 3000,
        content: "A možete li provjeriti u dokumentima?",
      },
      {
        id: "msg_98",
        role: "assistant",
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000 + 3800,
        content: "Nažalost, nisam uspio pronaći relevantne informacije o cijenama u dostupnim dokumentima. Molimo kontaktirajte službu direktno kako biste dobili točne i aktualne informacije.",
      },
      {
        id: "msg_99",
        role: "user",
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000 + 5000,
        content: "U redu, hvala.",
      },
      {
        id: "msg_100",
        role: "assistant",
        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000 + 5500,
        content: "Nema na čemu. Ako imate dodatna pitanja, slobodno me kontaktirajte.",
      },
    ],
    fallbackCount: 1,
  },

  // N) mixed conversation - starts as contacts_hours, shifts to forms_requests - 1 week ago
  {
    conversationId: "conv_ploce_014",
    cityId: "ploce",
    sessionId: "sess_nop012",
    startedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    category: "forms_requests", // dominant category
    messages: [
      {
        id: "msg_101",
        role: "user",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
        content: "Kada radi Odjel za opće poslove?",
      },
      {
        id: "msg_102",
        role: "assistant",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 600,
        content: "Odjel za opće poslove radi od ponedjeljka do petka od 8:00 do 16:00 sati. Možete ih kontaktirati telefonski na 020/679-110 ili e-mailom na opci.poslovi@ploce.hr.",
      },
      {
        id: "msg_103",
        role: "user",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 2000,
        content: "Trebam doći po obrazac za promjenu prebivališta. Gdje ga mogu pronaći?",
      },
      {
        id: "msg_104",
        role: "assistant",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 2600,
        content: "Obrazac za promjenu prebivališta možete pronaći na službenim stranicama Grada Ploča u sekciji 'Formulari' ili ga možete preuzeti osobno u Odjelu za opće poslove.",
      },
      {
        id: "msg_105",
        role: "user",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 4000,
        content: "Kako ga trebam ispuniti?",
      },
      {
        id: "msg_106",
        role: "assistant",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 4600,
        content: "Obrazac trebate ispuniti s osobnim podacima, podacima o starom i novom prebivalištu te priložiti potrebnu dokumentaciju (osobna isprava, dokaz o vlasništvu ili najmu). Detaljne upute su navedene na obrascu.",
      },
      {
        id: "msg_107",
        role: "user",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 6000,
        content: "Mogu li ga poslati online?",
      },
      {
        id: "msg_108",
        role: "assistant",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 6600,
        content: "Da, možete poslati obrazac online putem e-građani portala ili e-mailom na opci.poslovi@ploce.hr. Također možete ga dostaviti osobno u Odjelu za opće poslove.",
      },
      {
        id: "msg_109",
        role: "user",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 8000,
        content: "Koliko vremena traje obrada?",
      },
      {
        id: "msg_110",
        role: "assistant",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 8600,
        content: "Obično obrada prijave promjene prebivališta traje 5-7 radnih dana. Nakon obrade, bit ćete obaviješteni o statusu vaše prijave.",
      },
      {
        id: "msg_111",
        role: "user",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 10000,
        content: "Hvala na svim informacijama!",
      },
      {
        id: "msg_112",
        role: "assistant",
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 + 10500,
        content: "Nema na čemu! Ako imate dodatna pitanja, slobodno me kontaktirajte.",
      },
    ],
    fallbackCount: 0,
  },
  // Split conversations
  {
    conversationId: "conv_split_001",
    cityId: "split",
    sessionId: "sess_pqr678",
    startedAt: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    category: "contacts",
    messages: [
      {
        id: "msg_33",
        role: "user",
        timestamp: Date.now() - 1 * 60 * 60 * 1000,
        content: "Gdje se nalazi gradska uprava u Splitu?",
      },
      {
        id: "msg_34",
        role: "assistant",
        timestamp: Date.now() - 1 * 60 * 60 * 1000 + 500,
        content: "Gradska uprava Grada Splita nalazi se na adresi Obala hrvatskog narodnog preporoda 1, 21000 Split. Radno vrijeme je od ponedjeljka do petka od 8:00 do 16:00 sati.",
      },
      {
        id: "msg_35",
        role: "user",
        timestamp: Date.now() - 1 * 60 * 60 * 1000 + 2000,
        content: "Kako mogu kontaktirati gradonačelnika?",
      },
      {
        id: "msg_36",
        role: "assistant",
        timestamp: Date.now() - 1 * 60 * 60 * 1000 + 2500,
        content: "Gradonačelnika možete kontaktirati putem e-maila na adresu gradonacelnik@split.hr ili telefonski na broj 021/310-100.",
      },
    ],
    fallbackCount: 0,
  },
  {
    conversationId: "conv_split_002",
    cityId: "split",
    sessionId: "sess_stu901",
    startedAt: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
    category: "budget",
    messages: [
      {
        id: "msg_37",
        role: "user",
        timestamp: Date.now() - 12 * 60 * 60 * 1000,
        content: "Koliki je proračun Grada Splita za 2024. godinu?",
      },
      {
        id: "msg_38",
        role: "assistant",
        timestamp: Date.now() - 12 * 60 * 60 * 1000 + 800,
        content: "Proračun Grada Splita za 2024. godinu iznosi 850 milijuna kuna. Detaljne informacije o raspodjeli sredstava možete pronaći na službenim stranicama grada.",
      },
      {
        id: "msg_39",
        role: "user",
        timestamp: Date.now() - 12 * 60 * 60 * 1000 + 3000,
        content: "Koliko se troši na obrazovanje?",
      },
      {
        id: "msg_40",
        role: "assistant",
        timestamp: Date.now() - 12 * 60 * 60 * 1000 + 3800,
        content: "Prema proračunu za 2024. godinu, za obrazovanje je predviđeno 120 milijuna kuna. Ovo uključuje potporu osnovnim i srednjim školama te programe obrazovanja odraslih.",
      },
      {
        id: "msg_41",
        role: "user",
        timestamp: Date.now() - 12 * 60 * 60 * 1000 + 5000,
        content: "Hvala!",
      },
      {
        id: "msg_42",
        role: "assistant",
        timestamp: Date.now() - 12 * 60 * 60 * 1000 + 5500,
        content: "Nema na čemu! Ako imate još pitanja, slobodno me pitajte.",
      },
    ],
    fallbackCount: 0,
  },
];

/**
 * Convert mock conversations to analytics events for the store
 */
export function convertMockConversationsToEvents(cityId: string): AnalyticsEvent[] {
  const events: AnalyticsEvent[] = [];
  const cityConversations = mockConversations.filter(conv => conv.cityId === cityId);

  for (const conv of cityConversations) {
    // Add conversation_start event
    events.push({
      id: `mock_conv_start_${conv.conversationId}`,
      type: 'conversation_start',
      cityId: conv.cityId,
      sessionId: conv.sessionId,
      timestamp: conv.startedAt,
      conversationId: conv.conversationId,
    });

    // Add message events
    conv.messages.forEach((msg, index) => {
      events.push({
        id: `mock_msg_${conv.conversationId}_${msg.id}`,
        type: 'message',
        cityId: conv.cityId,
        sessionId: conv.sessionId,
        timestamp: msg.timestamp,
        conversationId: conv.conversationId,
        messageId: msg.id,
        role: msg.role,
        content: msg.content,
        turnIndex: index,
        category: conv.category,
      });
    });

    // Add conversation_end event (use last message timestamp + small offset)
    const lastMessage = conv.messages[conv.messages.length - 1];
    if (lastMessage) {
      events.push({
        id: `mock_conv_end_${conv.conversationId}`,
        type: 'conversation_end',
        cityId: conv.cityId,
        sessionId: conv.sessionId,
        timestamp: lastMessage.timestamp + 1000,
        conversationId: conv.conversationId,
      });
    }

    // Add fallback events if fallbackCount > 0
    if (conv.fallbackCount > 0) {
      for (let i = 0; i < conv.fallbackCount; i++) {
        events.push({
          id: `mock_fallback_${conv.conversationId}_${i}`,
          type: 'fallback',
          cityId: conv.cityId,
          sessionId: conv.sessionId,
          timestamp: conv.startedAt + (i + 1) * 2000,
          question: 'Unable to retrieve answer',
        });
      }
    }
  }

  return events;
}
