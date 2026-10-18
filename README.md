# 🪵 Holzhaus-Planer

**Favázas kerti ház tervező a böngészőben. Méretezd át a házat, és minden azonnal újraszámolódik, a betonlemeztől a gerinccserépig.**

A Holzhaus-Planer egy téglalap alaprajzú, könnyűszerkezetes (favázas) kerti épület (szerszámos ház, műhely, kerti szoba) megtervezésére készült. A méretek, a rétegrend és a tetőforma megadása után a program elkészíti:

- a **teljes anyaglistát** rétegenként, a számítás menetével együtt;
- a **méretezett tervrajzokat** (alaprajz, falnézetek, metszet, tető, alap);
- a **vágási tervet**: melyik darab melyik szálból jön ki, és mennyi a maradék;
- a **rögzítési pontokat** a rajzon, darabszámra egyezően az anyaglistával.

![Falnézet kijelölt oszloppal és adatlappal](docs/kepek/falnezet-adatlap.png)

---

## ✨ Funkciók

### Lépésről lépésre
A felület hét lépésre bomlik, amelyek között szabadon lehet ugrálni:

| Lépés | Amit itt beállítasz |
|---|---|
| **1. Épület** | szélesség, hosszúság, falmagasság, tetőforma (lapos / félnyereg / nyereg) |
| **2. Alap** | betonlemez, talajcsavar, pontalap vagy betonpillér (az utóbbi három gerendakerettel); betonlemeznél vastagság, betonminőség, sóderágy, betonháló; pontalapnál és betonpillérnél talpméret, alapozási mélység, betonosztály, pillér; opcionális fa padló (gerendakeretes alapnál kötelező) |
| **3. Falak** | oszlop-keresztmetszet és -kiosztás, koszorú, rétegrend (belső burkolat, párazáró, szigetelés, OSB, szélzáró, léc, külső burkolat) |
| **4. Nyílászárók** | ajtók és ablakok mérete, helye, mellvédmagassága; húzással is mozgathatók |
| **5. Tető** | dőlésszög, szarufa, túlnyúlások, deszkázat / OSB, alátétfólia, ellenléc, tetőléc, héjazat (cserép, trapézlemez, zsindely, EPDM, állókorcos alumíniumlemez), kiegészítők |
| **6. Anyaglista** | ráhagyások, kereshető anyaglista, vágási terv |
| **7. Szerelés** | lépésenkénti építési útmutató 3D-vel, a lépés anyagával, darabjaival, csavarjaival és teendőivel |

A lépésjelen ✓ mutatja, ha minden mező rendben van, és piros pötty, ha valahol hiba van. A program ilyenkor is az utolsó érvényes állapotot rajzolja és számolja.

### Interaktív tervrajz
- Sötét, „kék tervrajz” stílusú, **nagyítható és mozgatható** rajzvászon (görgő, szóköz + húzás, `+` `−` `0`).
- **Rétegek** ki-be kapcsolhatók: váz, burkolat/OSB, lécezés, rögzítések, méretek, rács.
- **Egérrel ráállva** minden elemről buborék jelenik meg: méret, pozíció, szomszédoktól mért távolság, rögzítés. Közben **ideiglenes méretvonalak** mutatják a távolságokat.
- **Kattintásra** adatlap nyílik, benne a **vágási tervvel**. A `←` `→` billentyűkkel lehet a szomszédos elemre lépni.
- A **rögzítési pontok** típus szerint megkülönböztetve jelennek meg: ászokcsavar, vázcsavar, OSB-csavar, viharkapocs.
- A feliratok és jelölések **minden nagyításnál olvashatók** maradnak.

![Tetőnézet szarufákkal, lécekkel és viharkapcsokkal](docs/kepek/tetonezet.png)

### 3D nézet
- A felső sáv **3D** gombja lebegő ablakot nyit a rajzvászon fölött: a teljes ház térben, rétegenként saját színnel (váz, OSB, fóliák, szigetelés, burkolatok, tető, nyílászárók).
- Az ablak a fejlécénél fogva **mozgatható**, a sarkánál **átméretezhető**, és ⤢ gombbal a teljes vászonra nagyítható. Helye, mérete és a rétegek állapota megmarad.
- **Forgatás** bal egérgombbal, **nagyítás** görgővel, **mozgatás** jobb gombbal vagy Shift + bal gombbal. Gyorsnézetek: **Persp.**, **É**, **K**, **D**, **Ny**, **Felül**, ⟲ alaphelyzet.
- A **Rétegek** panelen minden réteg külön ki-be kapcsolható; a **Csak váz** gomb a burkolatok nélküli vázszerkezetet mutatja.
- **Ráállva** az elem neve buborékban jelenik meg, **kattintásra** kijelölődik: megnyílik az adatlapja, a 2D rajz pedig átvált arra a nézetre, amelyik ábrázolja. A 2D-ben kijelölt elem a 3D-ben is kiemelődik.
- A 3D rész csak az ablak első megnyitásakor töltődik be, így az alkalmazás indulását nem lassítja. WebGL-képes böngésző kell hozzá.

