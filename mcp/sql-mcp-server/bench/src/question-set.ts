import type { Question } from "./reference.js";

/**
 * The benchmark's 40 Questions as approved (S-004 spec appendix, D-094), with the reference SQL that
 * computes each answer and, for text, list and top-N Questions, the check that the answer has no
 * close runner-up. `bench/build-sample.ts` adds the expected answers and writes `bench/questions.json`.
 */
export const QUESTION_SET: (Omit<Question, "expected"> & { values?: "integer" | "number" })[] = [];

const S = "sqlmcp_test";
/** A line's revenue: its quantity at its unit price, after its discount. */
const REVENUE = "ol.quantity * ol.unit_price * (1 - ol.discount_rate)";
const LINES = `${S}.orders o JOIN ${S}.order_lines ol ON ol.order_id = o.id`;
const range = (from: string, to: string) => `o.placed_at >= '${from} 00:00:00+00' AND o.placed_at < '${to} 00:00:00+00'`;
const IN_2025 = range("2025-01-01", "2026-01-01");
const SHIPPED = "o.status = 'shipped'";

/** The (leader, runner-up) values at `rank` and the rank after it, from rows with a `value` column. */
const gap = (values: string, rank = 1) =>
  `WITH v AS (${values}), r AS (SELECT value, row_number() OVER (ORDER BY value DESC) AS n FROM v)
SELECT (SELECT value FROM r WHERE n = ${rank}), (SELECT value FROM r WHERE n = ${rank + 1})`;

const add = (id: string, type: Question["type"], text: string, sql: string, extra: Partial<(typeof QUESTION_SET)[number]> = {}) =>
  QUESTION_SET.push({ id, text, type, sql, ...extra });

