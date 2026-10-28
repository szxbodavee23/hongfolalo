// Comprehensive question bank for Honfoglalo (Multiple Choice & Numeric Estimation)

export const QUESTION_CATEGORIES = {
  HISTORY: 'Történelem',
  GEOGRAPHY: 'Földrajz',
  LITERATURE: 'Irodalom és Nyelv',
  SCIENCE: 'Tudomány és Technika',
  SPORT: 'Sport',
  ARTS: 'Film, Zene, Művészet',
  NATURE: 'Élővilág',
  EVERYDAY: 'Mindennapok és Kultúra'
};

export const ESTIMATION_QUESTIONS = [
  {
    id: 'est_1',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben koronázták királlyá I. (Szent) Istvánt (a hagyomány szerinti 1000. december 25. évszáma)?',
    answer: 1000,
    unit: 'év'
  },
  {
    id: 'est_2',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben zajlott a mohácsi csata?',
    answer: 1526,
    unit: 'év'
  },
  {
    id: 'est_3',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben adta ki II. András az Aranybullát?',
    answer: 1222,
    unit: 'év'
  },
  {
    id: 'est_4',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben vívták a nándorfehérvári diadalt Hunyadi János vezetésével?',
    answer: 1456,
    unit: 'év'
  },
  {
    id: 'est_5',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben történt az egri vár sikeres védelme Dobó István vezetésével?',
    answer: 1552,
    unit: 'év'
  },
  {
    id: 'est_6',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben jött létre az Osztrák–Magyar Monarchia a kiegyezéssel?',
    answer: 1867,
    unit: 'év'
  },
  {
    id: 'est_7',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben adták át a budapesti Széchenyi lánchidat?',
    answer: 1849,
    unit: 'év'
  },
  {
    id: 'est_8',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben indult el a kontinentális Európa első földalattija (a budapesti Millenniumi Földalatti Vasút)?',
    answer: 1896,
    unit: 'év'
  },
  {
    id: 'est_9',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben repült a világűrbe Farkas Bertalan, az első magyar űrhajós?',
    answer: 1980,
    unit: 'év'
  },
  {
    id: 'est_10',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben csatlakozott Magyarország az Európai Unióhoz?',
    answer: 2004,
    unit: 'év'
  },
  {
    id: 'est_11',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány méter magas Magyarország legmagasabb pontja, a Kékes?',
    answer: 1014,
    unit: 'méter'
  },
  {
    id: 'est_12',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány kilométer a Duna magyarországi főágának hossza?',
    answer: 417,
    unit: 'km'
  },
  {
    id: 'est_13',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány négyzetkilométer a Balaton vízfelülete (kerekítve)?',
    answer: 594,
    unit: 'km²'
  },
  {
    id: 'est_14',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány kilométer hosszú a Balaton (Keszthelytől Balatonakarattyáig)?',
    answer: 77,
    unit: 'km'
  },
  {
    id: 'est_15',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány kerületre oszlik jelenleg Budapest?',
    answer: 23,
    unit: 'kerület'
  },
  {
    id: 'est_16',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány szomszédos országgal határos Magyarország?',
    answer: 7,
    unit: 'ország'
  },
  {
    id: 'est_17',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány négyzetkilométer Magyarország területe (ezerre kerekítve: 93030)?',
    answer: 93030,
    unit: 'km²'
  },
  {
    id: 'est_18',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Hány méter mély a Balaton legmélyebb pontja, a Tihanyi-kút (kerekítve)?',
    answer: 12,
    unit: 'méter'
  },
  {
    id: 'est_19',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Hány énekből áll Arany János Toldi című elbeszélő költeménye?',
    answer: 12,
    unit: 'ének'
  },
  {
    id: 'est_20',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Hány színre oszlik Madách Imre Az ember tragédiája című drámai költeménye?',
    answer: 15,
    unit: 'szín'
  },
  {
    id: 'est_21',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Melyik évben született Petőfi Sándor?',
    answer: 1823,
    unit: 'év'
  },
  {
    id: 'est_22',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Hány betűből áll a teljes magyar ábécé (a dz, dzs, ny, sz stb. két- és háromjegyű betűkkel együtt)?',
    answer: 44,
    unit: 'betű'
  },
  {
    id: 'est_23',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Melyik évben kapott irodalmi Nobel-díjat Kertész Imre?',
    answer: 2002,
    unit: 'év'
  },
  {
    id: 'est_24',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Melyik évben találta fel Rubik Ernő a bűvös kockát (Rubik-kockát)?',
    answer: 1974,
    unit: 'év'
  },
  {
    id: 'est_25',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Hány kiskockából (oldallap-négyzetből) áll egy klasszikus 3×3×3-as Rubik-kocka teljes külső felülete?',
    answer: 54,
    unit: 'négyzet'
  },
  {
    id: 'est_26',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Melyik évben kapott Nobel-díjat Szent-Györgyi Albert a C-vitamin kutatásáért?',
    answer: 1937,
    unit: 'év'
  },
  {
    id: 'est_27',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Hány csontból áll egy kifejlett felnőtt emberi csontváz?',
    answer: 206,
    unit: 'csont'
  },
  {
    id: 'est_28',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Hány kromoszómája van egy egészséges emberi testi sejtnek?',
    answer: 46,
    unit: 'kromoszóma'
  },
  {
    id: 'est_29',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Milyen rendszámmal szerepel az arany (Au) a periódusos rendszerben?',
    answer: 79,
    unit: 'rendszám'
  },
  {
    id: 'est_30',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Melyik évben rendezték az első újkori nyári olimpiai játékokat Athénban?',
    answer: 1896,
    unit: 'év'
  },
  {
    id: 'est_31',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Melyik évben játszotta az Aranycsapat a híres 6:3-as győztes mérkőzést Anglia ellen a Wembley-ben?',
    answer: 1953,
    unit: 'év'
  },
  {
    id: 'est_32',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Hány aranyérmet szerzett Magyarország az 1952-es helsinki nyári olimpián?',
    answer: 16,
    unit: 'aranyérem'
  },
  {
    id: 'est_33',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Hány mezőből áll egy szabványos sakktábla?',
    answer: 64,
    unit: 'mező'
  },
  {
    id: 'est_34',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Hány méter egy olimpiai úszómedence hossza?',
    answer: 50,
    unit: 'méter'
  },
  {
    id: 'est_35',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Hány méter magas az Országház kupolája (Szent István-évfordulóra utaló szimbolikus magasság)?',
    answer: 96,
    unit: 'méter'
  },
  {
    id: 'est_36',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Melyik évben mutatták be Vuk című magyar rajzfilmet a mozikban?',
    answer: 1981,
    unit: 'év'
  },
  {
    id: 'est_37',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Hány billentyű található egy szabványos koncertzongorán?',
    answer: 88,
    unit: 'billentyű'
  },
  {
    id: 'est_38',
    category: QUESTION_CATEGORIES.NATURE,
    question: 'Hány lába van egy póknak?',
    answer: 8,
    unit: 'láb'
  },
  {
    id: 'est_39',
    category: QUESTION_CATEGORIES.NATURE,
    question: 'Hány nyaki csigolyája van a zsiráfnak (akárcsak az embernek)?',
    answer: 7,
    unit: 'csigolya'
  },
  {
    id: 'est_40',
    category: QUESTION_CATEGORIES.EVERYDAY,
    question: 'Hány lapból áll egy hagyományos magyar kártyapakli?',
    answer: 32,
    unit: 'kártyalap'
  },
  {
    id: 'est_41',
    category: QUESTION_CATEGORIES.EVERYDAY,
    question: 'Milyen szám szerepel a Kecskeméthez tartozó telefonos körzetszámban (76)?',
    answer: 76,
    unit: 'körzetszám'
  },
  {
    id: 'est_42',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik évben történt a muhi csata a tatárjárás idején?',
    answer: 1241,
    unit: 'év'
  }
];

