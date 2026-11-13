// Ton objectif. Modifie ces valeurs si ta course ou ton objectif changent.
window.RACE = {
  name: 'Marathon',
  date: '2027-04-03',          // AAAA-MM-JJ
  distanceKm: 42.195,
  targetTime: '3:40:00',       // h:mm:ss
  peakLongRunKm: 32,           // sortie longue visée au pic de préparation

  // Prédiction marathon affichée par ta montre (Garmin ne la fournit pas via l'API).
  // Sur la montre : Statistiques de performance > Prédictions de course. Exemple : '3:52:10'
  garminPredictedTime: '4:12:46',
  garminPredictedDate: '2026-11-12',     // date à laquelle tu l'as relevée, ex. '2026-11-09'

  // Début du plan (lundi) et distance de ta première sortie longue
  planStart: '2026-11-09',
  startLongKm: 12,

  // Jour de ta sortie longue : MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
  longRunDay: 'SUNDAY'
};