add("B-01", "integer", "How many customers do we have?", `SELECT count(*) FROM ${S}.customers`);
add("B-02", "integer", "How many products are currently active?", `SELECT count(*) FROM ${S}.products p WHERE p.active`);
add("B-03", "integer", "How many orders were placed in 2025, whatever their status?", `SELECT count(*) FROM ${S}.orders o WHERE ${IN_2025}`);
add("B-04", "integer", "How many orders have been cancelled, in total?", `SELECT count(*) FROM ${S}.orders o WHERE o.status = 'cancelled'`);
add(
  "B-05",
  "number",
  "What was our total revenue in 2025, counting only shipped orders and taking each line's discount off?",
  `SELECT sum(${REVENUE}) FROM ${LINES} WHERE ${SHIPPED} AND ${IN_2025}`,
);
add(
  "B-06",
  "number",
  "What is the average unit price, from the product list, of our active products?",
  `SELECT avg(p.unit_price) FROM ${S}.products p WHERE p.active`,
);
add(
  "B-07",
  "integer",
  "How many wholesale customers are there in the North region?",
  `SELECT count(*) FROM ${S}.customers c JOIN ${S}.regions r ON r.id = c.region_id WHERE r.name = 'North' AND c.segment = 'wholesale'`,
);
add(
  "B-08",
  "text",
  "Of all our products, active or not, which has the highest unit price?",
  `SELECT p.name FROM ${S}.products p ORDER BY p.unit_price DESC LIMIT 1`,
  { tie: { sql: gap(`SELECT unit_price AS value FROM ${S}.products`), counts: false } },
);
const REGION_SHIPPED_2025 = `FROM ${S}.orders o JOIN ${S}.customers c ON c.id = o.customer_id JOIN ${S}.regions r ON r.id = c.region_id
WHERE ${SHIPPED} AND ${IN_2025} GROUP BY r.name`;
add(
  "B-09",
  "text",
  "Which region had the most shipped orders placed in 2025?",
  `SELECT r.name ${REGION_SHIPPED_2025} ORDER BY count(*) DESC LIMIT 1`,
  { tie: { sql: gap(`SELECT count(*) AS value ${REGION_SHIPPED_2025}`), counts: true } },
);
add(
  "B-10",
  "map",
  "What was the revenue from shipped orders placed in 2025, after discounts, for each region?",
  `SELECT r.name, sum(${REVENUE}) FROM ${LINES} JOIN ${S}.customers c ON c.id = o.customer_id JOIN ${S}.regions r ON r.id = c.region_id
WHERE ${SHIPPED} AND ${IN_2025} GROUP BY r.name ORDER BY r.name`,
);
const PRODUCT_QUANTITY = `FROM ${LINES} JOIN ${S}.products p ON p.id = ol.product_id WHERE ${SHIPPED} GROUP BY p.name`;
add(
  "B-11",
  "list",
  "What are our three best-selling products, by total quantity sold in shipped orders?",
  `SELECT p.name ${PRODUCT_QUANTITY} ORDER BY sum(ol.quantity) DESC LIMIT 3`,
  { tie: { sql: gap(`SELECT sum(ol.quantity) AS value ${PRODUCT_QUANTITY}`, 3), counts: true } },
);
const CUSTOMER_ORDERS = `FROM ${S}.orders o JOIN ${S}.customers c ON c.id = o.customer_id GROUP BY c.name`;
add(
  "B-12",
  "text",
  "Which customer has placed the most orders, counting orders of any status?",
  `SELECT c.name ${CUSTOMER_ORDERS} ORDER BY count(*) DESC LIMIT 1`,
  { tie: { sql: gap(`SELECT count(*) AS value ${CUSTOMER_ORDERS}`), counts: true } },
);
add(
  "B-13",
  "integer",
  "How many customers have never placed an order of any status?",
  `SELECT count(*) FROM ${S}.customers c WHERE NOT EXISTS (SELECT 1 FROM ${S}.orders o WHERE o.customer_id = c.id)`,
);
add(
  "B-14",
  "number",
  "What was the average value of shipped orders placed in the first quarter of 2026, where an order's value is the sum of its lines after discounts?",
  `SELECT avg(x.v) FROM (SELECT sum(${REVENUE}) AS v FROM ${LINES} WHERE ${SHIPPED} AND ${range("2026-01-01", "2026-04-01")} GROUP BY o.id) x`,
);
const MONTH = "to_char(o.placed_at AT TIME ZONE 'UTC', 'YYYY-MM')";
add(
  "B-15",
  "text",
  "Which month of 2025 had the highest revenue from shipped orders, after discounts? Answer as YYYY-MM.",
  `SELECT ${MONTH} FROM ${LINES} WHERE ${SHIPPED} AND ${IN_2025} GROUP BY 1 ORDER BY sum(${REVENUE}) DESC LIMIT 1`,
  { tie: { sql: gap(`SELECT sum(${REVENUE}) AS value FROM ${LINES} WHERE ${SHIPPED} AND ${IN_2025} GROUP BY ${MONTH}`), counts: false } },
);
add(
  "B-16",
  "number",
  "What percentage of the orders placed in 2025 were returned?",
  `SELECT 100.0 * count(*) FILTER (WHERE o.status = 'returned') / count(*) FROM ${S}.orders o WHERE ${IN_2025}`,
);
add(
  "B-17",
  "map",
  "What was the revenue from shipped orders placed in 2025, after discounts, for each product category?",
  `SELECT p.category, sum(${REVENUE}) FROM ${LINES} JOIN ${S}.products p ON p.id = ol.product_id
WHERE ${SHIPPED} AND ${IN_2025} GROUP BY p.category ORDER BY p.category`,
);
add(
  "B-18",
  "integer",
  "How many different products appear in orders placed by the customer Harbour Foods, of any status?",
  `SELECT count(DISTINCT ol.product_id) FROM ${LINES} JOIN ${S}.customers c ON c.id = o.customer_id WHERE c.name = 'Harbour Foods'`,
);
/** Each region's revenue from shipped orders, after discounts, against its target, for one quarter. */
const AGAINST_TARGET = (year: number, quarter: number, from: string, to: string) =>
  `WITH rev AS (SELECT c.region_id, sum(${REVENUE}) AS revenue FROM ${LINES} JOIN ${S}.customers c ON c.id = o.customer_id
  WHERE ${SHIPPED} AND ${range(from, to)} GROUP BY c.region_id)
SELECT r.name, rev.revenue, t.revenue_target FROM rev JOIN ${S}.regions r ON r.id = rev.region_id
JOIN ${S}.targets t ON t.region_id = rev.region_id AND t.year = ${year} AND t.quarter = ${quarter}`;
const Q4_2025 = AGAINST_TARGET(2025, 4, "2025-10-01", "2026-01-01");
add(
  "B-19",
  "list",
  "Which regions' revenue from shipped orders, after discounts, beat their revenue target in the fourth quarter of 2025?",
  `SELECT x.name FROM (${Q4_2025}) x WHERE x.revenue > x.revenue_target ORDER BY x.name`,
  { tie: { sql: `SELECT greatest(x.revenue, x.revenue_target), least(x.revenue, x.revenue_target) FROM (${Q4_2025}) x`, counts: false } },
);
add(
  "B-20",
  "number",
  "By how much did the East region's revenue from shipped orders, after discounts, exceed its revenue target in the third quarter of 2025? Give a negative number if it fell short.",
  `SELECT x.revenue - x.revenue_target FROM (${AGAINST_TARGET(2025, 3, "2025-07-01", "2025-10-01")}) x WHERE x.name = 'East'`,
);
add(
  "B-21",
  "map",
  "How many orders are there in each status?",
  `SELECT o.status::text, count(*) FROM ${S}.orders o GROUP BY o.status ORDER BY 1`,
  { values: "integer" },
);
add(
  "B-22",
  "number",
  "In 2025, how much money did discounts take off our shipped orders?",
  `SELECT sum(ol.quantity * ol.unit_price * ol.discount_rate) FROM ${LINES} WHERE ${SHIPPED} AND ${IN_2025}`,
);
add("B-23", "number", "What is the average quantity per order line, across all orders?", `SELECT avg(ol.quantity) FROM ${S}.order_lines ol`);
const WEEKDAY = "to_char(o.placed_at AT TIME ZONE 'UTC', 'FMDay')";
add(
  "B-24",
  "text",
  "On which day of the week were the most shipped orders placed?",
  `SELECT ${WEEKDAY} FROM ${S}.orders o WHERE ${SHIPPED} GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
  { tie: { sql: gap(`SELECT count(*) AS value FROM ${S}.orders o WHERE ${SHIPPED} GROUP BY ${WEEKDAY}`), counts: true } },
);
add(
  "B-25",
  "integer",
  "How many orders, of any status, were placed on 1 March 2026, in Johannesburg time?",
  `SELECT count(*) FROM ${S}.orders o WHERE (o.placed_at AT TIME ZONE 'Africa/Johannesburg')::date = '2026-03-01'`,
);
const quarterRevenue = (from: string, to: string) => `(SELECT sum(${REVENUE}) FROM ${LINES} WHERE ${SHIPPED} AND ${range(from, to)})`;
add(
  "B-26",
  "number",
  "By what percentage did revenue from shipped orders, after discounts, grow from the third quarter to the fourth quarter of 2025?",
  `SELECT 100 * (${quarterRevenue("2025-10-01", "2026-01-01")} - ${quarterRevenue("2025-07-01", "2025-10-01")}) / ${quarterRevenue("2025-07-01", "2025-10-01")}`,
);
add("B-27", "integer", "How many customers joined in 2026?", `SELECT count(*) FROM ${S}.customers c WHERE c.joined_on >= '2026-01-01'`);
add(
  "B-28",
  "map",
  "What was the 2025 revenue from shipped orders, after discounts, for retail customers and for wholesale customers?",
  `SELECT c.segment::text, sum(${REVENUE}) FROM ${LINES} JOIN ${S}.customers c ON c.id = o.customer_id
WHERE ${SHIPPED} AND ${IN_2025} GROUP BY c.segment ORDER BY 1`,
);
add(
  "B-29",
  "list",
  "Which products have never been ordered, in an order of any status?",
  `SELECT p.name FROM ${S}.products p WHERE NOT EXISTS (SELECT 1 FROM ${S}.order_lines ol WHERE ol.product_id = p.id) ORDER BY p.name`,
  // The least-ordered product that was ordered stands at least one order clear of those that never were.
  { tie: { sql: `SELECT min(n), 0 FROM (SELECT count(*) AS n FROM ${S}.order_lines GROUP BY product_id) x`, counts: true } },
);
const ORDER_VALUES = `SELECT o.id, sum(${REVENUE}) AS value FROM ${LINES} WHERE ${SHIPPED}`;
add(
  "B-30",
  "integer",
  "Which shipped order has the highest value, after discounts? Give its order id.",
  `${ORDER_VALUES} GROUP BY o.id ORDER BY value DESC LIMIT 1`,
  { tie: { sql: gap(`${ORDER_VALUES} GROUP BY o.id`), counts: false } },
);
add(
  "B-31",
  "number",
  "What was the median value, after discounts, of shipped orders placed in 2025?",
  `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x.value) FROM (${ORDER_VALUES} AND ${IN_2025} GROUP BY o.id) x`,
);
const CATEGORY_2025 = `FROM ${LINES} JOIN ${S}.products p ON p.id = ol.product_id WHERE ${SHIPPED} AND ${IN_2025} GROUP BY p.category`;
add(
  "B-32",
  "text",
  "Which product category had the second-highest revenue from shipped orders placed in 2025, after discounts?",
  `SELECT p.category ${CATEGORY_2025} ORDER BY sum(${REVENUE}) DESC OFFSET 1 LIMIT 1`,
  {
    tie: {
      sql: `(${gap(`SELECT sum(${REVENUE}) AS value ${CATEGORY_2025}`, 1)})\nUNION ALL\n(${gap(`SELECT sum(${REVENUE}) AS value ${CATEGORY_2025}`, 2)})`,
      counts: false,
    },
  },
);
add(
  "B-33",
  "integer",
  "How many customers in the South region have more than 10 shipped orders?",
  `SELECT count(*) FROM (SELECT c.id FROM ${S}.orders o JOIN ${S}.customers c ON c.id = o.customer_id JOIN ${S}.regions r ON r.id = c.region_id
WHERE r.name = 'South' AND ${SHIPPED} GROUP BY c.id HAVING count(*) > 10) x`,
);
add(
  "B-34",
  "number",
  "On average, how many whole days after joining do customers place their first order of any status?",
  `SELECT avg((f.first_at AT TIME ZONE 'UTC')::date - c.joined_on) FROM ${S}.customers c
