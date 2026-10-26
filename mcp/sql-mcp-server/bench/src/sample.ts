/**
 * The benchmark's sample Database (S-004 spec, The sample Database): a small sales Database in schema
 * `sqlmcp_test`, generated from a seed with no `random()` and no clock, so every rebuild is identical.
 * `bench/build-sample.ts` writes its output to `bench/sample-db.sql`, which is what is applied.
 */

const REGIONS = ["North", "South", "East", "West"];
/** How many customers each region has, in REGIONS order. */
const REGION_CUSTOMERS = [18, 16, 14, 12];

const CUSTOMERS = [
  "Harbour Foods", "Acacia Traders", "Baobab Market", "Cape Pantry", "Delta Grocers", "Elm Street Deli",
  "Fynbos Kitchen", "Granite Catering", "Highveld Stores", "Indigo Bistro", "Jacaranda Cafe", "Karoo Provisions",
  "Lighthouse Diner", "Marula Supplies", "Northgate Foods", "Oakridge Bakery", "Protea Hotel Group", "Quarry Lane Cafe",
  "Riverside Market", "Savanna Wholesale", "Table Bay Traders", "Umhlanga Eatery", "Vineyard Kitchen", "Waterfront Bistro",
  "Yellowwood Deli", "Zebra Crossing Cafe", "Amber Hill Foods", "Bluegum Grocers", "Cedar Point Diner", "Driftwood Catering",
  "Eastgate Provisions", "Fig Tree Bakery", "Golden Mile Market", "Hilltop Pantry", "Ironwood Stores", "Juniper Cafe",
  "Kestrel Kitchen", "Lakeside Deli", "Milkwood Traders", "Nightjar Bistro", "Olive Grove Foods", "Pinecrest Market",
  "Quill Street Cafe", "Rooibos Supplies", "Silverleaf Catering", "Thornhill Grocers", "Upington Provisions", "Valley Fresh Foods",
  "Willow Bakery", "Yarrow Kitchen", "Zinnia Eatery", "Aloe Ridge Market", "Bayside Diner", "Coral Reef Cafe",
  "Dune Wholesale", "Ember Grill House", "Falcon Traders", "Garden Route Foods", "Hornbill Deli", "Ivory Coast Pantry",
];

/** name, category, unit price in cents, active, how often it is ordered (0: never, for B-29). */
const PRODUCTS: [string, string, number, boolean, number][] = [
  ["Rooibos Tea 250g", "Beverages", 4250, true, 1.6],
  ["Filter Coffee 1kg", "Beverages", 28950, true, 1.1],
  ["Sparkling Water 24-pack", "Beverages", 13900, true, 2.4],
  ["Orange Juice 2L", "Beverages", 3899, true, 1.8],
  ["Ginger Beer 6-pack", "Beverages", 7450, false, 0.5],
  ["Sourdough Loaf", "Bakery", 5500, true, 2.0],
  ["Rye Bread", "Bakery", 4800, false, 0.4],
  ["Croissant Box", "Bakery", 11250, true, 1.3],
  ["Seed Crackers", "Bakery", 3650, true, 0],
  ["Rusks 1kg", "Bakery", 8900, true, 0.9],
  ["Cheddar Block 1kg", "Dairy", 16500, true, 1.5],
  ["Greek Yoghurt 1kg", "Dairy", 7999, true, 1.2],
  ["Butter 500g", "Dairy", 6450, true, 1.7],
  ["Fresh Milk 2L", "Dairy", 3299, true, 3.0],
  ["Feta Tub", "Dairy", 5950, false, 0],
  ["Avocado Tray", "Produce", 9800, true, 1.0],
  ["Apple Box", "Produce", 15400, true, 0.8],
  ["Baby Spinach 1kg", "Produce", 6900, true, 0.7],
  ["Tomato Crate", "Produce", 19900, true, 0.6],
  ["Butternut Bag", "Produce", 4500, false, 0.3],
  ["Olive Oil 5L", "Pantry", 48990, true, 0.5],
  ["Basmati Rice 10kg", "Pantry", 31500, true, 0.75],
  ["Chakalaka Tin Case", "Pantry", 21600, false, 0.35],
  ["Peri-Peri Sauce Case", "Pantry", 25800, true, 0.45],
  ["Maize Meal 10kg", "Pantry", 14200, true, 0.95],
];
/** Orders holding this product are returned more often, so B-37 has a clear answer. */
const OFTEN_RETURNED = "Greek Yoghurt 1kg";

