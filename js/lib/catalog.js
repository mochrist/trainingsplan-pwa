// Muskelgruppen, mitgelieferter Übungskatalog und Zuordnung von Übungsnamen (ohne DOM).
import { normalizeName } from './normalize.js';

/** Reihenfolge = Anzeigereihenfolge. */
export const MUSCLES = {
  chest: 'Brust',
  back: 'Rücken',
  shoulders: 'Schultern',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  forearms: 'Unterarme',
  abs: 'Bauch',
  quads: 'Beinstrecker',
  hamstrings: 'Beinbeuger',
  glutes: 'Po',
  calves: 'Waden',
};

const ex = (name, muscles, compound = false) => ({ name, muscles, compound });

/**
 * Übungen, aus denen der Trainingsvorschlag schöpft. muscles[0] ist die Hauptmuskelgruppe.
 * compound = Grundübung (mehrgelenkig), kommt im Vorschlag vor den Isolationsübungen.
 */
export const CATALOG = [
  // Brust
  ex('Bankdrücken (Langhantel)', ['chest', 'triceps', 'shoulders'], true),
  ex('Bankdrücken (Kurzhantel)', ['chest', 'triceps', 'shoulders'], true),
  ex('Schrägbankdrücken (Langhantel)', ['chest', 'shoulders', 'triceps'], true),
  ex('Schrägbankdrücken (Kurzhantel)', ['chest', 'shoulders', 'triceps'], true),
  ex('Brustpresse (Maschine)', ['chest', 'triceps', 'shoulders'], true),
  ex('Dips (Brust)', ['chest', 'triceps'], true),
  ex('Liegestütze', ['chest', 'triceps'], true),
  ex('Butterfly (Maschine)', ['chest']),
  ex('Fliegende (Kurzhantel)', ['chest']),
  ex('Cable Crossover', ['chest']),
  // Rücken
  ex('Latzug', ['back', 'biceps'], true),
  ex('Latzug (enger Griff)', ['back', 'biceps'], true),
  ex('Klimmzüge', ['back', 'biceps'], true),
  ex('Klimmzüge (Untergriff)', ['back', 'biceps'], true),
  ex('High Row', ['back', 'biceps'], true),
  ex('Rudern am Kabel (sitzend)', ['back', 'biceps'], true),
  ex('Rudern (Langhantel, vorgebeugt)', ['back', 'biceps'], true),
  ex('Rudern (Kurzhantel, einarmig)', ['back', 'biceps'], true),
  ex('Rudern (Maschine)', ['back', 'biceps'], true),
  ex('T-Bar-Rudern', ['back', 'biceps'], true),
  ex('Kreuzheben', ['back', 'hamstrings', 'glutes'], true),
  ex('Pullover (Kabel)', ['back']),
  ex('Hyperextensions', ['back', 'glutes']),
  ex('Shrugs (Kurzhantel)', ['back']),
  // Schultern
  ex('Schulterdrücken (Kurzhantel)', ['shoulders', 'triceps'], true),
  ex('Schulterdrücken (Langhantel)', ['shoulders', 'triceps'], true),
  ex('Schulterdrücken (Maschine)', ['shoulders', 'triceps'], true),
  ex('Arnold Press', ['shoulders', 'triceps'], true),
  ex('Aufrechtes Rudern', ['shoulders', 'back'], true),
  ex('Seitheben (Kurzhantel)', ['shoulders']),
  ex('Seitheben (Kabel)', ['shoulders']),
  ex('Seitheben (Maschine)', ['shoulders']),
  ex('Frontheben (Kurzhantel)', ['shoulders']),
  ex('Face Pulls', ['shoulders', 'back']),
  ex('Reverse Butterfly', ['shoulders', 'back']),
  // Bizeps
  ex('Bizeps-Curls (SZ-Stange)', ['biceps']),
  ex('Bizeps-Curls (Langhantel)', ['biceps']),
  ex('Bizeps-Curls (Kurzhantel)', ['biceps']),
  ex('Bizeps-Curls (Kabel)', ['biceps']),
  ex('Hammer-Curls', ['biceps', 'forearms']),
  ex('Schrägbank-Curls (Kurzhantel)', ['biceps']),
  ex('Konzentrationscurls', ['biceps']),
  ex('Scott-Curls (Maschine)', ['biceps']),
  // Trizeps
  ex('Enges Bankdrücken', ['triceps', 'chest'], true),
  ex('Dips (Trizeps)', ['triceps', 'chest'], true),
  ex('Dips (Maschine)', ['triceps', 'chest'], true),
  ex('Trizepsdrücken (Kabel)', ['triceps']),
  ex('Trizepsdrücken (Seil)', ['triceps']),
  ex('Überkopf-Trizepsdrücken (Kabel)', ['triceps']),
  ex('French Press (SZ-Stange)', ['triceps']),
  ex('Trizeps-Kickbacks', ['triceps']),
  // Unterarme
  ex('Handgelenk-Curls', ['forearms']),
  ex('Reverse Curls', ['forearms', 'biceps']),
  ex('Farmers Walk', ['forearms', 'back'], true),
  // Beine
  ex('Kniebeugen (Langhantel)', ['quads', 'glutes', 'hamstrings'], true),
  ex('Frontkniebeugen', ['quads', 'glutes'], true),
  ex('Beinpresse', ['quads', 'glutes'], true),
  ex('Hackenschmidt-Kniebeugen', ['quads', 'glutes'], true),
  ex('Ausfallschritte (Kurzhantel)', ['quads', 'glutes'], true),
  ex('Bulgarian Split Squats', ['quads', 'glutes'], true),
  ex('Beinstrecker (Maschine)', ['quads']),
  ex('Rumänisches Kreuzheben', ['hamstrings', 'glutes', 'back'], true),
  ex('Beinbeuger (liegend)', ['hamstrings']),
  ex('Beinbeuger (sitzend)', ['hamstrings']),
  ex('Hip Thrusts', ['glutes', 'hamstrings'], true),
  ex('Abduktoren (Maschine)', ['glutes']),
  ex('Glute Kickbacks (Kabel)', ['glutes']),
  ex('Wadenheben (stehend)', ['calves']),
  ex('Wadenheben (sitzend)', ['calves']),
  // Bauch
  ex('Crunches', ['abs']),
  ex('Kabel-Crunches', ['abs']),
  ex('Beinheben (hängend)', ['abs']),
  ex('Russian Twists', ['abs']),
  ex('Ab Wheel', ['abs']),
];