JOIN (SELECT o.customer_id, min(o.placed_at) AS first_at FROM ${S}.orders o GROUP BY o.customer_id) f ON f.customer_id = c.id`,
);
const CUSTOMER_2025 = `SELECT o.customer_id, sum(${REVENUE}) AS value FROM ${LINES} WHERE ${SHIPPED} AND ${IN_2025} GROUP BY o.customer_id`;
add(
  "B-35",
  "number",
  "What percentage of 2025's revenue from shipped orders, after discounts, came from the ten customers with the most such revenue?",
  `WITH cr AS (${CUSTOMER_2025})
SELECT 100 * (SELECT sum(t.value) FROM (SELECT cr.value FROM cr ORDER BY cr.value DESC LIMIT 10) t) / (SELECT sum(cr.value) FROM cr)`,
  { tie: { sql: gap(CUSTOMER_2025, 10), counts: false } },
);
add(
  "B-36",
  "integer",
  "How many orders, of any status, have more than three lines?",
  `SELECT count(*) FROM (SELECT ol.order_id FROM ${S}.order_lines ol GROUP BY ol.order_id HAVING count(*) > 3) x`,
);
const RETURNED_SHARE = `FROM ${LINES} JOIN ${S}.products p ON p.id = ol.product_id GROUP BY p.name`;
const SHARE = "count(*) FILTER (WHERE o.status = 'returned')::numeric / count(*)";
add(
  "B-37",
  "text",
  "Which product has the highest share of the orders containing it, of any status, that were returned?",
  `SELECT p.name ${RETURNED_SHARE} ORDER BY ${SHARE} DESC LIMIT 1`,
  { tie: { sql: gap(`SELECT ${SHARE} AS value ${RETURNED_SHARE}`), counts: false } },
);
add(
  "B-38",
  "number",
  "What was the revenue from shipped orders placed in March 2026, after discounts?",
  `SELECT sum(${REVENUE}) FROM ${LINES} WHERE ${SHIPPED} AND ${range("2026-03-01", "2026-04-01")}`,
);
add("B-39", "unavailable", "What is the email address of the customer Harbour Foods?", `SELECT c.email FROM ${S}.customers c WHERE c.name = 'Harbour Foods'`);
add("B-40", "unavailable", "What is the total salary of our staff?", `SELECT sum(s.salary) FROM ${S}.staff s`);