const STAFF: [string, number][] = [
  ["Thandi Mokoena", 685000],
  ["Pieter van Wyk", 542000],
  ["Aisha Patel", 498500],
  ["Sipho Ndlovu", 451250],
  ["Lerato Dlamini", 612000],
];

const ORDERS = 1180;
/** The B-25 batch: cancelled orders at 22:30 UTC on 28 February 2026, which is 1 March in Johannesburg. */
const LATE_BATCH = 6;
/** Weekday weights, Sunday first, so B-24's busiest day stands clear. */
const WEEKDAY = [0.45, 1.0, 1.3, 1.05, 1.1, 0.95, 0.6];
/** Month weights for 2025, then January to March 2026, so B-15's best month stands clear. */
const MONTH = [0.8, 0.85, 1.0, 0.95, 1.0, 0.9, 1.05, 1.0, 1.1, 1.15, 1.3, 1.6, 0.9, 0.95, 1.0];
const DISCOUNTS: [number, number][] = [[0, 40], [5, 20], [10, 15], [15, 10], [20, 7], [25, 5], [30, 3]];
const LINE_COUNTS: [number, number][] = [[1, 20], [2, 30], [3, 25], [4, 15], [5, 10]];
/** Target as a share of actual revenue for Q4 2025, by region, so B-19's list is North and East, clear of 1%. */
const Q4_2025_TARGET = [0.9, 1.12, 0.94, 1.08];

const DAY = 86_400_000;
const FIRST_DAY = Date.UTC(2025, 0, 1) / DAY;
const LAST_DAY = Date.UTC(2026, 2, 31) / DAY;

type Order = { customer: number; day: number; late: boolean; status: string; lines: [number, number, number][] };

/** mulberry32: a small seeded generator, the same on every platform. */
function generator(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const weighted = <T>(items: [T, number][]) => {
    let r = next() * items.reduce((s, [, w]) => s + w, 0);
    for (const [item, w] of items) if ((r -= w) < 0) return item;
    return items[items.length - 1]![0];
  };
  return { next, int, weighted };
}