export const MULTIPLE_CHOICE_QUESTIONS = [
  {
    id: 'mc_1',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Ki volt Magyarország első királya?',
    options: ['I. (Szent) István', 'Géza fejedelem', 'I. (Szent) László', 'Árpád fejedelem'],
    correctIndex: 0
  },
  {
    id: 'mc_2',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik magyar király nevéhez fűződik a híres reneszánsz könyvtár, a Bibliotheca Corviniana?',
    options: ['Hunyadi Mátyás', 'Károly Róbert', 'Luxemburgi Zsigmond', 'Nagy Lajos'],
    correctIndex: 0
  },
  {
    id: 'mc_3',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Ki írta a Szózatot?',
    options: ['Vörösmarty Mihály', 'Kölcsey Ferenc', 'Petőfi Sándor', 'Arany János'],
    correctIndex: 0
  },
  {
    id: 'mc_4',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik vár kapitánya volt Zrínyi Miklós az 1566-os ostrom idején?',
    options: ['Szigetvár', 'Eger', 'Kőszeg', 'Drégely'],
    correctIndex: 0
  },
  {
    id: 'mc_5',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik dinasztiából származott I. Károly (Károly Róbert) magyar király?',
    options: ['Anjou-ház', 'Jagelló-ház', 'Luxemburgi-ház', 'Habsburg-ház'],
    correctIndex: 0
  },
  {
    id: 'mc_6',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Ki volt az 1848-as első felelős magyar miniszterelnök?',
    options: ['Batthyány Lajos', 'Kossuth Lajos', 'Széchenyi István', 'Deák Ferenc'],
    correctIndex: 0
  },
  {
    id: 'mc_7',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Melyik városban kiáltották ki a trónfosztást 1849. április 14-én?',
    options: ['Debrecen', 'Pest', 'Pozsony', 'Szeged'],
    correctIndex: 0
  },
  {
    id: 'mc_8',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Ki védte Kőszeg várát 1532-ben a szultáni sereg ellen?',
    options: ['Jurisics Miklós', 'Dobó István', 'Szondi György', 'Losonczy István'],
    correctIndex: 0
  },
  {
    id: 'mc_9',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik vármegye székhelye Szekszárd?',
    options: ['Tolna', 'Baranya', 'Somogy', 'Fejér'],
    correctIndex: 0
  },
  {
    id: 'mc_10',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik vármegye székhelye Tatabánya?',
    options: ['Komárom-Esztergom', 'Fejér', 'Veszprém', 'Nógrád'],
    correctIndex: 0
  },
  {
    id: 'mc_11',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik vármegye székhelye Salgótarján?',
    options: ['Nógrád', 'Heves', 'Borsod-Abaúj-Zemplén', 'Jász-Nagykun-Szolnok'],
    correctIndex: 0
  },
  {
    id: 'mc_12',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik hegységben található Magyarország legmagasabb pontja, a Kékes?',
    options: ['Mátra', 'Bükk', 'Börzsöny', 'Bakony'],
    correctIndex: 0
  },
  {
    id: 'mc_13',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik folyó partján fekszik Szeged belvárosa?',
    options: ['Tisza', 'Duna', 'Körös', 'Dráva'],
    correctIndex: 0
  },
  {
    id: 'mc_14',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik Magyarország legnagyobb területű vármegyéje?',
    options: ['Bács-Kiskun', 'Borsod-Abaúj-Zemplén', 'Pest', 'Hajdú-Bihar'],
    correctIndex: 0
  },
  {
    id: 'mc_15',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik tó osztozik Magyarország és Ausztria területén?',
    options: ['Fertő tó', 'Velencei-tó', 'Tisza-tó', 'Szelidi-tó'],
    correctIndex: 0
  },
  {
    id: 'mc_16',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik vármegye székhelye Kaposvár?',
    options: ['Somogy', 'Zala', 'Tolna', 'Baranya'],
    correctIndex: 0
  },
  {
    id: 'mc_17',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Ki írta A Pál utcai fiúk című regényt?',
    options: ['Molnár Ferenc', 'Móra Ferenc', 'Gárdonyi Géza', 'Móricz Zsigmond'],
    correctIndex: 0
  },
  {
    id: 'mc_18',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Ki az Egri csillagok főhőse, Cecey Éva férje?',
    options: ['Bornemissza Gergely', 'Jumurdzsák', 'Török Bálint', 'Sárközy'],
    correctIndex: 0
  },
  {
    id: 'mc_19',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Ki írta az Abigél című regényt?',
    options: ['Szabó Magda', 'Kosztolányi Dezső', 'Babits Mihály', 'Németh László'],
    correctIndex: 0
  },
  {
    id: 'mc_20',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Melyik író alkotta meg Tüskevár és Téli berek világát?',
    options: ['Fekete István', 'Wass Albert', 'Móra Ferenc', 'Mikszáth Kálmán'],
    correctIndex: 0
  },
  {
    id: 'mc_21',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Ki írta a Légy jó mindhalálig című regényt?',
    options: ['Móricz Zsigmond', 'Karinthy Frigyes', 'Krúdy Gyula', 'Jókai Mór'],
    correctIndex: 0
  },
  {
    id: 'mc_22',
    category: QUESTION_CATEGORIES.LITERATURE,
    question: 'Melyik Jókai Mór-regény főszereplői a Baradlay fivérek?',
    options: ['A kőszívű ember fiai', 'Az arany ember', 'Egy magyar nábob', 'Fekete gyémántok'],
    correctIndex: 0
  },
  {
    id: 'mc_23',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Melyik magyar származású tudós nevéhez fűződik a holográfia feltalálása?',
    options: ['Gábor Dénes', 'Neumann János', 'Wigner Jenő', 'Szilárd Leó'],
    correctIndex: 0
  },
  {
    id: 'mc_24',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Ki kapta a „az anyák megmentője” jelzőt a gyermekágyi láz megelőzéséért?',
    options: ['Semmelweis Ignác', 'Korányi Frigyes', 'Szent-Györgyi Albert', 'Békésy György'],
    correctIndex: 0
  },
  {
    id: 'mc_25',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Mi a golyóstoll feltalálójának, Bíró László Józsefnek a leghíresebb találmánya után számos nyelvben használt elnevezés?',
    options: ['Biro', 'Penna', 'Stylo', 'Kuli'],
    correctIndex: 0
  },
  {
    id: 'mc_26',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Melyik gáz adja a Föld légkörének legnagyobb részét (kb. 78%-át)?',
    options: ['Nitrogén', 'Oxigén', 'Szén-dioxid', 'Argon'],
    correctIndex: 0
  },
  {
    id: 'mc_27',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Melyik bolygót nevezik a „Vörös bolygónak”?',
    options: ['Mars', 'Vénusz', 'Jupiter', 'Merkúr'],
    correctIndex: 0
  },
  {
    id: 'mc_28',
    category: QUESTION_CATEGORIES.SCIENCE,
    question: 'Ki dolgozta ki a modern számítógépek működési elvét (Neumann-elvek)?',
    options: ['Neumann János', 'Kemény János', 'Simonyi Károly', 'Bolyai János'],
    correctIndex: 0
  },
  {
    id: 'mc_29',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Ki szerezte Magyarország első olimpiai bajnoki címét 1896-ban Athénban?',
    options: ['Hajós Alfréd', 'Bauer Rudolf', 'Halmay Zoltán', 'Gerevich Aladár'],
    correctIndex: 0
  },
  {
    id: 'mc_30',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Melyik sportágban szerzett 7 olimpiai aranyérmet Gerevich Aladár?',
    options: ['Kardvívás', 'Vízilabda', 'Ökölvívás', 'Kajak-kenu'],
    correctIndex: 0
  },
  {
    id: 'mc_31',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Ki volt az ötkarikás játékokon 5 aranyérmet szerző legendás magyar úszónő („Egérke”)?',
    options: ['Egerszegi Krisztina', 'Hosszú Katinka', 'Kovács Ágnes', 'Gyarmati Andrea'],
    correctIndex: 0
  },
  {
    id: 'mc_32',
    category: QUESTION_CATEGORIES.SPORT,
    question: 'Hány percig tart egy szabványos labdarúgó-mérkőzés rendes játékideje?',
    options: ['90 perc', '80 perc', '60 perc', '100 perc'],
    correctIndex: 0
  },
  {
    id: 'mc_33',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Ki festette A magyarok bejövetele (Feszty-körkép) című monumentális alkotást?',
    options: ['Feszty Árpád', 'Munkácsy Mihály', 'Szinyei Merse Pál', 'Csontváry Kosztka Tivadar'],
    correctIndex: 0
  },
  {
    id: 'mc_34',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Ki szerezte a Háry János és a Psalmus Hungaricus című zeneműveket?',
    options: ['Kodály Zoltán', 'Bartók Béla', 'Liszt Ferenc', 'Erkel Ferenc'],
    correctIndex: 0
  },
  {
    id: 'mc_35',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Ki rendezte a Macskafogó című kultikus magyar animációs filmet?',
    options: ['Ternovszky Béla', 'Jankovics Marcell', 'Dargay Attila', 'Nepp József'],
    correctIndex: 0
  },
  {
    id: 'mc_36',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Ki szerezte a Himnusz zenéjét?',
    options: ['Erkel Ferenc', 'Liszt Ferenc', 'Egressy Béni', 'Doppler Ferenc'],
    correctIndex: 0
  },
  {
    id: 'mc_37',
    category: QUESTION_CATEGORIES.NATURE,
    question: 'Melyik Magyarország legnagyobb testű, fokozottan védett röpképes madara?',
    options: ['Túzok', 'Fehér gólya', 'Parlagi sas', 'Szürke gém'],
    correctIndex: 0
  },
  {
    id: 'mc_38',
    category: QUESTION_CATEGORIES.NATURE,
    question: 'Melyik hagyományos magyar pásztorkutyafajta szőrzete jellegzetesen zsinóros-nemezelt és leggyakrabban fekete?',
    options: ['Puli', 'Kuvasz', 'Mudi', 'Magyar vizsla'],
    correctIndex: 0
  },
  {
    id: 'mc_39',
    category: QUESTION_CATEGORIES.EVERYDAY,
    question: 'Melyik fűszernövény őrleményéről világhírű Szeged és Kalocsa vidéke?',
    options: ['Fűszerpaprika', 'Sáfrány', 'Majoránna', 'Kömény'],
    correctIndex: 0
  },
  {
    id: 'mc_40',
    category: QUESTION_CATEGORIES.EVERYDAY,
    question: 'Melyik borvidékünk híres az aszúborairól?',
    options: ['Tokaji borvidék', 'Villányi borvidék', 'Badacsonyi borvidék', 'Egri borvidék'],
    correctIndex: 0
  },
  {
    id: 'mc_41',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik vármegyében található a Hortobágyi Nemzeti Park legnagyobb része?',
    options: ['Hajdú-Bihar', 'Szabolcs-Szatmár-Bereg', 'Békés', 'Csongrád-Csanád'],
    correctIndex: 0
  },
  {
    id: 'mc_42',
    category: QUESTION_CATEGORIES.GEOGRAPHY,
    question: 'Melyik vármegyében található az Aggteleki-cseppkőbarlang?',
    options: ['Borsod-Abaúj-Zemplén', 'Heves', 'Nógrád', 'Szabolcs-Szatmár-Bereg'],
    correctIndex: 0
  },
  {
    id: 'mc_43',
    category: QUESTION_CATEGORIES.HISTORY,
    question: 'Ki volt II. Rákóczi Ferenc édesanyja, aki éveken át védte Munkács várát?',
    options: ['Zrínyi Ilona', 'Báthory Zsófia', 'Lorántffy Zsuzsanna', 'Szilágyi Erzsébet'],
    correctIndex: 0
  },
  {
    id: 'mc_44',
    category: QUESTION_CATEGORIES.ARTS,
    question: 'Melyik festőnk főműve a Majális (1873)?',
    options: ['Szinyei Merse Pál', 'Munkácsy Mihály', 'Rippl-Rónai József', 'Benczúr Gyula'],
    correctIndex: 0
  }
];
