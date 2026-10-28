-- Honfoglalo PostgreSQL Database Schema & Initial Seed Data
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role VARCHAR(16) DEFAULT 'user',
  avatar_color VARCHAR(16) DEFAULT 'red',
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  total_points INT DEFAULT 0,
  counties_conquered INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  total_answers INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(32) UNIQUE,
  question_type VARCHAR(24) NOT NULL CHECK (question_type IN ('multiple_choice', 'estimation')),
  category VARCHAR(64) NOT NULL,
  question_text TEXT NOT NULL,
  options_json TEXT,
  correct_index INT,
  estimation_answer NUMERIC,
  unit VARCHAR(32),
  difficulty INT DEFAULT 2,
  status VARCHAR(16) DEFAULT 'approved',
  created_by VARCHAR(64) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  winner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  winner_name VARCHAR(64) NOT NULL,
  game_mode VARCHAR(32) DEFAULT 'singleplayer',
  rounds_played INT DEFAULT 6,
  red_player VARCHAR(64) NOT NULL,
  red_score INT NOT NULL,
  green_player VARCHAR(64) NOT NULL,
  green_score INT NOT NULL,
  blue_player VARCHAR(64) NOT NULL,
  blue_score INT NOT NULL,
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Questions
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_1', 'multiple_choice', 'Történelem', 'Ki volt Magyarország első királya?', '["I. (Szent) István","Géza fejedelem","I. (Szent) László","Árpád fejedelem"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_2', 'multiple_choice', 'Történelem', 'Melyik magyar király nevéhez fűződik a híres reneszánsz könyvtár, a Bibliotheca Corviniana?', '["Hunyadi Mátyás","Károly Róbert","Luxemburgi Zsigmond","Nagy Lajos"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_3', 'multiple_choice', 'Történelem', 'Ki írta a Szózatot?', '["Vörösmarty Mihály","Kölcsey Ferenc","Petőfi Sándor","Arany János"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_4', 'multiple_choice', 'Történelem', 'Melyik vár kapitánya volt Zrínyi Miklós az 1566-os ostrom idején?', '["Szigetvár","Eger","Kőszeg","Drégely"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_5', 'multiple_choice', 'Történelem', 'Melyik dinasztiából származott I. Károly (Károly Róbert) magyar király?', '["Anjou-ház","Jagelló-ház","Luxemburgi-ház","Habsburg-ház"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_6', 'multiple_choice', 'Történelem', 'Ki volt az 1848-as első felelős magyar miniszterelnök?', '["Batthyány Lajos","Kossuth Lajos","Széchenyi István","Deák Ferenc"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_7', 'multiple_choice', 'Történelem', 'Melyik városban kiáltották ki a trónfosztást 1849. április 14-én?', '["Debrecen","Pest","Pozsony","Szeged"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_8', 'multiple_choice', 'Történelem', 'Ki védte Kőszeg várát 1532-ben a szultáni sereg ellen?', '["Jurisics Miklós","Dobó István","Szondi György","Losonczy István"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_9', 'multiple_choice', 'Földrajz', 'Melyik vármegye székhelye Szekszárd?', '["Tolna","Baranya","Somogy","Fejér"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_10', 'multiple_choice', 'Földrajz', 'Melyik vármegye székhelye Tatabánya?', '["Komárom-Esztergom","Fejér","Veszprém","Nógrád"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_11', 'multiple_choice', 'Földrajz', 'Melyik vármegye székhelye Salgótarján?', '["Nógrád","Heves","Borsod-Abaúj-Zemplén","Jász-Nagykun-Szolnok"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_12', 'multiple_choice', 'Földrajz', 'Melyik hegységben található Magyarország legmagasabb pontja, a Kékes?', '["Mátra","Bükk","Börzsöny","Bakony"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_13', 'multiple_choice', 'Földrajz', 'Melyik folyó partján fekszik Szeged belvárosa?', '["Tisza","Duna","Körös","Dráva"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_14', 'multiple_choice', 'Földrajz', 'Melyik Magyarország legnagyobb területű vármegyéje?', '["Bács-Kiskun","Borsod-Abaúj-Zemplén","Pest","Hajdú-Bihar"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_15', 'multiple_choice', 'Földrajz', 'Melyik tó osztozik Magyarország és Ausztria területén?', '["Fertő tó","Velencei-tó","Tisza-tó","Szelidi-tó"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_16', 'multiple_choice', 'Földrajz', 'Melyik vármegye székhelye Kaposvár?', '["Somogy","Zala","Tolna","Baranya"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_17', 'multiple_choice', 'Irodalom és Nyelv', 'Ki írta A Pál utcai fiúk című regényt?', '["Molnár Ferenc","Móra Ferenc","Gárdonyi Géza","Móricz Zsigmond"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_18', 'multiple_choice', 'Irodalom és Nyelv', 'Ki az Egri csillagok főhőse, Cecey Éva férje?', '["Bornemissza Gergely","Jumurdzsák","Török Bálint","Sárközy"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_19', 'multiple_choice', 'Irodalom és Nyelv', 'Ki írta az Abigél című regényt?', '["Szabó Magda","Kosztolányi Dezső","Babits Mihály","Németh László"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_20', 'multiple_choice', 'Irodalom és Nyelv', 'Melyik író alkotta meg Tüskevár és Téli berek világát?', '["Fekete István","Wass Albert","Móra Ferenc","Mikszáth Kálmán"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_21', 'multiple_choice', 'Irodalom és Nyelv', 'Ki írta a Légy jó mindhalálig című regényt?', '["Móricz Zsigmond","Karinthy Frigyes","Krúdy Gyula","Jókai Mór"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_22', 'multiple_choice', 'Irodalom és Nyelv', 'Melyik Jókai Mór-regény főszereplői a Baradlay fivérek?', '["A kőszívű ember fiai","Az arany ember","Egy magyar nábob","Fekete gyémántok"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_23', 'multiple_choice', 'Tudomány és Technika', 'Melyik magyar származású tudós nevéhez fűződik a holográfia feltalálása?', '["Gábor Dénes","Neumann János","Wigner Jenő","Szilárd Leó"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_24', 'multiple_choice', 'Tudomány és Technika', 'Ki kapta a „az anyák megmentője” jelzőt a gyermekágyi láz megelőzéséért?', '["Semmelweis Ignác","Korányi Frigyes","Szent-Györgyi Albert","Békésy György"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_25', 'multiple_choice', 'Tudomány és Technika', 'Mi a golyóstoll feltalálójának, Bíró László Józsefnek a leghíresebb találmánya után számos nyelvben használt elnevezés?', '["Biro","Penna","Stylo","Kuli"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_26', 'multiple_choice', 'Tudomány és Technika', 'Melyik gáz adja a Föld légkörének legnagyobb részét (kb. 78%-át)?', '["Nitrogén","Oxigén","Szén-dioxid","Argon"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_27', 'multiple_choice', 'Tudomány és Technika', 'Melyik bolygót nevezik a „Vörös bolygónak”?', '["Mars","Vénusz","Jupiter","Merkúr"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_28', 'multiple_choice', 'Tudomány és Technika', 'Ki dolgozta ki a modern számítógépek működési elvét (Neumann-elvek)?', '["Neumann János","Kemény János","Simonyi Károly","Bolyai János"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_29', 'multiple_choice', 'Sport', 'Ki szerezte Magyarország első olimpiai bajnoki címét 1896-ban Athénban?', '["Hajós Alfréd","Bauer Rudolf","Halmay Zoltán","Gerevich Aladár"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_30', 'multiple_choice', 'Sport', 'Melyik sportágban szerzett 7 olimpiai aranyérmet Gerevich Aladár?', '["Kardvívás","Vízilabda","Ökölvívás","Kajak-kenu"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_31', 'multiple_choice', 'Sport', 'Ki volt az ötkarikás játékokon 5 aranyérmet szerző legendás magyar úszónő („Egérke”)?', '["Egerszegi Krisztina","Hosszú Katinka","Kovács Ágnes","Gyarmati Andrea"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_32', 'multiple_choice', 'Sport', 'Hány percig tart egy szabványos labdarúgó-mérkőzés rendes játékideje?', '["90 perc","80 perc","60 perc","100 perc"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_33', 'multiple_choice', 'Film, Zene, Művészet', 'Ki festette A magyarok bejövetele (Feszty-körkép) című monumentális alkotást?', '["Feszty Árpád","Munkácsy Mihály","Szinyei Merse Pál","Csontváry Kosztka Tivadar"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_34', 'multiple_choice', 'Film, Zene, Művészet', 'Ki szerezte a Háry János és a Psalmus Hungaricus című zeneműveket?', '["Kodály Zoltán","Bartók Béla","Liszt Ferenc","Erkel Ferenc"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_35', 'multiple_choice', 'Film, Zene, Művészet', 'Ki rendezte a Macskafogó című kultikus magyar animációs filmet?', '["Ternovszky Béla","Jankovics Marcell","Dargay Attila","Nepp József"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_36', 'multiple_choice', 'Film, Zene, Művészet', 'Ki szerezte a Himnusz zenéjét?', '["Erkel Ferenc","Liszt Ferenc","Egressy Béni","Doppler Ferenc"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_37', 'multiple_choice', 'Élővilág', 'Melyik Magyarország legnagyobb testű, fokozottan védett röpképes madara?', '["Túzok","Fehér gólya","Parlagi sas","Szürke gém"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_38', 'multiple_choice', 'Élővilág', 'Melyik hagyományos magyar pásztorkutyafajta szőrzete jellegzetesen zsinóros-nemezelt és leggyakrabban fekete?', '["Puli","Kuvasz","Mudi","Magyar vizsla"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_39', 'multiple_choice', 'Mindennapok és Kultúra', 'Melyik fűszernövény őrleményéről világhírű Szeged és Kalocsa vidéke?', '["Fűszerpaprika","Sáfrány","Majoránna","Kömény"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_40', 'multiple_choice', 'Mindennapok és Kultúra', 'Melyik borvidékünk híres az aszúborairól?', '["Tokaji borvidék","Villányi borvidék","Badacsonyi borvidék","Egri borvidék"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_41', 'multiple_choice', 'Földrajz', 'Melyik vármegyében található a Hortobágyi Nemzeti Park legnagyobb része?', '["Hajdú-Bihar","Szabolcs-Szatmár-Bereg","Békés","Csongrád-Csanád"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_42', 'multiple_choice', 'Földrajz', 'Melyik vármegyében található az Aggteleki-cseppkőbarlang?', '["Borsod-Abaúj-Zemplén","Heves","Nógrád","Szabolcs-Szatmár-Bereg"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_43', 'multiple_choice', 'Történelem', 'Ki volt II. Rákóczi Ferenc édesanyja, aki éveken át védte Munkács várát?', '["Zrínyi Ilona","Báthory Zsófia","Lorántffy Zsuzsanna","Szilágyi Erzsébet"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('mc_44', 'multiple_choice', 'Film, Zene, Művészet', 'Melyik festőnk főműve a Majális (1873)?', '["Szinyei Merse Pál","Munkácsy Mihály","Rippl-Rónai József","Benczúr Gyula"]', 0, NULL, NULL, 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_1', 'estimation', 'Történelem', 'Melyik évben koronázták királlyá I. (Szent) Istvánt (a hagyomány szerinti 1000. december 25. évszáma)?', NULL, NULL, 1000, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_2', 'estimation', 'Történelem', 'Melyik évben zajlott a mohácsi csata?', NULL, NULL, 1526, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_3', 'estimation', 'Történelem', 'Melyik évben adta ki II. András az Aranybullát?', NULL, NULL, 1222, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_4', 'estimation', 'Történelem', 'Melyik évben vívták a nándorfehérvári diadalt Hunyadi János vezetésével?', NULL, NULL, 1456, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_5', 'estimation', 'Történelem', 'Melyik évben történt az egri vár sikeres védelme Dobó István vezetésével?', NULL, NULL, 1552, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_6', 'estimation', 'Történelem', 'Melyik évben jött létre az Osztrák–Magyar Monarchia a kiegyezéssel?', NULL, NULL, 1867, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_7', 'estimation', 'Történelem', 'Melyik évben adták át a budapesti Széchenyi lánchidat?', NULL, NULL, 1849, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_8', 'estimation', 'Történelem', 'Melyik évben indult el a kontinentális Európa első földalattija (a budapesti Millenniumi Földalatti Vasút)?', NULL, NULL, 1896, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_9', 'estimation', 'Történelem', 'Melyik évben repült a világűrbe Farkas Bertalan, az első magyar űrhajós?', NULL, NULL, 1980, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_10', 'estimation', 'Történelem', 'Melyik évben csatlakozott Magyarország az Európai Unióhoz?', NULL, NULL, 2004, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_11', 'estimation', 'Földrajz', 'Hány méter magas Magyarország legmagasabb pontja, a Kékes?', NULL, NULL, 1014, 'méter', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_12', 'estimation', 'Földrajz', 'Hány kilométer a Duna magyarországi főágának hossza?', NULL, NULL, 417, 'km', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_13', 'estimation', 'Földrajz', 'Hány négyzetkilométer a Balaton vízfelülete (kerekítve)?', NULL, NULL, 594, 'km²', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_14', 'estimation', 'Földrajz', 'Hány kilométer hosszú a Balaton (Keszthelytől Balatonakarattyáig)?', NULL, NULL, 77, 'km', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_15', 'estimation', 'Földrajz', 'Hány kerületre oszlik jelenleg Budapest?', NULL, NULL, 23, 'kerület', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_16', 'estimation', 'Földrajz', 'Hány szomszédos országgal határos Magyarország?', NULL, NULL, 7, 'ország', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_17', 'estimation', 'Földrajz', 'Hány négyzetkilométer Magyarország területe (ezerre kerekítve: 93030)?', NULL, NULL, 93030, 'km²', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_18', 'estimation', 'Földrajz', 'Hány méter mély a Balaton legmélyebb pontja, a Tihanyi-kút (kerekítve)?', NULL, NULL, 12, 'méter', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_19', 'estimation', 'Irodalom és Nyelv', 'Hány énekből áll Arany János Toldi című elbeszélő költeménye?', NULL, NULL, 12, 'ének', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_20', 'estimation', 'Irodalom és Nyelv', 'Hány színre oszlik Madách Imre Az ember tragédiája című drámai költeménye?', NULL, NULL, 15, 'szín', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_21', 'estimation', 'Irodalom és Nyelv', 'Melyik évben született Petőfi Sándor?', NULL, NULL, 1823, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_22', 'estimation', 'Irodalom és Nyelv', 'Hány betűből áll a teljes magyar ábécé (a dz, dzs, ny, sz stb. két- és háromjegyű betűkkel együtt)?', NULL, NULL, 44, 'betű', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_23', 'estimation', 'Irodalom és Nyelv', 'Melyik évben kapott irodalmi Nobel-díjat Kertész Imre?', NULL, NULL, 2002, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_24', 'estimation', 'Tudomány és Technika', 'Melyik évben találta fel Rubik Ernő a bűvös kockát (Rubik-kockát)?', NULL, NULL, 1974, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_25', 'estimation', 'Tudomány és Technika', 'Hány kiskockából (oldallap-négyzetből) áll egy klasszikus 3×3×3-as Rubik-kocka teljes külső felülete?', NULL, NULL, 54, 'négyzet', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_26', 'estimation', 'Tudomány és Technika', 'Melyik évben kapott Nobel-díjat Szent-Györgyi Albert a C-vitamin kutatásáért?', NULL, NULL, 1937, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_27', 'estimation', 'Tudomány és Technika', 'Hány csontból áll egy kifejlett felnőtt emberi csontváz?', NULL, NULL, 206, 'csont', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_28', 'estimation', 'Tudomány és Technika', 'Hány kromoszómája van egy egészséges emberi testi sejtnek?', NULL, NULL, 46, 'kromoszóma', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_29', 'estimation', 'Tudomány és Technika', 'Milyen rendszámmal szerepel az arany (Au) a periódusos rendszerben?', NULL, NULL, 79, 'rendszám', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_30', 'estimation', 'Sport', 'Melyik évben rendezték az első újkori nyári olimpiai játékokat Athénban?', NULL, NULL, 1896, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_31', 'estimation', 'Sport', 'Melyik évben játszotta az Aranycsapat a híres 6:3-as győztes mérkőzést Anglia ellen a Wembley-ben?', NULL, NULL, 1953, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_32', 'estimation', 'Sport', 'Hány aranyérmet szerzett Magyarország az 1952-es helsinki nyári olimpián?', NULL, NULL, 16, 'aranyérem', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_33', 'estimation', 'Sport', 'Hány mezőből áll egy szabványos sakktábla?', NULL, NULL, 64, 'mező', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_34', 'estimation', 'Sport', 'Hány méter egy olimpiai úszómedence hossza?', NULL, NULL, 50, 'méter', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_35', 'estimation', 'Film, Zene, Művészet', 'Hány méter magas az Országház kupolája (Szent István-évfordulóra utaló szimbolikus magasság)?', NULL, NULL, 96, 'méter', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_36', 'estimation', 'Film, Zene, Művészet', 'Melyik évben mutatták be Vuk című magyar rajzfilmet a mozikban?', NULL, NULL, 1981, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_37', 'estimation', 'Film, Zene, Művészet', 'Hány billentyű található egy szabványos koncertzongorán?', NULL, NULL, 88, 'billentyű', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_38', 'estimation', 'Élővilág', 'Hány lába van egy póknak?', NULL, NULL, 8, 'láb', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_39', 'estimation', 'Élővilág', 'Hány nyaki csigolyája van a zsiráfnak (akárcsak az embernek)?', NULL, NULL, 7, 'csigolya', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_40', 'estimation', 'Mindennapok és Kultúra', 'Hány lapból áll egy hagyományos magyar kártyapakli?', NULL, NULL, 32, 'kártyalap', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_41', 'estimation', 'Mindennapok és Kultúra', 'Milyen szám szerepel a Kecskeméthez tartozó telefonos körzetszámban (76)?', NULL, NULL, 76, 'körzetszám', 2)
ON CONFLICT (external_id) DO NOTHING;
INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty)
VALUES ('est_42', 'estimation', 'Történelem', 'Melyik évben történt a muhi csata a tatárjárás idején?', NULL, NULL, 1241, 'év', 2)
ON CONFLICT (external_id) DO NOTHING;