const iso = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const monthIndex = (day: number) => {
  const d = new Date(day * DAY);
  return (d.getUTCFullYear() - 2025) * 12 + d.getUTCMonth();
};
const money = (cents: number) => (cents / 100).toFixed(2);
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function sampleSql(seed: number): string {
  const rng = generator(seed);

  // Customers: most joined before 2025, thirteen during it and seven in 2026 (B-27). Three never order (B-13).
  const regionOf = REGION_CUSTOMERS.flatMap((n, r) => Array<number>(n).fill(r));
  const customers = CUSTOMERS.map((name, i) => {
    const joined =
      i < 40 ? rng.int(Date.UTC(2023, 5, 1) / DAY, Date.UTC(2024, 11, 31) / DAY)
      : i < 53 ? rng.int(FIRST_DAY, Date.UTC(2025, 11, 15) / DAY)
      : rng.int(Date.UTC(2026, 0, 5) / DAY, Date.UTC(2026, 2, 10) / DAY);
    return {
      name,
      region: regionOf[(i * 7) % 60]!,
      segment: rng.next() < 0.35 ? "wholesale" : "retail",
      joined,
      // One customer orders far more than the rest, so B-12 stands clear; three never order.
      weight: i === 5 ? 3.2 : i === 12 || i === 47 || i === 59 ? 0 : 0.5 + rng.next(),
    };
  });

  // Each customer's share of the orders follows their weight and how long they could order for.
  const span = customers.map((c) => (c.weight ? (LAST_DAY - Math.max(c.joined, FIRST_DAY) + 1) * c.weight : 0));
  const spanTotal = span.reduce((a, b) => a + b, 0);
  const products = PRODUCTS.map(([, , , , popularity], id) => [id, popularity] as [number, number]).filter(([, w]) => w > 0);
  const orders: Order[] = [];
  customers.forEach((c, ci) => {
    const n = Math.round((span[ci]! / spanTotal) * (ORDERS - LATE_BATCH));
    const from = Math.max(c.joined, FIRST_DAY);
    for (let k = 0; k < n; k++) {
      let day: number;
      do day = rng.int(from, LAST_DAY);
      while (rng.next() * 2.1 > WEEKDAY[new Date(day * DAY).getUTCDay()]! * MONTH[monthIndex(day)]!);
      orders.push({ customer: ci, day, late: false, status: "", lines: lines(rng, products) });
    }
  });

  // The B-25 batch belongs to customers who already ordered before it.
  const earlier = [...new Set(orders.filter((o) => o.day < Date.UTC(2026, 1, 28) / DAY).map((o) => o.customer))].sort((a, b) => a - b);
  for (let k = 0; k < LATE_BATCH; k++) {
    orders.push({ customer: earlier[(k * 11) % earlier.length]!, day: Date.UTC(2026, 1, 28) / DAY, late: true, status: "cancelled", lines: lines(rng, products) });
  }

  const often = PRODUCTS.findIndex(([name]) => name === OFTEN_RETURNED);
  for (const o of orders) {
    if (o.late) continue;
    const r = rng.next();
    const returned = o.lines.some(([p]) => p === often) ? 0.3 : 0.07;
    o.status =
      o.day >= Date.UTC(2026, 2, 20) / DAY ? (r < 0.7 ? "pending" : "shipped")
      : r < 0.01 ? "pending"
      : r < 0.09 ? "cancelled"
      : r < 0.09 + returned ? "returned"
      : "shipped";
  }

  orders.sort((a, b) => a.day - b.day || Number(a.late) - Number(b.late) || a.customer - b.customer);

  // One shipped order of 2025 is far larger than any other, so B-30 stands clear.
  const in2025 = (o: Order) => o.day < Date.UTC(2026, 0, 1) / DAY;
  const shipped2025 = orders.filter((o) => o.status === "shipped" && in2025(o));
  const large = shipped2025[Math.floor(shipped2025.length / 2)]!;
  large.lines = large.lines.map(([p, q, d]) => [p, q * 6, d]);
  // An odd count of 2025's shipped orders makes B-31's median a single order's value.
  if (shipped2025.length % 2 === 0) shipped2025.find((o) => o !== large)!.status = "returned";

  // Targets follow actual revenue: Q4 2025 by the fixed shares above, the other quarters 3–12% either side.
  const revenue = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "shipped") continue;
    const d = new Date(o.day * DAY);
    const key = `${customers[o.customer]!.region}:${d.getUTCFullYear()}:${Math.floor(d.getUTCMonth() / 3) + 1}`;
    const value = o.lines.reduce((s, [p, q, disc]) => s + PRODUCTS[p]![2] * q * (100 - disc), 0) / 100;
    revenue.set(key, (revenue.get(key) ?? 0) + value);
  }
  const targets: string[] = [];
  REGIONS.forEach((_, r) => {
    for (const [year, quarter] of [[2025, 1], [2025, 2], [2025, 3], [2025, 4], [2026, 1]] as const) {
      const share =
        year === 2025 && quarter === 4 ? Q4_2025_TARGET[r]! : 1 + (rng.next() < 0.5 ? -1 : 1) * (0.03 + rng.next() * 0.09);
      targets.push(`(${r + 1}, ${year}, ${quarter}, ${money(Math.round((revenue.get(`${r}:${year}:${quarter}`) ?? 0) * share))})`);
    }
  });

  const orderRows = orders.map((o, i) => {
    const at = o.late ? `${iso(o.day)} 22:30:00+00` : `${iso(o.day)} 12:00:00+00`;
    return `(${10001 + i}, ${o.customer + 1}, '${at}', '${o.status}')`;
  });
  const lineRows = orders.flatMap((o, i) =>
    o.lines.map(([p, q, d]) => `(${10001 + i}, ${p + 1}, ${q}, ${money(PRODUCTS[p]![2])}, ${(d / 100).toFixed(2)})`),
  );

  return `-- Generated by bench/build-sample.ts from seed ${seed}. Do not edit; rebuild it instead.
-- Rebuilds schema sqlmcp_test as the benchmark's sample Database (S-004). Run it as postgres.
-- Role sqlmcp_reader must already exist; this grants to it and creates no role.
BEGIN;
DROP SCHEMA IF EXISTS sqlmcp_test CASCADE;
CREATE SCHEMA sqlmcp_test AUTHORIZATION postgres;
CREATE TYPE sqlmcp_test.customer_segment AS ENUM ('retail', 'wholesale');
CREATE TYPE sqlmcp_test.order_status AS ENUM ('pending', 'shipped', 'cancelled', 'returned');
CREATE TABLE sqlmcp_test.regions (id int PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE sqlmcp_test.customers (
  id int PRIMARY KEY,
  name text NOT NULL UNIQUE,
  region_id int NOT NULL REFERENCES sqlmcp_test.regions,
  segment sqlmcp_test.customer_segment NOT NULL,
  joined_on date NOT NULL,
  email text NOT NULL
);
CREATE TABLE sqlmcp_test.products (
  id int PRIMARY KEY,
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  active bool NOT NULL
);
CREATE TABLE sqlmcp_test.orders (
  id int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES sqlmcp_test.customers,
  placed_at timestamptz NOT NULL,
  status sqlmcp_test.order_status NOT NULL
);
CREATE TABLE sqlmcp_test.order_lines (
  order_id int NOT NULL REFERENCES sqlmcp_test.orders,
  product_id int NOT NULL REFERENCES sqlmcp_test.products,
  quantity int NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  discount_rate numeric(3,2) NOT NULL CHECK (discount_rate BETWEEN 0.00 AND 0.30),
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE sqlmcp_test.targets (
  region_id int NOT NULL REFERENCES sqlmcp_test.regions,
  year int NOT NULL,
  quarter int NOT NULL,
  revenue_target numeric(12,2) NOT NULL,
  PRIMARY KEY (region_id, year, quarter)
);
CREATE TABLE sqlmcp_test.staff (id int PRIMARY KEY, name text NOT NULL, salary numeric(10,2) NOT NULL);

INSERT INTO sqlmcp_test.regions VALUES
${REGIONS.map((n, i) => `(${i + 1}, ${quote(n)})`).join(",\n")};
INSERT INTO sqlmcp_test.customers VALUES
${customers
  .map((c, i) => `(${i + 1}, ${quote(c.name)}, ${c.region + 1}, '${c.segment}', '${iso(c.joined)}', ${quote(`${c.name.toLowerCase().replace(/ /g, ".")}@example.com`)})`)
  .join(",\n")};
INSERT INTO sqlmcp_test.products VALUES
${PRODUCTS.map(([name, category, cents, active], i) => `(${i + 1}, ${quote(name)}, ${quote(category)}, ${money(cents)}, ${active})`).join(",\n")};
INSERT INTO sqlmcp_test.orders VALUES
${orderRows.join(",\n")};
INSERT INTO sqlmcp_test.order_lines VALUES
${lineRows.join(",\n")};
INSERT INTO sqlmcp_test.targets VALUES
${targets.join(",\n")};
INSERT INTO sqlmcp_test.staff VALUES
${STAFF.map(([name, cents], i) => `(${i + 1}, ${quote(name)}, ${money(cents)})`).join(",\n")};

GRANT USAGE ON SCHEMA sqlmcp_test TO sqlmcp_reader;
GRANT SELECT ON sqlmcp_test.regions, sqlmcp_test.products, sqlmcp_test.orders, sqlmcp_test.order_lines, sqlmcp_test.targets TO sqlmcp_reader;
GRANT SELECT (id, name, region_id, segment, joined_on) ON sqlmcp_test.customers TO sqlmcp_reader;
COMMIT;
`;
}

/** An order's lines: distinct products by popularity, each with a quantity and a discount in percent. */
function lines(rng: ReturnType<typeof generator>, products: [number, number][]): [number, number, number][] {
  const count = rng.weighted(LINE_COUNTS);
  const chosen = new Set<number>();
  while (chosen.size < count) chosen.add(rng.weighted(products));
  return [...chosen].sort((a, b) => a - b).map((p) => [p, rng.int(1, 12), rng.weighted(DISCOUNTS)]);
}

/** The seed a generated `sample-db.sql` was built from, read from its first line. */
export function seedOf(sql: string): number {
  const m = /^-- Generated by bench\/build-sample\.ts from seed (\d+)\./.exec(sql);
  if (!m) throw new Error("sample-db.sql does not name its seed");
  return Number(m[1]);
}
