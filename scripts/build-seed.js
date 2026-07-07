/**
 * build-seed.js
 * ---------------------------------------------------------------------------
 * This is a ONE-TIME helper used to create the initial database/events/hamburg.json
 * from real performance data manually verified against the official Hamburg
 * Ballett calendar (https://www.hamburgballett.de/de/kalender/ballett, served
 * from hamburgballett.die-hamburgische-staatsoper.de) on 2026-07-07.
 *
 * It is NOT part of the regular update flow. The regular flow is:
 *   npm run fetch   -> runs src/scrape.js -> re-scrapes the live site with
 *                       Playwright and OVERWRITES database/events/hamburg.json
 *                       with fresh data.
 *
 * This file exists purely so the repository ships with a real, non-mocked
 * dataset before anyone has run the live scraper for the first time.
 */

const fs = require('fs');
const path = require('path');

// Each row: [title, YYYY-MM-DD, HH:MM, venue, ticketUrl|null, performanceUrl]
const BASE = 'https://hamburgballett.die-hamburgische-staatsoper.de';
const WEBSHOP = 'https://webshop.staatsoper-hamburg.de/webshop/webticket/shop?event=';

const rows = [
  ['Inside Out', '2026-09-05', '16:30', 'Staatsoper, opera stabile', null, `${BASE}/de/programm/ballett/3141-inside-out`],
  ['Theaternacht Hamburg', '2026-09-05', '18:00', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/details/2147484977-theaternacht-hamburg`],
  ['Patenklassen Ballett – A Cinderella Story', '2026-09-10', '09:30', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/3050-patenklassen-ballett`],
  ['BallettTester:innen – A Cinderella Story', '2026-09-11', '17:00', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/3053-balletttester-innen`],
  ['A Cinderella Story', '2026-09-13', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11072`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['A Cinderella Story', '2026-09-15', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11078`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['A Cinderella Story', '2026-09-17', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11073`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['A Cinderella Story', '2026-09-18', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11074`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['Inside Out', '2026-09-19', '19:00', 'Staatsoper, opera stabile', null, `${BASE}/de/programm/ballett/3141-inside-out`],
  ['Eintauchen ins Ballettzentrum', '2026-09-26', '10:00', 'Ballettzentrum Hamburg – John Neumeier', `${WEBSHOP}11350`, `${BASE}/de/programm/ballett/3146-eintauchen-ins-ballettzentrum`],
  ['Tod in Venedig', '2026-09-26', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11273`, `${BASE}/de/programm/ballett/520-tod-in-venedig`],

  ['Tanz für mich', '2026-10-01', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3047-tanz-fuer-mich`],
  ['Ballett-Werkstatt', '2026-10-01', '19:00', 'Gastspiel in Baden-Baden, Festspielhaus', null, `${BASE}/de/programm/ballett/168-ballett-werkstatt`],
  ['Absprung V', '2026-10-05', '18:00', 'Gastspiel in Baden-Baden, Festspielhaus', null, `${BASE}/de/programm/ballett/2147484845-absprung-v`],
  ['Bundesjugendballett', '2026-10-06', '19:00', 'Gastspiel in Baden-Baden, Festspielhaus', null, `${BASE}/de/programm/ballett/742-bundesjugendballett`],
  ['Bundesjugendballett', '2026-10-07', '19:00', 'Gastspiel in Baden-Baden, Festspielhaus', null, `${BASE}/de/programm/ballett/742-bundesjugendballett`],
  ['Der Nussknacker', '2026-10-09', '19:30', 'Gastspiel in Baden-Baden, Festspielhaus', null, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['Der Nussknacker', '2026-10-10', '19:30', 'Gastspiel in Baden-Baden, Festspielhaus', null, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['Der Nussknacker', '2026-10-11', '15:00', 'Gastspiel in Baden-Baden, Festspielhaus', null, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['A Cinderella Story', '2026-10-14', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11075`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['A Cinderella Story', '2026-10-15', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11076`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['A Cinderella Story', '2026-10-16', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11077`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['Die Kameliendame', '2026-10-21', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11113`, `${BASE}/de/programm/ballett/329-die-kameliendame`],
  ['Tanz für mich', '2026-10-22', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3048-tanz-fuer-mich`],
  ['Die Kameliendame', '2026-10-23', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11121`, `${BASE}/de/programm/ballett/329-die-kameliendame`],
  ['Die Kameliendame', '2026-10-24', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11118`, `${BASE}/de/programm/ballett/329-die-kameliendame`],
  ['Ballett-Werkstatt', '2026-10-25', '11:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11283`, `${BASE}/de/programm/ballett/168-ballett-werkstatt`],
  ['Die Kameliendame', '2026-10-25', '16:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11119`, `${BASE}/de/programm/ballett/329-die-kameliendame`],
  ['Die Kameliendame', '2026-10-28', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11120`, `${BASE}/de/programm/ballett/329-die-kameliendame`],
  ['Wunderland', '2026-10-30', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11209`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['Wunderland', '2026-10-31', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11217`, `${BASE}/de/programm/ballett/1911-wunderland`],

  ['Tanz für mich', '2026-11-05', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3047-tanz-fuer-mich`],
  ['Wunderland', '2026-11-06', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11210`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['Wunderland', '2026-11-10', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11211`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['BallettInsider:innen – Wunderland', '2026-11-12', '18:45', 'Staatsoper, Gästezimmer', null, `${BASE}/de/programm/ballett/3054-ballettinsider-innen`],
  ['Wunderland', '2026-11-12', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11212`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['Wunderland', '2026-11-13', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11213`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['Eintauchen ins Ballettzentrum', '2026-11-14', '10:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3146-eintauchen-ins-ballettzentrum`],
  ['Wunderland', '2026-11-18', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11214`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['Patenklassen Ballett – NEUE WELTEN', '2026-11-20', '09:30', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/3050-patenklassen-ballett`],
  ['Wunderland', '2026-11-21', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11215`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['Ballett-Werkstatt', '2026-11-22', '11:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11287`, `${BASE}/de/programm/ballett/168-ballett-werkstatt`],

  ['Sneak Klub – Generalprobe: NEUE WELTEN', '2026-12-04', '17:00', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/2147484910-sneak-klub`],
  ['NEUE WELTEN', '2026-12-05', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11154`, `${BASE}/de/programm/ballett/1905-neue-welten`],
  ['NEUE WELTEN', '2026-12-09', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11155`, `${BASE}/de/programm/ballett/1905-neue-welten`],
  ['Tanz für mich', '2026-12-10', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3047-tanz-fuer-mich`],
  ['NEUE WELTEN', '2026-12-11', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11160`, `${BASE}/de/programm/ballett/1905-neue-welten`],
  ['Der Nussknacker', '2026-12-16', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11161`, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['Tanz für mich', '2026-12-17', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3048-tanz-fuer-mich`],
  ['Der Nussknacker', '2026-12-17', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11162`, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['NEUE WELTEN', '2026-12-19', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11156`, `${BASE}/de/programm/ballett/1905-neue-welten`],
  ['Der Nussknacker', '2026-12-22', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11163`, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['Der Nussknacker', '2026-12-25', '14:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11164`, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['Der Nussknacker', '2026-12-25', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11165`, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['Der Nussknacker', '2026-12-27', '14:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11167`, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['Der Nussknacker', '2026-12-27', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11166`, `${BASE}/de/programm/ballett/201-der-nussknacker`],

  ['Der Nussknacker', '2027-01-01', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11168`, `${BASE}/de/programm/ballett/201-der-nussknacker`],
  ['NEUE WELTEN', '2027-01-02', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11157`, `${BASE}/de/programm/ballett/1905-neue-welten`],
  ['BallettInsider:innen – Ballettabend NEUE WELTEN', '2027-01-06', '18:45', 'Staatsoper, Gästezimmer', null, `${BASE}/de/programm/ballett/3054-ballettinsider-innen`],
  ['NEUE WELTEN', '2027-01-06', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11158`, `${BASE}/de/programm/ballett/1905-neue-welten`],
  ['Tanz für mich', '2027-01-07', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3047-tanz-fuer-mich`],
  ['ROMANTIC EVOLUTION/S', '2027-01-08', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11089`, `${BASE}/de/programm/ballett/2147484877-romantic-evolution-s`],
  ['ROMANTIC EVOLUTION/S', '2027-01-09', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11094`, `${BASE}/de/programm/ballett/2147484877-romantic-evolution-s`],
  ['ROMANTIC EVOLUTION/S', '2027-01-17', '14:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11091`, `${BASE}/de/programm/ballett/2147484877-romantic-evolution-s`],
  ['ROMANTIC EVOLUTION/S', '2027-01-17', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11090`, `${BASE}/de/programm/ballett/2147484877-romantic-evolution-s`],
  ['ROMANTIC EVOLUTION/S', '2027-01-18', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11092`, `${BASE}/de/programm/ballett/2147484877-romantic-evolution-s`],
  ['Patenklassen Ballett – Die Möwe', '2027-01-20', '09:30', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/3050-patenklassen-ballett`],
  ['Die Möwe', '2027-01-20', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11149`, `${BASE}/de/programm/ballett/485-die-moewe`],
  ['Die Möwe', '2027-01-23', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11150`, `${BASE}/de/programm/ballett/485-die-moewe`],
  ['Die Möwe', '2027-01-26', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11151`, `${BASE}/de/programm/ballett/485-die-moewe`],
  ['Ballett-Werkstatt', '2027-01-31', '11:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11284`, `${BASE}/de/programm/ballett/168-ballett-werkstatt`],
  ['Die Möwe', '2027-01-31', '17:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11152`, `${BASE}/de/programm/ballett/485-die-moewe`],

  ['Tanz für mich', '2027-02-04', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3047-tanz-fuer-mich`],
  ['Patenklassen Ballett – FAST FORWARD', '2027-02-12', '09:30', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/3050-patenklassen-ballett`],
  ['FAST FORWARD', '2027-02-14', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11099`, `${BASE}/de/programm/ballett/3124-fast-forward`],
  ['Tanz für mich', '2027-02-18', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3048-tanz-fuer-mich`],
  ['Eintauchen ins Ballettzentrum', '2027-02-20', '10:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3146-eintauchen-ins-ballettzentrum`],
  ['FAST FORWARD', '2027-02-20', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11102`, `${BASE}/de/programm/ballett/3124-fast-forward`],
  ['Werkstatt der Kreativität XVII – Programm I', '2027-02-22', '19:30', 'Ernst Deutsch Theater', null, `${BASE}/de/programm/ballett/2147484995-werkstatt-der-kreativitaet-xvii`],
  ['Werkstatt der Kreativität XVII – Programm I', '2027-02-23', '19:30', 'Ernst Deutsch Theater', null, `${BASE}/de/programm/ballett/2147484995-werkstatt-der-kreativitaet-xvii`],
  ['FAST FORWARD', '2027-02-24', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11100`, `${BASE}/de/programm/ballett/3124-fast-forward`],
  ['Werkstatt der Kreativität XVII – Programm I', '2027-02-24', '19:30', 'Ernst Deutsch Theater', null, `${BASE}/de/programm/ballett/2147484995-werkstatt-der-kreativitaet-xvii`],
  ['FAST FORWARD', '2027-02-26', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11101`, `${BASE}/de/programm/ballett/3124-fast-forward`],
  ['Werkstatt der Kreativität XVII – Programm II', '2027-02-26', '19:30', 'Ernst Deutsch Theater', null, `${BASE}/de/programm/ballett/2147484995-werkstatt-der-kreativitaet-xvii`],
  ['Werkstatt der Kreativität XVII – Programm II', '2027-02-27', '19:30', 'Ernst Deutsch Theater', null, `${BASE}/de/programm/ballett/2147484995-werkstatt-der-kreativitaet-xvii`],
  ['Werkstatt der Kreativität XVII – Programm II', '2027-02-28', '19:30', 'Ernst Deutsch Theater', null, `${BASE}/de/programm/ballett/2147484995-werkstatt-der-kreativitaet-xvii`],

  ['Tanz für mich', '2027-03-04', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3047-tanz-fuer-mich`],
  ['Sneak Klub – Generalprobe: MITTSU', '2027-03-12', '17:00', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/2147484910-sneak-klub`],
  ['MITTSU: Virginia Woolf', '2027-03-13', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11141`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['MITTSU: Virginia Woolf', '2027-03-14', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11142`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['Matthäus-Passion', '2027-03-18', '18:30', 'Aufführungsort wird noch bekannt gegeben', null, `${BASE}/de/programm/ballett/174-matthaeus-passion`],
  ['Matthäus-Passion', '2027-03-19', '18:30', 'Aufführungsort wird noch bekannt gegeben', null, `${BASE}/de/programm/ballett/174-matthaeus-passion`],
  ['Wunderland', '2027-03-20', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11216`, `${BASE}/de/programm/ballett/1911-wunderland`],
  ['MITTSU: Virginia Woolf', '2027-03-21', '17:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11144`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['Scirocco', '2027-03-23', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11245`, `${BASE}/de/programm/ballett/1970-scirocco`],
  ['Scirocco', '2027-03-24', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11246`, `${BASE}/de/programm/ballett/1970-scirocco`],
  ['ROMANTIC EVOLUTION/S', '2027-03-25', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11093`, `${BASE}/de/programm/ballett/2147484877-romantic-evolution-s`],
  ['A Cinderella Story', '2027-03-26', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11079`, `${BASE}/de/programm/ballett/319-a-cinderella-story`],
  ['NEUE WELTEN', '2027-03-27', '20:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11159`, `${BASE}/de/programm/ballett/1905-neue-welten`],
  ['Die Möwe', '2027-03-28', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11153`, `${BASE}/de/programm/ballett/485-die-moewe`],
  ['Nijinsky-Gala', '2027-03-29', '18:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11231`, `${BASE}/de/programm/ballett/206-nijinsky-gala`],

  ['Tanz für mich', '2027-04-01', '19:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3047-tanz-fuer-mich`],
  ['MITTSU: Virginia Woolf', '2027-04-03', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11145`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['MITTSU: Virginia Woolf', '2027-04-05', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11146`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['MITTSU: Virginia Woolf', '2027-04-08', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11143`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['Patenklassen Ballett – Die kleine Meerjungfrau', '2027-04-09', '09:30', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/3050-patenklassen-ballett`],
  ['Die kleine Meerjungfrau', '2027-04-09', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11135`, `${BASE}/de/programm/ballett/566-die-kleine-meerjungfrau`],
  ['Eintauchen ins Ballettzentrum', '2027-04-10', '10:00', 'Ballettzentrum Hamburg – John Neumeier', null, `${BASE}/de/programm/ballett/3146-eintauchen-ins-ballettzentrum`],
  ['MITTSU: Virginia Woolf', '2027-04-11', '14:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11148`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['MITTSU: Virginia Woolf', '2027-04-11', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11147`, `${BASE}/de/programm/ballett/1974-mittsu-virginia-woolf`],
  ['BallettInsider:innen – Die kleine Meerjungfrau', '2027-04-14', '18:45', 'Staatsoper, Gästezimmer', null, `${BASE}/de/programm/ballett/3054-ballettinsider-innen`],
  ['Die kleine Meerjungfrau', '2027-04-14', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11140`, `${BASE}/de/programm/ballett/566-die-kleine-meerjungfrau`],
  ['Die kleine Meerjungfrau', '2027-04-16', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11136`, `${BASE}/de/programm/ballett/566-die-kleine-meerjungfrau`],
  ['Die kleine Meerjungfrau', '2027-04-20', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11137`, `${BASE}/de/programm/ballett/566-die-kleine-meerjungfrau`],
  ['Erste Schritte', '2027-04-21', '19:00', 'Staatsoper, Großes Haus', `${WEBSHOP}11289`, `${BASE}/de/programm/ballett/205-erste-schritte`],
  ['Die kleine Meerjungfrau', '2027-04-22', '19:30', 'Staatsoper, Großes Haus', `${WEBSHOP}11138`, `${BASE}/de/programm/ballett/566-die-kleine-meerjungfrau`],
  ['Erste Schritte', '2027-04-23', '12:00', 'Staatsoper, Großes Haus', null, `${BASE}/de/programm/ballett/205-erste-schritte`],
];

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const events = rows.map(([title, date, time, venue, ticketUrl, url]) => ({
  id: `${slugify(title)}-${date}-${time.replace(':', '')}`,
  company: 'Hamburg Ballett',
  city: 'Hamburg',
  title,
  date,
  time,
  venue,
  ticketUrl: ticketUrl || null,
  url,
}));

// Sort chronologically, just in case
events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

const outPath = path.join(__dirname, '..', 'database', 'events', 'hamburg.json');
fs.writeFileSync(outPath, JSON.stringify(events, null, 2) + '\n', 'utf-8');
console.log(`Wrote ${events.length} events to ${outPath}`);