const CATALOG_BY_NORM = new Map(CATALOG.map((entry) => [normalizeName(entry.name), entry]));

export function findCatalogEntry(name) {
  return CATALOG_BY_NORM.get(normalizeName(name)) ?? null;
}

// Stichwörter für eigene Übungen (auf normalisierte Namen: klein, ohne Umlaute). Erster Treffer gewinnt,
// deshalb stehen die spezielleren Regeln vorne (z. B. „Trizepsdrücken“ vor „Bankdrücken“).
// Kurze Wörter nur mit Wortgrenze (sonst trifft „chin“ in „Maschine“).
const MUSCLE_RULES = [
  [/wade|calf|calves/, 'calves'],
  [/bein ?curl|beinbeuger|leg ?curl|hamstring|rumanisch|good ?morning|nordic/, 'hamstrings'],
  [/hip ?thrust|glute|abduktor|abductor|gesass|bridge/, 'glutes'],
  [/handgelenk|wrist|unterarm|forearm|farmer|reverse ?curl/, 'forearms'],
  [/trizeps|triceps|french ?press|skull|kickback|pushdown|dips|enges bankdrucken|close ?grip/, 'triceps'],
  [/curl|bizeps|biceps/, 'biceps'],
  [/seitheb|frontheb|lateral|front ?raise|schulter|shoulder|military|overhead ?press|arnold|face ?pull|reverse ?(butterfly|fly)|delt|aufrechtes rudern|upright/, 'shoulders'],
  [/bankdrucken|bench|brust|chest|butterfly|fly|flieg|crossover|liegestutz|push-?up|pec/, 'chest'],
  [/kniebeug|squat|beinpresse|leg ?press|ausfallschritt|lunge|beinstreck|leg ?ext|hackenschmidt|step-?up|quad/, 'quads'],
  [/latzug|pulldown|klimmz|pull-?up|\bchin|rudern|\brows?\b|pullover|kreuzheb|deadlift|shrug|hyperext|rucken|\bback\b/, 'back'],
  [/crunch|bauch|plank|sit-?up|beinheben|leg ?raise|ab ?wheel|russian|twist|core|\babs?\b/, 'abs'],
];

const COMPOUND_HINT = /drucken|press|rudern|\brows?\b|klimmz|pull-?up|\bchin|dips|kniebeug|squat|kreuzheb|deadlift|ausfallschritt|lunge|thrust|liegestutz|push-?up|latzug|pulldown|farmer/;
const ISOLATION_HINT = /trizeps|triceps|wade|calf|beinstreck|leg ?ext|curl|pushdown/;

/**
 * Muskelgruppen und Grundübung für einen Übungsnamen: Katalogeintrag, sonst Schätzung über Stichwörter.
 * Unbekanntes ergibt { muscles: [], compound: false }.
 */
export function classifyExercise(name) {
  const entry = findCatalogEntry(name);
  if (entry) return { muscles: [...entry.muscles], compound: entry.compound };
  const norm = normalizeName(name);
  const rule = MUSCLE_RULES.find(([pattern]) => pattern.test(norm));
  if (!rule) return { muscles: [], compound: false };
  return { muscles: [rule[1]], compound: COMPOUND_HINT.test(norm) && !ISOLATION_HINT.test(norm) };
}

/** Muskelgruppen in Anzeigereihenfolge, unbekannte und doppelte entfernt. */
export function sortMuscles(muscles) {
  return Object.keys(MUSCLES).filter((key) => muscles.includes(key));
}
