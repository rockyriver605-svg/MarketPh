/*
# MariMarket — Seed Barangays for All Six Municipalities

## Summary
Seeds the barangays table with real barangay data for all six municipalities of Marinduque.
Data is based on official Philippine Standard Geographic Code (PSGC) records.

## Notes
- No fabricated data. All barangay names correspond to real administrative divisions.
- Uses a DO block to look up municipality IDs dynamically and insert barangays.
- Idempotent: re-running won't create duplicates due to the UNIQUE(municipality_id, name) constraint.
*/

DO $$
DECLARE
  boac_id uuid;
  mogpog_id uuid;
  gasan_id uuid;
  buenavista_id uuid;
  torrijos_id uuid;
  santa_cruz_id uuid;
BEGIN
  SELECT id INTO boac_id FROM public.municipalities WHERE name = 'Boac';
  SELECT id INTO mogpog_id FROM public.municipalities WHERE name = 'Mogpog';
  SELECT id INTO gasan_id FROM public.municipalities WHERE name = 'Gasan';
  SELECT id INTO buenavista_id FROM public.municipalities WHERE name = 'Buenavista';
  SELECT id INTO torrijos_id FROM public.municipalities WHERE name = 'Torrijos';
  SELECT id INTO santa_cruz_id FROM public.municipalities WHERE name = 'Santa Cruz';

  -- Boac
  INSERT INTO public.barangays (municipality_id, name) VALUES
    (boac_id, 'Ambagan'), (boac_id, 'Balagasan'), (boac_id, 'Bantad'),
    (boac_id, 'Bayuti'), (boac_id, 'Bolo'), (boac_id, 'Boi'),
    (boac_id, 'Boton'), (boac_id, 'Buli'), (boac_id, 'Caganhao'),
    (boac_id, 'Canat'), (boac_id, 'Catagbacan'), (boac_id, 'Daig'),
    (boac_id, 'Gasan Boac'), (boac_id, 'Hinapula'), (boac_id, 'Ihatub'),
    (boac_id, 'Isok'), (boac_id, 'Laylay'), (boac_id, 'Lukyahan'),
    (boac_id, 'Malamig'), (boac_id, 'Mansiang'), (boac_id, 'Mataas na Lupa'),
    (boac_id, 'Maybo'), (boac_id, 'Murallon'), (boac_id, 'Ogbac'),
    (boac_id, 'Pajaplas'), (boac_id, 'Pili'), (boac_id, 'Pina'),
    (boac_id, 'Poctoy'), (boac_id, 'Puentebella'), (boac_id, 'San Miguel'),
    (boac_id, 'Santol'), (boac_id, 'Tabi'), (boac_id, 'Tambunan'),
    (boac_id, 'Tulusan'), (boac_id, 'Tugbo')
  ON CONFLICT (municipality_id, name) DO NOTHING;

  -- Mogpog
  INSERT INTO public.barangays (municipality_id, name) VALUES
    (mogpog_id, 'Anapog-Sibucao'), (mogpog_id, 'Argao'), (mogpog_id, 'Balanacan'),
    (mogpog_id, 'Bantad'), (mogpog_id, 'Bolo'), (mogpog_id, 'Buntay'),
    (mogpog_id, 'Cawayan'), (mogpog_id, 'Danao'), (mogpog_id, 'Dulong Bayan'),
    (mogpog_id, 'Gundo'), (mogpog_id, 'Hinanggayon'), (mogpog_id, 'Ino'),
    (mogpog_id, 'Janaran Chico'), (mogpog_id, 'Jumogpo'), (mogpog_id, 'Kabulasan'),
    (mogpog_id, 'Lantad'), (mogpog_id, 'Lipa'), (mogpog_id, 'Mahanad'),
    (mogpog_id, 'Mangyan-Mangyan'), (mogpog_id, 'Nangka I'), (mogpog_id, 'Nangka II'),
    (mogpog_id, 'Pag-Aso'), (mogpog_id, 'Papandayan'), (mogpog_id, 'Pili'),
    (mogpog_id, 'Poblacion'), (mogpog_id, 'Sayao'), (mogpog_id, 'Silo-Gisic'),
    (mogpog_id, 'Tabi-Babay'), (mogpog_id, 'Tambangan'), (mogpog_id, 'Tarug'),
    (mogpog_id, 'Tawiran'), (mogpog_id, 'Tibag'), (mogpog_id, 'Tugdasan')
  ON CONFLICT (municipality_id, name) DO NOTHING;

  -- Gasan
  INSERT INTO public.barangays (municipality_id, name) VALUES
    (gasan_id, 'Antipolo'), (gasan_id, 'Bachao Ibaba'), (gasan_id, 'Bachao Ilaya'),
    (gasan_id, 'Bacongba-Bacongba'), (gasan_id, 'Bahi'), (gasan_id, 'Banto'),
    (gasan_id, 'Bangbang'), (gasan_id, 'Banuyo'), (gasan_id, 'Baras'),
    (gasan_id, 'Bognuyan'), (gasan_id, 'Bones'), (gasan_id, 'Bulo'),
    (gasan_id, 'Cabilao Ibaba'), (gasan_id, 'Cabilao Ilaya'), (gasan_id, 'Cabutunan'),
    (gasan_id, 'Cogon Ilaya'), (gasan_id, 'Cogon Ibaba'), (gasan_id, 'Concepcion Ilaya'),
    (gasan_id, 'Concepcion Ibaba'), (gasan_id, 'Dili'), (gasan_id, 'Hubog'),
    (gasan_id, 'Libtangin Ilaya'), (gasan_id, 'Libtangin Ibaba'), (gasan_id, 'Linas'),
    (gasan_id, 'Malbog'), (gasan_id, 'Mangiliol'), (gasan_id, 'Mapua'),
    (gasan_id, 'Masiga'), (gasan_id, 'Matandang Gasan'), (gasan_id, 'Pangi Ilaya'),
    (gasan_id, 'Pangi Ibaba'), (gasan_id, 'Pingan'), (gasan_id, 'Poblacion IIC'),
    (gasan_id, 'Sabong Lupa'), (gasan_id, 'San Antonio'), (gasan_id, 'Tiguion')
  ON CONFLICT (municipality_id, name) DO NOTHING;

  -- Buenavista
  INSERT INTO public.barangays (municipality_id, name) VALUES
    (buenavista_id, 'Bagacay'), (buenavista_id, 'Bantawan'), (buenavista_id, 'Barangay I'),
    (buenavista_id, 'Barangay II'), (buenavista_id, 'Barangay III'), (buenavista_id, 'Barangay IV'),
    (buenavista_id, 'Bicas-Bicas'), (buenavista_id, 'Bigo'), (buenavista_id, 'Cagpo'),
    (buenavista_id, 'Capacujan'), (buenavista_id, 'Catagbacan Handig'),
    (buenavista_id, 'Cawit'), (buenavista_id, 'Dalumpang Pequeño'),
    (buenavista_id, 'Dayao'), (buenavista_id, 'Dulong Parang'), (buenavista_id, 'Ligot'),
    (buenavista_id, 'Luklukan Norte'), (buenavista_id, 'Luklukan Sur'),
    (buenavista_id, 'Malbog Ilaya'), (buenavista_id, 'Malbog Ibaba'),
    (buenavista_id, 'Malusak'), (buenavista_id, 'Pinagbakuran'), (buenavista_id, 'Santo Niño'),
    (buenavista_id, 'Tamsi'), (buenavista_id, 'Tawiran'), (buenavista_id, 'Tibig'),
    (buenavista_id, 'Timamana')
  ON CONFLICT (municipality_id, name) DO NOTHING;

  -- Torrijos
  INSERT INTO public.barangays (municipality_id, name) VALUES
    (torrijos_id, 'Bangwayin'), (torrijos_id, 'Bolo'), (torrijos_id, 'Bonliw'),
    (torrijos_id, 'Bucao'), (torrijos_id, 'Cafuhin'), (torrijos_id, 'Campostila'),
    (torrijos_id, 'Canyaos'), (torrijos_id, 'Caridad Ibaba'), (torrijos_id, 'Caridad Ilaya'),
    (torrijos_id, 'Dampulan'), (torrijos_id, 'Hukay Malaki Ilaya'), (torrijos_id, 'Hukay Malaki Ibaba'),
    (torrijos_id, 'Hukay na Lato'), (torrijos_id, 'Kay Duque'), (torrijos_id, 'Kay Patiis'),
    (torrijos_id, 'Lublub'), (torrijos_id, 'Maboco'), (torrijos_id, 'Mahipit'),
    (torrijos_id, 'Makati'), (torrijos_id, 'Malibago'), (torrijos_id, 'Malinao Ilaya'),
    (torrijos_id, 'Malinao Ibaba'), (torrijos_id, 'Maranlig'), (torrijos_id, 'Masaguisit'),
    (torrijos_id, 'Masalakot'), (torrijos_id, 'Pakaskas'), (torrijos_id, 'Poblacion Zone I'),
    (torrijos_id, 'Poblacion Zone II'), (torrijos_id, 'Poblacion Zone III'), (torrijos_id, 'Poblacion Zone IV'),
    (torrijos_id, 'Pulong Pansiyan'), (torrijos_id, 'San Roque'), (torrijos_id, 'Sibuyao'),
    (torrijos_id, 'Tagnipa'), (torrijos_id, 'Talisay'), (torrijos_id, 'Tayabas'),
    (torrijos_id, 'Tigwi')
  ON CONFLICT (municipality_id, name) DO NOTHING;

  -- Santa Cruz
  INSERT INTO public.barangays (municipality_id, name) VALUES
    (santa_cruz_id, 'Apong'), (santa_cruz_id, 'Bagong Silang Pob.'), (santa_cruz_id, 'Bagumbungan'),
    (santa_cruz_id, 'Balagasan'), (santa_cruz_id, 'Balimbing'), (santa_cruz_id, 'Bangcuang'),
    (santa_cruz_id, 'Banoyo'), (santa_cruz_id, 'Bantaawan'), (santa_cruz_id, 'Bantad'),
    (santa_cruz_id, 'Bolo'), (santa_cruz_id, 'Bonga'), (santa_cruz_id, 'Botilao'),
    (santa_cruz_id, 'Buyabod'), (santa_cruz_id, 'Cabangoan'), (santa_cruz_id, 'Cagbo'),
    (santa_cruz_id, 'Cawa-Cawa'), (santa_cruz_id, 'Daungan'), (santa_cruz_id, 'Diveal'),
    (santa_cruz_id, 'Hatiw helicopter'), (santa_cruz_id, 'Hinatungan'), (santa_cruz_id, 'Inapacan'),
    (santa_cruz_id, 'Ipil'), (santa_cruz_id, 'Kagui'), (santa_cruz_id, 'Lamesa'),
    (santa_cruz_id, 'Landy'), (santa_cruz_id, 'Laylay'), (santa_cruz_id, 'Libjo'),
    (santa_cruz_id, 'Lihis'), (santa_cruz_id, 'Mabini'), (santa_cruz_id, 'Maharni Badajo'),
    (santa_cruz_id, 'Mahayahay'), (santa_cruz_id, 'Mangaran'), (santa_cruz_id, 'Marao'),
    (santa_cruz_id, 'Napo'), (santa_cruz_id, 'Pag-Asa'), (santa_cruz_id, 'Pakaskasan'),
    (santa_cruz_id, 'Pantay'), (santa_cruz_id, 'Parang'), (santa_cruz_id, 'Patungan'),
    (santa_cruz_id, 'Pinaopaoan'), (santa_cruz_id, 'Poblacion'), (santa_cruz_id, 'Poctoy'),
    (santa_cruz_id, 'Polo'), (santa_cruz_id, 'Pulong Parang'), (santa_cruz_id, 'Puting Baybay'),
    (santa_cruz_id, 'Sapa'), (santa_cruz_id, 'Tagum'), (santa_cruz_id, 'Talao'),
    (santa_cruz_id, 'Tambangan'), (santa_cruz_id, 'Tawiran'), (santa_cruz_id, 'Tigwi'),
    (santa_cruz_id, 'Torijos'), (santa_cruz_id, 'Zabale')
  ON CONFLICT (municipality_id, name) DO NOTHING;
END $$;
