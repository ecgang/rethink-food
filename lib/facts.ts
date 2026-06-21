// Real Rethink Food headline facts (refreshed June 2026), used by the hero band,
// the live marquee, and the docs. Sources: rethinkfood.org, nycfoodpolicy.org
// community spotlight, and PRNewswire (Greenwich Village kitchen opening).
export const FACTS = {
  lifetimeMeals: 30_000_000, // ~30M distributed since 2017
  weeklyMeals: 30_000, // ~30k/week to community partners
  kitchenWeeklyMeals: 18_000, // Sustainable Community Kitchen (Greenwich Village)
  activeCbos: 12, // current active CBO partners (40+ served lifetime)
  lifetimeCbos: 40,
  nycRestaurants: 30, // 30+ Rethink Certified restaurants in NYC
  miamiRestaurants: 7,
  cities: ["New York City", "Miami"] as const,
  kitchenName: "Sustainable Community Kitchen — Greenwich Village",
} as const;