### Szerelési útmutató
- A **7. Szerelés** lépés sorban végigvezet az építésen: alap, padló, falak (előbb a két futó fal), felső koszorú és OSB, tetőváz, tetőrétegek, héjazat, kiegészítők, nyílászárók, külső és belső rétegek. Csak azok a lépések jelennek meg, amelyek a tervben szerepelnek.
- Bal oldalt a lépések listája rövid összesítővel (pl. „7 oszlop, 74 csavar”), középen a 3D kép: ami eddig felépült, és kiemelve az, ami most kerül fel. A kamera a teljes házra igazít, így minden lépés azonos léptékű; lépésváltáskor a helyén marad.
- Alatta a lépés **anyaga**: a faanyag-darabok a vágási terv szálára hivatkozva, a csavarok darabszáma (a beszerzendő doboz halvány megjegyzésként), a többi anyag mennyisége, valamint a terv számaival kitöltött **teendők**.
- Egy darab- vagy csavarsorra állva (vagy kattintva) a 3D-ben az érintett elemek kiemelődnek; a 3D-ben elemre kattintva megnyílik az adatlapja.
- Lépni az **Előző / Következő** gombbal, a listában kattintva vagy a `←` `→` billentyűkkel lehet. A lebegő 3D ablak ebben a lépésben rejtve marad.

### Anyaglista, ami meg is magyarázza magát
Minden sor mellett ott a számítás, például:

> 13,44 m² × 0,12 m = 1,6128 m³ beton × 300 kg/m³ = 483,84 kg → **484 kg cement (20 zsák)**

- **Alap:** beton, cement (kg és zsák), betonsóder, víz, betonháló (tábla és kg), zúzottkő ágy, PE fólia, zsaluzás.
- **Falak és tető:** faanyag szálhosszra optimalizálva (pl. „Fenyő palló 50×100, 5 m – 18 szál”), OSB, szigetelés, fóliák, burkolatok, héjazat.
- **Kiegészítők:** ereszcsatorna, toldók, tartók, lefolyó, homlok- és oromdeszka, gerinccserép.
- **Kötőelemek:** ászokcsavar, vázcsavar, OSB-csavar, viharkapocs, szegek. Ahol a rajz megmutatja a pontokat, a darabszám pontosan ezekből jön.
- A **„Mutasd a rajzon”** gombra a program a megfelelő nézetre ugrik, és kiemeli az érintett elemeket.

### Export és mentés
- **PDF:** címlap, tervrajzok világos nyomtatási színekkel, anyaglista és vágási terv. A magyar ékezetekhez beágyazott betűkészletet használ.
- **CSV:** az anyaglista Excelben megnyitható formában (UTF-8, pontosvessző, tizedesvessző).
- **JSON:** a terv mentése és visszatöltése. A betöltés minden mezőt ellenőriz.

---

## 🚀 Indítás

Szükséges hozzá a [Node.js](https://nodejs.org/) 20-as vagy újabb verziója.

```bash
git clone https://github.com/HernyikRichard/Holzhaus-Planer.git
cd Holzhaus-Planer
npm install
npm run dev
```

Ezután nyisd meg a kiírt címet (általában `http://localhost:5173`).

| Parancs | Mit csinál |
|---|---|
| `npm run dev` | fejlesztői szerver, azonnali frissítéssel |
| `npm run build` | típusellenőrzés és éles build a `dist/` mappába |
| `npm test` | az összes automatikus teszt futtatása |

Az éles build statikus fájlokból áll, így bármilyen webtárhelyre (pl. GitHub Pages) feltehető.

---

## 🧱 Felépítés

```
src/
  model/     a terv adatmodellje, alapértékek, validáció, mentés/betöltés
  catalog/   szabványos termékméretek és alapértékek (OSB tábla, betonháló, cementzsák, …)
  calc/      számítómotor: alap, padló, falak, nyílászárók, tető, kiegészítők, kötőelemek, darabolás
  scene/     elemlista: minden oszlop, szarufa, tábla és csavar saját azonosítóval és helyzettel
  viewer/    SVG-tervrajzok, kamera (nagyítás/mozgatás), rétegek, kiemelés
  three-d/   3D modell az elemlistából és a rétegrendből; Three.js-kirajzoló (külön, lusta betöltésű csomag)
  assembly/  szerelési lépések: elemek, darabok, csavarok, anyagsorok és teendők lépésenként
  app/       Preact-felület: lépések, rajzvászon, buborék, adatlap, anyaglista, vágási terv, szerelés
  export/    PDF, CSV, letöltés
```

A számítás és a rajz **ugyanabból az elemlistából** dolgozik, ezért ami a rajzon látszik, az szerepel az anyaglistában is, és fordítva.

**Technológia:** TypeScript · Preact · Vite · Vitest · jsPDF + svg2pdf.js · Three.js

---

## ⚠️ Fontos tudnivalók

- A program **nem végez statikai méretezést**. Ha a szarufa fesztávja a keresztmetszetéhez képest túl nagy, figyelmeztet, de a szerkezetet építés előtt **szakemberrel ellenőriztesd**.
- A **tetőhajlást a héjazathoz** is ellenőrzi (cserép legalább 22°, zsindely 15°, trapézlemez 5°, állókorcos lemez 3°; az EPDM-nek nincs alsó határa): túl lapos tetőnél figyelmeztet, és megfelelő héjazatot ajánl. Lapostetőre váltáskor a cserép és a zsindely helyett automatikusan EPDM lesz.
- A talajcsavaros alap **támasz- és fesztávtáblázata tájékoztató**, nem statikai méretezés; a talajcsavarok teherbírását és mélységét a talajviszonyok alapján ellenőriztesd.
- A pontalap és a betonpillér **támaszköz- és talpméretei tájékoztatók**, nem statikai méretezés; a talp méretét és az alapozási mélységet a talajviszonyok és a fagyhatár alapján ellenőriztesd.
- A mennyiségek **becslések** a megadott ráhagyásokkal. Rendelés előtt érdemes a tüzéppel egyeztetni a kapható méreteket.
- Jelenleg csak **téglalap alaprajzú**, válaszfal nélküli épületet és **betonlemez**, **talajcsavar**, **pontalap** vagy **betonpillér** alapozást kezel. Árakat nem számol.
